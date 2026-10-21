#!/usr/bin/env node
/**
 * **Golden trace 保真门禁** —— 票 03 的 CI 红线。
 *
 * ```
 * node scripts/trace-gate.mjs                # 跑全部模式
 * node scripts/trace-gate.mjs --mode A       # 只跑模式 A
 * node scripts/trace-gate.mjs --out traces/  # 把轨迹落盘（调试用）
 * ```
 *
 * 三种比对模式（`brief-03.md` 末尾的修正版）：
 *
 * | 模式 | 旧 harness | 新规则层 | 要求 |
 * |---|---|---|---|
 * | **A** | D1 修 + D2 修 | D1 修 + D2 修 | **逐帧完全一致 → 门禁** |
 * | **B′** | D2 修，**保留 D1 bug** | D2 修，**保留 D1 bug** | **逐帧完全一致 → 门禁** |
 * | C | 原样旧版（保留 D1 bug） | D1 修 | 报告第一处分叉 + 归因，**非门禁** |
 *
 * 模式 B′ 是 A 的**对照组**：两边都保留旧的 `clearLane` bug → 逐帧一致，
 * 以此证明「除了 D1，新旧完全等价」；模式 C 再单独展示 D1 的全部影响面。
 *
 * 此外还有一组**零输入场景**（`mode: 'idle'`）：不按任何键 → 所有怪物必然触线
 * 漏怪 → 血量归零 → `gameOverNow()`。这是唯一一组能走到 game over 的轨迹 ——
 * 没有它，「血量归零 → 结算 → 进入 over 态」这段没有任何保真保护。
 *
 * **退出码**：0 = 全部通过；1 = 门禁失败（有分叉）；2 = 用法 / 环境错误。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runLegacyTrace } from './legacy/trace-legacy.mjs';
import { writeHarness } from './legacy/patch-legacy.mjs';
import { replayTrace } from './replay-new.mjs';
import { analyzeCoverage } from './trace-coverage.mjs';
import { DIFFICULTIES, FRAMES, IDLE_FRAMES, SEEDS } from './trace-spec.mjs';

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      i++;
    }
  }
  return options;
}

/** 逐帧比对（与 `scripts/compare-trace.mjs` 同一套规则，1e-9 容差）。 */
function diffFrames(a, b) {
  const EXACT = [
    'frame',
    'rulesDraws',
    'phase',
    'hp',
    'score',
    'combo',
    'maxCombo',
    'kills',
    'critCount',
    'normalCount',
    'frenzyActive',
    'nextFeverAt',
  ];
  const TOLERANT = ['dt', 'feverT', 'now', 'hitX', 'zoneHalf', 'critHalf'];
  const TOL = 1e-9;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    for (const f of EXACT) {
      if (a[i][f] !== b[i][f]) return { frame: i, path: f, kind: 'exact', a: a[i][f], b: b[i][f] };
    }
    for (const f of TOLERANT) {
      const d = Math.abs(a[i][f] - b[i][f]);
      if (!(d <= TOL))
        return { frame: i, path: f, kind: 'tolerant', a: a[i][f], b: b[i][f], delta: d };
    }
    if (a[i].monsters.length !== b[i].monsters.length) {
      return {
        frame: i,
        path: 'monsters.length',
        kind: 'exact',
        a: a[i].monsters.length,
        b: b[i].monsters.length,
      };
    }
    for (let k = 0; k < a[i].monsters.length; k++) {
      for (const f of ['kind', 'lane', 'state']) {
        if (a[i].monsters[k][f] !== b[i].monsters[k][f]) {
          return {
            frame: i,
            path: `monsters[${k}].${f}`,
            kind: 'exact',
            a: a[i].monsters[k][f],
            b: b[i].monsters[k][f],
          };
        }
      }
      for (const f of ['x', 'y', 'w', 'h']) {
        const d = Math.abs(a[i].monsters[k][f] - b[i].monsters[k][f]);
        if (!(d <= TOL)) {
          return {
            frame: i,
            path: `monsters[${k}].${f}`,
            kind: 'tolerant',
            a: a[i].monsters[k][f],
            b: b[i].monsters[k][f],
            delta: d,
          };
        }
      }
    }
    if (JSON.stringify(a[i].script) !== JSON.stringify(b[i].script)) {
      return { frame: i, path: 'script', kind: 'exact', a: a[i].script, b: b[i].script };
    }
  }
  if (a.length !== b.length) {
    return { frame: n, path: 'frameCount', kind: 'exact', a: a.length, b: b.length };
  }
  return null;
}

const options = parseArgs(process.argv.slice(2));
const modes = options.mode ? [String(options.mode)] : ['A', 'Bprime', 'C'];
const outDir = options.out ? String(options.out) : null;

if (outDir) mkdirSync(resolve(outDir), { recursive: true });

/** 各模式的「旧侧 harness 模式」与「新侧回放模式」。 */
const MODE_MATRIX = {
  A: { legacy: 'A', next: 'A', gate: true },
  Bprime: { legacy: 'Bprime', next: 'Bprime', gate: true },
  C: { legacy: 'Bprime', next: 'A', gate: false },
};

/**
 * **零输入场景**（`mode: 'idle'`）—— 唯一一组能走到 game over 的轨迹。
 *
 * 不按任何键 → 所有怪物必然触线漏怪（每只 -20 血）→ 13 次漏怪把 250 血打光
 * → `hp <= 0 → gameOverNow()`。
 *
 * 没有它，「血量归零 → 结算 → 进入 over 态」这段（分数结算 / 连击清零 /
 * FEVER 中断 / `phase` 转换）**没有任何保真保护**：新旧实现在这一段有差异，
 * 门禁会「一致地错」而照绿。
 *
 * 两侧都用**模式 A** 的 harness（D1 修 + D2 修），只有事件剧本不同
 * （`idle` = 零输入）—— 旧 harness 与新回放器共用同一份剧本生成器，
 * 所以两边同时变成零输入，输入序列完全相同。
 */
const IDLE_SCENARIOS = [
  { seed: SEEDS[0], diff: 1 },
  { seed: SEEDS[0], diff: 2 },
];

let failures = 0;
const coverageTotals = {};

// 先把 harness 重新生成一遍 —— 门禁必须跑在**当前**源码打出来的 harness 上，
// 否则 `src/game/trace.ts`（共享事件剧本）改了而 harness 还是旧的，结论就是假的。
for (const mode of modes) {
  const spec = MODE_MATRIX[mode];
  if (!spec) {
    console.error(`未知模式：${mode}（只支持 A | Bprime | C）`);
    process.exit(2);
  }
  writeHarness(spec.legacy);
}

for (const mode of modes) {
  const spec = MODE_MATRIX[mode];
  console.log(`\n══ 模式 ${mode}${spec.gate ? '（门禁）' : '（仅报告）'} ══`);

  for (const seed of SEEDS) {
    for (const diff of DIFFICULTIES) {
      const label = `模式${mode} seed=${seed} ${diff}★`;
      const legacy = await runLegacyTrace({ mode: spec.legacy, seed, diff, frames: FRAMES });
      const next = replayTrace({ mode: spec.next, seed, diff, frames: FRAMES });

      if (outDir) {
        writeFileSync(
          resolve(outDir, `legacy-${spec.legacy}-${seed}-d${diff}.jsonl`),
          legacy.trace.map((f) => JSON.stringify(f)).join('\n') + '\n',
          'utf8',
        );
        writeFileSync(
          resolve(outDir, `new-${spec.next}-${seed}-d${diff}.jsonl`),
          next.trace.map((f) => JSON.stringify(f)).join('\n') + '\n',
          'utf8',
        );
      }

      const d = diffFrames(legacy.trace, next.trace);
      const hits = analyzeCoverage(legacy.trace);
      for (const [k, v] of Object.entries(hits)) coverageTotals[k] = (coverageTotals[k] ?? 0) + v;
      const last = legacy.trace[legacy.trace.length - 1];
      const missing = Object.entries(hits)
        .filter(([, v]) => v === 0)
        .map(([k]) => k);

      if (spec.gate) {
        if (d === null) {
          console.log(
            `  ✅ 一致  ${label}  帧数=${legacy.trace.length} ` +
              `hp=${last.hp} score=${last.score} maxCombo=${last.maxCombo} ` +
              `规则随机=${last.rulesDraws} 覆盖缺失=[${missing.join(',')}]`,
          );
        } else {
          failures += 1;
          console.log(`  ❌ 分叉  ${label}  第 ${d.frame} 帧 \`${d.path}\``);
          console.log(`       旧版 = ${JSON.stringify(d.a)}`);
          console.log(`       新版 = ${JSON.stringify(d.b)}`);
          if (d.delta !== undefined) console.log(`       差值 = ${d.delta}`);
        }
      } else {
        // 模式 C：不门禁，只报告第一处分叉 + 归因
        if (d === null) {
          console.log(`  ⚠️  意外一致  ${label}（D1 应当造成分叉）`);
        } else {
          const lf = legacy.trace[d.frame];
          const nf = next.trace[d.frame];
          const longLegacy = lf.monsters.some((m) => m.kind === 'hold');
          const longNext = nf.monsters.some((m) => m.kind === 'hold');
          console.log(`  ℹ️  分叉  ${label}  第 ${d.frame} 帧 \`${d.path}\``);
          console.log(`       旧版 = ${JSON.stringify(d.a)}   新版 = ${JSON.stringify(d.b)}`);
          console.log(
            `       规则随机消费：旧版 ${lf.rulesDraws} / 新版 ${nf.rulesDraws}` +
              (lf.rulesDraws !== nf.rulesDraws ? '  ← **随机流已错位**' : ''),
          );
          console.log(
            `       长按怪在场：旧版 ${longLegacy} / 新版 ${longNext}` +
              (longLegacy !== longNext ? '  ← **D1：长按怪生成时机不同**' : ''),
          );
          // 归因**按实际证据**打印。
          //
          // D1（`clearLane` 的轨道占用口径不同）的表现是「长按怪生成时机不同 →
          // 规则随机流错位」。没有这两条证据时就不能硬套 D1 ——
          // 那会把真正的回归伪装成「已知差异」。
          const evidence = [];
          if (lf.rulesDraws !== nf.rulesDraws) evidence.push('规则随机流错位');
          if (longLegacy !== longNext) evidence.push('长按怪在场状态不同');
          if (evidence.length > 0) {
            console.log(`       归因证据：${evidence.join('、')}`);
            console.log(
              '       归因：D1（clearLane 的轨道占用口径不同 → 长按怪生成时机不同 → ' +
                '规则随机流错位），属**已知差异**，不是回归。',
            );
          } else {
            console.log(
              '       归因证据不足（随机流未错位、长按怪在场状态一致）—— ' +
                '**不是**已知的 D1 差异，请按回归排查。',
            );
          }
        }
      }
    }
  }
}

// ── 零输入场景（不按任何键 → 走到 game over）────────────────────
//
// 独立于「模式 × 种子 × 难度」矩阵：它固定用**模式 A** 的 harness，
// 只把事件剧本换成 `mode: 'idle'`（零输入）。
//
// 放在模式循环**之外**：它是门禁条件本身，任何 `--mode` 子集都必须包含它 ——
// 否则「game over」这条路径在覆盖统计里恒为 0（覆盖退化 → 门禁变红）。
console.log('\n══ 零输入场景（不按任何键 → 走到 game over） ══');
writeHarness('A');
for (const sc of IDLE_SCENARIOS) {
  const label = `零输入 seed=${sc.seed} ${sc.diff}★`;
  const legacy = await runLegacyTrace({
    mode: 'A',
    seed: sc.seed,
    diff: sc.diff,
    frames: IDLE_FRAMES,
    scriptMode: 'idle',
  });
  const next = replayTrace({
    mode: 'A',
    seed: sc.seed,
    diff: sc.diff,
    frames: IDLE_FRAMES,
    scriptMode: 'idle',
  });

  if (outDir) {
    writeFileSync(
      resolve(outDir, `legacy-idle-${sc.seed}-d${sc.diff}.jsonl`),
      legacy.trace.map((f) => JSON.stringify(f)).join('\n') + '\n',
      'utf8',
    );
    writeFileSync(
      resolve(outDir, `new-idle-${sc.seed}-d${sc.diff}.jsonl`),
      next.trace.map((f) => JSON.stringify(f)).join('\n') + '\n',
      'utf8',
    );
  }

  const d = diffFrames(legacy.trace, next.trace);
  const hits = analyzeCoverage(legacy.trace);
  for (const [k, v] of Object.entries(hits)) coverageTotals[k] = (coverageTotals[k] ?? 0) + v;

  const last = legacy.trace[legacy.trace.length - 1];
  // 「真的走到了 game over」：末帧必须是 `hp = 0` 且 `phase = 'over'` 的**终态帧**。
  // 少了这一条，这条场景就可能永远不触发 —— 变成一个装饰品。
  const reachedGameOver = !!last && last.hp === 0 && last.phase === 'over';

  if (d === null && reachedGameOver) {
    console.log(
      `  ✅ 一致  ${label}  帧数=${legacy.trace.length} ` +
        `hp=${last.hp} phase=${last.phase} score=${last.score} ` +
        `maxCombo=${last.maxCombo} 规则随机=${last.rulesDraws}`,
    );
  } else {
    failures += 1;
    if (!reachedGameOver) {
      console.error(
        `  ❌ 没走到 game over  ${label}  末帧 hp=${last ? last.hp : '无'} ` +
          `phase=${last ? last.phase : '无'}（期望 hp=0 且 phase=over）`,
      );
    }
    if (d !== null) {
      console.error(`  ❌ 分叉  ${label}  第 ${d.frame} 帧 \`${d.path}\``);
      console.error(`       旧版 = ${JSON.stringify(d.a)}`);
      console.error(`       新版 = ${JSON.stringify(d.b)}`);
      if (d.delta !== undefined) console.error(`       差值 = ${d.delta}`);
    }
  }
}

console.log('\n══ 十一条结算路径覆盖合计（全部轨迹的并集） ══');
const LABELS = {
  normalKill: '普通怪普攻',
  critKill: '普通怪暴击',
  killPair: '双生补齐 killPair',
  pairExpire: '双生窗口过期 resolvePairSolo + pairBlast',
  pairBreach: '双生双轨同时触线',
  completeLong: '长按完整贯穿 completeLong',
  failLong: '长按不足 3 秒 failLong',
  missLong: '长按漏过 missLong',
  hurtPlayer: '普通怪触线漏怪 hurtPlayer',
  fever: 'FEVER 触发',
  gameOver: 'game over 结算（血量归零 → over）',
};
for (const [k, label] of Object.entries(LABELS)) {
  const n = coverageTotals[k] ?? 0;
  console.log(`   ${n > 0 ? '✔' : '✘'} ${label}: ${n}`);
}

// 覆盖退化必须让门禁变红。
//
// 逐帧比对只能发现「新旧实现不一致」；如果某条结算路径在**两侧同时**变得不可达
// （例如共享事件剧本被改动，不再触发双生窗口过期），
// 逐帧比对会「一致地错」而照绿 —— 门禁从此静默失去对这条路径的覆盖。
// 所以路径覆盖是独立的门禁条件：**全部轨迹的并集**必须覆盖全部十一条路径
// （含 `gameOver` —— 它只由零输入场景触发）。
const uncovered = Object.keys(LABELS).filter((k) => (coverageTotals[k] ?? 0) === 0);
if (uncovered.length > 0) {
  failures += 1;
  console.error(
    `\n❌ 结算路径覆盖退化：以下路径在全部轨迹中一次都没被触发 → ` +
      uncovered.map((k) => `${LABELS[k]}(${k})`).join('、'),
  );
}

if (failures > 0) {
  console.error(`\n❌ Golden trace 门禁失败：${failures} 项不满足`);
  process.exit(1);
}
console.log('\n✅ Golden trace 门禁通过');
