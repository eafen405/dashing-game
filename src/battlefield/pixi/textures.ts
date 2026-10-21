/**
 * 运行时生成的纹理 —— 星空的星点、粒子的三种形态。
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
 * - 普攻粒子（`ParticleContainer` 要求所有粒子共用同一张纹理，
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

/**
 * 碎片纹理 —— 细长菱形（长轴水平）。
 *
 * 暴击粒子专用：长:宽 ≈ 2.6:1，渲染时按速度方向旋转，
 * 看起来像一道被甩出的光屑（和普攻的圆点一眼能分开）。
 */
export function createShardTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = SHARD_TEXTURE_W;
  canvas.height = SHARD_TEXTURE_H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const w = SHARD_TEXTURE_W;
    const h = SHARD_TEXTURE_H;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h / 2);
    ctx.closePath();
    ctx.fill();
  }
  return Texture.from(canvas);
}

/**
 * 余烬纹理 —— 四角星芒。
 *
 * FEVER 粒子专用：四角星（比圆点多两个尖角），
 * 加上暖金配色与更长的寿命，一眼能跟普攻 / 暴击分开。
 */
export function createEmberTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = EMBER_TEXTURE_SIZE;
  canvas.height = EMBER_TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const c = EMBER_TEXTURE_SIZE / 2;
    const outer = EMBER_TEXTURE_SIZE / 2;
    const inner = EMBER_TEXTURE_SIZE / 7;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
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

/** 碎片纹理宽度（px）。 */
export const SHARD_TEXTURE_W = 16;
/** 碎片纹理高度（px）。 */
export const SHARD_TEXTURE_H = 8;
/** 碎片纹理的基准半径（px）—— 取高度的一半（半径语义与圆点一致）。 */
export const SHARD_BASE_RADIUS = SHARD_TEXTURE_H / 2;
/** 碎片的长宽比系数（长轴相对圆点基准半径的拉伸）。 */
export const SHARD_LENGTH_RATIO = 0.65;

/** 余烬纹理边长（px）。 */
export const EMBER_TEXTURE_SIZE = 16;
/** 余烬纹理的基准半径（px）。 */
export const EMBER_BASE_RADIUS = EMBER_TEXTURE_SIZE / 2;
