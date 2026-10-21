#!/usr/bin/env node
/**
 * Golden trace 的**路径覆盖分析器** —— 从逐帧快照里读出
 * `legacy-semantics.md` §6.3 那十条结算路径各自有没有被走到。
 *
 * ```
 * node scripts/trace-coverage.mjs <trace.jsonl> [更多 trace.jsonl ...]
 * ```
 *
 * 判定全部基于**快照可观测量**（不依赖任何内部计数器）：
 *
 * | 路径 | 快照上的特征 |
 * |---|---|
 * | 普通怪普攻 | `kills` +1 且 `critCount` 不变 |
 * | 普通怪暴击 | `critCount` +1 |
 * | 双生补齐 `killPair` | 同一帧 `kills` +2 |
 * | 双生窗口过期 `resolvePairSolo` + `pairBlast` | `hp` -20 且 `kills` +1 且 `score` 只 +200/300 |
 * | 双生双轨同时触线 | `hp` -20 且 `kills` 不变 |
 * | 长按完整贯穿 `completeLong` | `kills` +1 且 `score` +600 |
 * | 长按不足 3 秒 `failLong` | `combo` 归零且 `hp` 不变 |
 * | 长按漏过 `missLong` | 同上（怪状态 `hold-escaped`） |
 * | 普通怪触线漏怪 `hurtPlayer` | `hp` -20 且 `combo` 归零 |
 * | FEVER 触发 | `frenzyActive` 由 false 变 true |
 */

import { readFileSync } from 'node:fs';

/** 读 JSONL。 */
function readTrace(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l));
}

/** 分析一条 trace 的路径覆盖。 */
export function analyzeCoverage(frames) {
  const hits = {
    normalKill: 0,
    critKill: 0,
    killPair: 0,
    pairExpire: 0,
    pairBreach: 0,
    completeLong: 0,
    failLong: 0,
    missLong: 0,
    hurtPlayer: 0,
    fever: 0,
  };
  let prev = null;
  for (const f of frames) {
    if (!prev) {
      prev = f;
      continue;
    }
    const dKills = f.kills - prev.kills;
    const dCrit = f.critCount - prev.critCount;
    const dScore = f.score - prev.score;
    const dHp = f.hp - prev.hp;

    if (dHp < 0) {
      // 掉血：区分「双生自爆 / 双生触线 / 普通怪漏怪」
      if (dKills === 1 && (dScore === 200 || dScore === 300)) hits.pairExpire++;
      else if (dKills === 0 && prev.monsters.filter((m) => m.kind === 'twin').length >= 2) {
        hits.pairBreach++;
      } else hits.hurtPlayer++;
    }
    if (dKills === 2) hits.killPair++;
    else if (dKills === 1) {
      if (dCrit > 0) hits.critKill++;
      else hits.normalKill++;
    }
    // 长按怪：靠「怪的状态变化 / 离场」判定，比分数可靠
    //   completeLong → 怪从数组里消失（且消失前是 hold-holding）
    //   failLong    → hold-holding → hold-escaped
    //   missLong    → hold → hold-escaped（从没按住过）
    for (const m of prev.monsters) {
      if (m.kind !== 'hold') continue;
      const now = f.monsters.find((x) => x.kind === 'hold' && x.lane === m.lane);
      if (!now) {
        if (m.state === 'hold-holding') hits.completeLong++;
        continue;
      }
      if (m.state === 'hold-holding' && now.state === 'hold-escaped') hits.failLong++;
      else if (m.state === 'hold' && now.state === 'hold-escaped') hits.missLong++;
    }
    if (!prev.frenzyActive && f.frenzyActive) hits.fever++;
    prev = f;
  }
  return hits;
}

const COVERAGE_LABELS = {
  normalKill: '普通怪普攻',
  critKill: '普通怪暴击',
  killPair: '双生补齐 killPair',
  pairExpire: '双生窗口过期 resolvePairSolo+pairBlast',
  pairBreach: '双生双轨同时触线',
  completeLong: '长按完整贯穿 completeLong',
  failLong: '长按不足 3 秒 failLong',
  missLong: '长按漏过 missLong',
  hurtPlayer: '普通怪触线漏怪 hurtPlayer',
  fever: 'FEVER 触发',
};

if (process.argv[1] && process.argv[1].endsWith('trace-coverage.mjs')) {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('用法：node scripts/trace-coverage.mjs <trace.jsonl> [...]');
    process.exit(2);
  }
  const totals = {};
  for (const path of paths) {
    const frames = readTrace(path);
    const hits = analyzeCoverage(frames);
    const last = frames[frames.length - 1];
    console.log(
      `\n── ${path}  帧数=${frames.length} 末帧 now=${last.now.toFixed(2)}s ` +
        `hp=${last.hp} score=${last.score} maxCombo=${last.maxCombo}`,
    );
    for (const [key, label] of Object.entries(COVERAGE_LABELS)) {
      totals[key] = (totals[key] ?? 0) + hits[key];
      console.log(`   ${hits[key] > 0 ? '✔' : '✘'} ${label}: ${hits[key]}`);
    }
  }
  console.log('\n══ 合计 ══');
  for (const [key, label] of Object.entries(COVERAGE_LABELS)) {
    console.log(`   ${totals[key] > 0 ? '✔' : '✘'} ${label}: ${totals[key]}`);
  }
}
