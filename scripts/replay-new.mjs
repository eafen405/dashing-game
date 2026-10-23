#!/usr/bin/env node
/**
 * 新规则层回放器 —— 喂**同一种子** + **同一份事件流**，产出与旧版同格式的轨迹。
 *
 * ```
 * node scripts/replay-new.mjs --mode A --seed 20240101 --diff 1 \
 *   --frames 7200 --out traces/new-A-20240101-d1.jsonl
 * ```
 *
 * 与旧版 harness 的**严格对称**：
 *
 * | | 旧版 harness | 新规则层回放器 |
 * |---|---|---|
 * | 布局 | `resize()` 算出的常量（900×600） | `computeLayout(900, 600, 1)` |
 * | 时钟 | 固定 `dt = 1/60`，`now += dt` | 固定 `dt = 1/60`，`tick()` 内部累加 |
 * | 事件 | `__traceScript.nextEvents(prevSnapshot, script)` | **同一个函数** |
 * | PRNG | `mulberry32(seed)` | `createRng(seed)`（逐字等价） |
 * | 快照 | `__traceScript.makeTraceFrame(...)` | `traceFrameFromState(...)` |
 *
 * **模式 B′**：`--mode Bprime` 时用 `createGameState({ legacyClearLane: true })`
 * 把 `clearLane()` 切回旧实现的错误口径 —— 两边都保留 bug → 逐帧应当完全一致。
 * 这个开关**只在规则层内部可达**，生产路径（`reduce` 的 `Start` 事件）拿不到。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, resolve } from 'node:path';

register('./legacy/ts-resolve.mjs', import.meta.url);

const { DT, FRAMES, VIEWPORT } = await import('./trace-spec.mjs');
const game = await import('../src/game/index.ts');

/**
 * 回放一局，返回逐帧快照。
 *
 * @param {{mode?: string, seed?: number, diff?: number, frames?: number, scriptMode?: 'active'|'idle'}} options
 */
export function replayTrace(options = {}) {
  const mode = options.mode ?? 'A';
  const seed = Number(options.seed ?? 20240101) >>> 0;
  const diff = Number(options.diff ?? 1);
  const frames = Number(options.frames ?? FRAMES);
  // 剧本模式：`idle` = 零输入（一个键都不按）→ 必然漏怪 → 走到 game over。
  const scriptMode = options.scriptMode === 'idle' ? 'idle' : 'active';

  // 模式 A：复现票 02 的 D1 修法（clearLane 只算长按怪占用）。
  // 生产语义是空轨（票 11 回退 D1），所以这个开关只在回放器里打开。
  const legacyClearLane = mode === 'A';

  const layout = game.computeLayout(VIEWPORT.width, VIEWPORT.height, 1);
  const baseRng = game.createRng(seed);
  // 计数包装：统计规则 PRNG 的消费次数（与旧 harness 的 `__rulesDraws` 对齐）。
  // 这个计数进快照 → 任何「多抽 / 少抽一次」都会在**那一帧**被逐帧比对抓到。
  let rulesDraws = 0;
  const rng = {
    next: () => {
      rulesDraws += 1;
      return baseRng.next();
    },
    range: (min, max) => {
      rulesDraws += 1;
      return baseRng.range(min, max);
    },
  };
  let state = game.createGameState({
    diffLevel: diff,
    seed,
    layout,
    // 旧版没有角色被动：golden trace 固定走 250 血基线。
    characterId: null,
    legacyClearLane,
    // 旧版没有上下轨触碰判定：golden trace 只比较规则核心。
    legacyCollision: true,
  });
  let script = game.createScriptState(scriptMode);
  let prevSnapshot = null;

  const trace = [];
  for (let frame = 0; frame < frames; frame++) {
    // 对齐旧版 `__stepFrames`：非 running 立刻停
    if (state.phase !== 'running') break;

    // 1) 事件：与旧版 harness 用的是**同一个**生成器（快照的纯函数）
    const r = game.nextEvents(prevSnapshot, script);
    script = r.script;
    for (const ev of r.events) {
      if (ev.type === 'press') {
        state = game.reduce(state, { type: 'Press', lane: ev.lane, inputId: ev.id }, rng).state;
      } else if (ev.type === 'release') {
        state = game.reduce(state, { type: 'Release', inputId: ev.id }, rng).state;
      } else if (ev.type === 'cancel-hold') {
        state = game.reduce(state, { type: 'CancelHold' }, rng).state;
      }
    }

    // 2) 推进一帧（`tick` 内部用重复加法累加 `now`）
    state = game.reduce(state, { type: 'Tick', dt: DT }, rng).state;

    // 3) 记录快照（过滤 `removed` 的怪 —— 与旧版「当场移除」对称）
    //
    //    **终态帧也要记**：`phase` 变成 `over` 的那一帧（hp = 0）是
    //    「血量归零 → 结算 → 进入 over 态」**唯一**的快照证据 —— 分数结算、
    //    连击清零、FEVER 中断、`phase` 转换全都在这一帧上。漏掉它，
    //    game over 路径就完全没有保真保护（门禁会「一致地错」而照绿）。
    //    旧版 `__recordFrame()` 同步改成记这一帧（见 patch-legacy.mjs）——
    //    两边共用 `shouldRecordPhase()`，必须同时停在同一帧上。
    if (!game.shouldRecordPhase(state.phase)) break;
    const snapshot = game.traceFrameFromState(state, frame, DT, script, rulesDraws);
    trace.push(snapshot);
    prevSnapshot = snapshot;
  }

  return { trace, phase: state.phase };
}

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

// ── CLI ──────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('replay-new.mjs')) {
  const options = parseArgs(process.argv.slice(2));
  const mode = String(options.mode ?? 'A');
  const seed = Number(options.seed ?? 20240101);
  const diff = Number(options.diff ?? 1);
  const frames = Number(options.frames ?? FRAMES);
  const out = options.out ? String(options.out) : null;

  const { trace, phase } = replayTrace({ mode, seed, diff, frames });

  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, trace.map((f) => JSON.stringify(f)).join('\n') + '\n', 'utf8');
  }

  const last = trace[trace.length - 1];
  console.log(
    `[replay-new] mode=${mode} seed=${seed} diff=${diff} ` +
      `帧数=${trace.length} 结束状态=${phase}` +
      (last
        ? ` hp=${last.hp} score=${last.score} combo=${last.combo} maxCombo=${last.maxCombo}`
        : ''),
  );
  if (out) console.log(`[replay-new] → ${out}`);
}
