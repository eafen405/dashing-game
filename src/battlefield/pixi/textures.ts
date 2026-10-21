/**
 * 运行时生成的纹理 —— 星空的星点、粒子的圆点。
 *
 * **一次性创建、长期复用**（ADR-0004）。
 * `Texture.from(canvas)` 会建一个 `CanvasSource`（GPU 纹理），
 * 所以不用时必须 `destroy()`。
 */

import { Texture } from 'pixi.js';

/**
 * 白色实心圆点纹理（`size` × `size`，圆心在中间，半径 = `size/2`）。
 *
 * 用途：
 *
 * - 星空的星点（旧版是 `ctx.arc` 画的硬边小圆；用精灵 + 线性过滤后
 *   在 1~3 px 的尺寸上肉眼无差别，但**省掉了每帧 90 次圆弧细分**）。
 * - 粒子的圆点（`ParticleContainer` 要求所有粒子共用同一张纹理，
 *   颜色与大小分别走 `tint` / `scaleX,scaleY`）。
 */
export function createDotTexture(size: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  return Texture.from(canvas);
}

/** 星点纹理边长（px）。 */
export const STAR_TEXTURE_SIZE = 8;

/** 粒子纹理边长（px）。 */
export const PARTICLE_TEXTURE_SIZE = 8;

/** 粒子纹理的基准半径（px）—— 粒子实际半径 = `基准半径 × scale`。 */
export const PARTICLE_BASE_RADIUS = PARTICLE_TEXTURE_SIZE / 2;
