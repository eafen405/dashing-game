#!/usr/bin/env node
/**
 * Golden trace 逐帧比对器 —— **票 03 的主缝（main seam）**。
 *
 * ```
 * node scripts/compare-trace.mjs <旧版 trace.jsonl> <新版 trace.jsonl> [选项]
 * ```
 *
 * 契约：
 * - **输入**：两份 JSONL，每行一帧快照（格式由 `src/game/trace.ts` 定义）。
 * - **输出**：人可读的逐帧 diff；第一处分叉帧 + 字段 + 两边的值。
 * - **退出码**：
 *   - `0` —— 逐帧完全一致（门禁通过）
 *   - `1` —— 存在分叉（门禁失败）
 *   - `2` —— 用法 / IO 错误
 *
 * 比对规则（`scripts/legacy/legacy-patch-spec.md` §7.1）：
 * - **离散字段**（`hp` / `score` / `combo` / `kills` / `frenzyActive` /
 *   `phase` / 怪物的 `kind` / `lane` / `state` / 怪物数量与顺序 / `script`）
 *   → **逐位相等**，不做任何容差。
 * - **连续字段**（`now` / `x` / `y` / `w` / `h` / `feverT` / `hitX` /
 *   `zoneHalf` / `critHalf` / `dt`）→ 容差 `1e-9`，并把实际差值打进报告。
 *   1e-9 比「保留 6 位小数」严格 1000 倍，且不会在 `.5` 边界抖动。
 */

import { readFileSync } from 'node:fs';
import { TOLERANCE } from './trace-spec.mjs';

/** 逐位相等的帧字段。 */
const EXACT_FIELDS = [
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

/** 允许 `1e-9` 容差的帧字段。 */
const TOLERANT_FIELDS = ['dt', 'feverT', 'now', 'hitX', 'zoneHalf', 'critHalf'];

/** 怪物里逐位相等的字段。 */
const EXACT_MONSTER_FIELDS = ['kind', 'lane', 'state'];

/** 怪物里允许容差的字段。 */
const TOLERANT_MONSTER_FIELDS = ['x', 'y', 'w', 'h'];

/** 读 JSONL。 */
function readTrace(path) {
  const text = readFileSync(path, 'utf8');
  const frames = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    frames.push(JSON.parse(trimmed));
  }
  return frames;
}

/** 深比较（只用于 `script` 这种纯离散结构）。 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * 比对两帧，返回第一处差异（`null` = 一致）。
 *
 * @returns {{path: string, kind: 'exact'|'tolerant', a: unknown, b: unknown, delta?: number}|null}
 */
function diffFrame(a, b) {
  for (const field of EXACT_FIELDS) {
    if (a[field] !== b[field]) {
      return { path: field, kind: 'exact', a: a[field], b: b[field] };
    }
  }
  for (const field of TOLERANT_FIELDS) {
    const av = a[field];
    const bv = b[field];
    const delta = Math.abs(av - bv);
    if (!(delta <= TOLERANCE)) {
      return { path: field, kind: 'tolerant', a: av, b: bv, delta };
    }
  }
  const am = a.monsters ?? [];
  const bm = b.monsters ?? [];
  if (am.length !== bm.length) {
    return {
      path: 'monsters.length',
      kind: 'exact',
      a: am.length,
      b: bm.length,
    };
  }
  for (let i = 0; i < am.length; i++) {
    for (const field of EXACT_MONSTER_FIELDS) {
      if (am[i][field] !== bm[i][field]) {
        return {
          path: `monsters[${i}].${field}`,
          kind: 'exact',
          a: am[i][field],
          b: bm[i][field],
        };
      }
    }
    for (const field of TOLERANT_MONSTER_FIELDS) {
      const delta = Math.abs(am[i][field] - bm[i][field]);
      if (!(delta <= TOLERANCE)) {
        return {
          path: `monsters[${i}].${field}`,
          kind: 'tolerant',
          a: am[i][field],
          b: bm[i][field],
          delta,
        };
      }
    }
  }
  if (!deepEqual(a.script, b.script)) {
    return { path: 'script', kind: 'exact', a: a.script, b: b.script };
  }
  return null;
}

/** 解析命令行。 */
function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        options[key] = true;
      } else {
        options[key] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  if (positional.length !== 2) {
    console.error(
      '用法：node scripts/compare-trace.mjs <旧版 trace.jsonl> <新版 trace.jsonl> [--label 文本] [--json]',
    );
    process.exit(2);
  }
  const [legacyPath, newPath] = positional;
  const label = typeof options.label === 'string' ? options.label : `${legacyPath} ↔ ${newPath}`;

  let legacy;
  let next;
  try {
    legacy = readTrace(legacyPath);
    next = readTrace(newPath);
  } catch (err) {
    console.error(`读取 trace 失败：${err.message}`);
    process.exit(2);
  }

  const common = Math.min(legacy.length, next.length);
  let firstDiff = null;
  let diffFrameIndex = -1;
  for (let i = 0; i < common; i++) {
    const d = diffFrame(legacy[i], next[i]);
    if (d) {
      firstDiff = d;
      diffFrameIndex = i;
      break;
    }
  }

  const lengthMismatch = legacy.length !== next.length;
  const ok = firstDiff === null && !lengthMismatch;

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok,
          label,
          legacyFrames: legacy.length,
          newFrames: next.length,
          firstDiffFrame: diffFrameIndex,
          firstDiff,
        },
        null,
        2,
      ),
    );
    process.exit(ok ? 0 : 1);
  }

  if (ok) {
    console.log(`✅ 一致  ${label}  帧数=${legacy.length}`);
    process.exit(0);
  }

  console.log(`❌ 分叉  ${label}`);
  if (lengthMismatch) {
    console.log(
      `   帧数不一致：旧版 ${legacy.length} 帧，新版 ${next.length} 帧` +
        (legacy.length > next.length ? '（旧版多出）' : '（新版多出）'),
    );
  }
  if (firstDiff) {
    console.log(`   第一处分叉：第 ${diffFrameIndex} 帧  字段 \`${firstDiff.path}\``);
    console.log(`     旧版 = ${JSON.stringify(firstDiff.a)}`);
    console.log(`     新版 = ${JSON.stringify(firstDiff.b)}`);
    if (firstDiff.delta !== undefined) {
      console.log(`     差值 = ${firstDiff.delta}（容差 ${TOLERANCE}）`);
    }
    console.log(
      `   上下文（旧版）：now=${legacy[diffFrameIndex]?.now} hp=${legacy[diffFrameIndex]?.hp} ` +
        `combo=${legacy[diffFrameIndex]?.combo} monsters=${legacy[diffFrameIndex]?.monsters?.length}`,
    );
  }
  process.exit(1);
}

main();
