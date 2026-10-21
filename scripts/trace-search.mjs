#!/usr/bin/env node
/**
 * 种子搜索 —— 在「新规则层」这一侧（毫秒级）批量试跑候选种子，
 * 找出**既跑满 120 秒、又覆盖全部十条结算路径**的种子。
 *
 * ```
 * node scripts/trace-search.mjs [--from 20240101] [--count 60] [--diff 1|2|all]
 * ```
 *
 * 为什么需要它（`legacy-patch-spec.md` §6.5）：
 * FEVER 需要连续 50 连击，而长按怪会独占一轨 → 该轨普通怪必然触线漏怪 →
 * 连击被打断。哪些种子能攒够连击**取决于随机数**，只能实测。
 *
 * 搜索只看新规则层（新侧回放一局 ~0.2 秒，比浏览器快两个数量级），
 * 选出来的种子再用旧 harness 逐帧验证。
 */

import { replayTrace } from './replay-new.mjs';
import { analyzeCoverage } from './trace-coverage.mjs';
import { DIFFICULTIES, FRAMES } from './trace-spec.mjs';

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

const options = parseArgs(process.argv.slice(2));
const from = Number(options.from ?? 20240101);
const count = Number(options.count ?? 60);
const diffs = options.diff === 'all' || options.diff === undefined ? DIFFICULTIES : [Number(options.diff)];

/** 十条必须覆盖的路径。 */
const REQUIRED = [
  'normalKill',
  'critKill',
  'killPair',
  'pairExpire',
  'pairBreach',
  'completeLong',
  'failLong',
  'missLong',
  'hurtPlayer',
  'fever',
];

const results = [];
for (const diff of diffs) {
  for (let i = 0; i < count; i++) {
    const seed = (from + i) >>> 0;
    const { trace } = replayTrace({ mode: 'A', seed, diff, frames: FRAMES });
    const hits = analyzeCoverage(trace);
    const missing = REQUIRED.filter((k) => hits[k] === 0);
    const last = trace[trace.length - 1];
    results.push({
      diff,
      seed,
      frames: trace.length,
      full: trace.length === FRAMES,
      hp: last.hp,
      maxCombo: last.maxCombo,
      missing,
      hits,
    });
  }
}

for (const diff of diffs) {
  const rows = results.filter((r) => r.diff === diff);
  const perfect = rows.filter((r) => r.missing.length === 0 && r.full);
  console.log(`\n══ 难度 ${diff}★  候选 ${rows.length} 个 ══`);
  console.log(`   跑满 120 秒：${rows.filter((r) => r.full).length} 个`);
  console.log(`   十路径全覆盖：${perfect.length} 个`);
  for (const r of perfect.slice(0, 12)) {
    console.log(
      `   ✔ seed=${r.seed} 帧数=${r.frames} hp=${r.hp} maxCombo=${r.maxCombo} ` +
        Object.entries(r.hits)
          .map(([k, v]) => `${k}:${v}`)
          .join(' '),
    );
  }
  const ranked = [...rows].sort(
    (a, b) => a.missing.length - b.missing.length || b.maxCombo - a.maxCombo,
  );
  console.log('   —— 覆盖最全的前 5 个 ——');
  for (const r of ranked.slice(0, 5)) {
    console.log(
      `   ${r.missing.length === 0 ? '✔' : '…'} seed=${r.seed} 帧数=${r.frames} ` +
        `hp=${r.hp} maxCombo=${r.maxCombo} 缺=[${r.missing.join(',')}]`,
    );
  }
}
