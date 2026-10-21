/**
 * 渲染层数值小工具 —— 与 `src/battlefield/canvas2d/math.ts` 口径一致。
 *
 * `clamp` 规则层已经导出（`src/game/math.ts`），这里直接复用，避免两处漂移；
 * 其余三个是纯渲染用的缓动，规则层没有用到，所以留在渲染层。
 */

import { clamp } from '../../game/math';

export { clamp };

/** 线性插值 —— `source.html:495`。 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 缓出三次方 —— `source.html:496`。 */
export function easeOutCubic(t: number): number {
  t = clamp(t, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

/** 缓入缓出三次方 —— `source.html:497`。 */
export function easeInOutCubic(t: number): number {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 旧 `rand(a,b)`（`source.html:493`）—— 表现层视觉随机专用，不消费规则层 PRNG。 */
export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
