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
 * **退出码**：0 = 全部通过；1 = 门禁失败（有分叉）；2 = 用法 / 环境错误。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runLegacyTrace } from './legacy/trace-legacy.mjs';
import { replayTrace } from './replay-new.mjs';
import { analyzeCoverage } from './trace-coverage.mjs';
import { DIFFICULTIES, FRAMES, SEEDS } from './trace-spec.mjs';

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
      if (!(d <= TOL)) return { frame: i, path: f, kind: 'tolerant', a: a[i][f], b: b[i][f], delta: d };
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

let failures = 0;
const coverageTotals = {};

for (const mode of modes) {
  const spec = MODE_MATRIX[mode];
  if (!spec) {
    console.error(`未知模式：${mode}（只支持 A | Bprime | C）`);
    process.exit(2);
  }
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
          console.log(
            '       归因：D1（clearLane 的轨道占用口径不同 → 长按怪生成时机不同 → ' +
              '规则随机流错位），属**已知差异**，不是回归。',
          );
        }
      }
    }
  }
}

console.log('\n══ 十条结算路径覆盖合计（模式 A 的旧版轨迹） ══');
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
};
for (const [k, label] of Object.entries(LABELS)) {
  const n = coverageTotals[k] ?? 0;
  console.log(`   ${n > 0 ? '✔' : '✘'} ${label}: ${n}`);
}

if (failures > 0) {
  console.error(`\n❌ Golden trace 门禁失败：${failures} 条轨迹出现分叉`);
  process.exit(1);
}
console.log('\n✅ Golden trace 门禁通过');
