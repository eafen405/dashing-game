/**
 * 刷新节奏 —— `source.html:733-746` 的纯函数化。
 */

import { DIFFS, SPEED_BASE, SPEED_MAX, SPEED_RAMP } from '../constants';
import { clamp } from '../math';
import type { Rng } from '../rng';
import type { Difficulty } from '../types';

/**
 * 当前难度系数 —— `source.html:1287`。
 *
 * 旧实现把它存成一个全局变量，但它完全由 `now` 决定，
 * 所以这里改成推导函数，省掉一个可能与 `now` 不一致的状态字段。
 */
export function difficultyAt(now: number): number {
  return Math.min(now * 0.075, 10);
}

/**
 * 下一次生成的间隔（秒）—— `source.html:733-738`。
 *
 * 消耗**一次** PRNG（`rand(-0.12, 0.16)`）。
 */
export function spawnInterval(difficulty: number, diffLevel: Difficulty, rng: Rng): number {
  const base = 1.28 - difficulty * 0.045;
  const raw = clamp(base + rng.range(-0.12, 0.16), 0.62, 1.45);
  // 2 星：刷新频率翻倍（间隔减半）
  return raw / DIFFS[diffLevel].spawnMul;
}

/**
 * 当前移速（px/s）—— `source.html:740-746`。
 *
 * 不消耗 PRNG。
 */
export function speedNow(now: number, diffLevel: Difficulty): number {
  // 随时间平滑升速，到达上限后保持不变
  const t = clamp(now / SPEED_RAMP, 0, 1);
  const k = t * t * (3 - 2 * t); // smoothstep，起步缓、中段快、末段收敛
  const mul = DIFFS[diffLevel].speedMul;
  return (SPEED_BASE + (SPEED_MAX - SPEED_BASE) * k) * mul;
}
