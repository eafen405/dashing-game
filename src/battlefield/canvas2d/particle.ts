/**
 * 粒子 —— 逐字搬自 `source.html:2444-2454`（`drawParticles`），票 07 加了三种形态。
 *
 * 半径随寿命线性收缩到 0.4，alpha 同步衰减。
 * 同样保持旧代码的手动 `globalAlpha` 复位。
 *
 * 形态与 Pixi 版一一对应（`src/battlefield/pixi/particle.ts`）：
 *
 * | 形态 | 形状 | 说明 |
 * |---|---|---|
 * | `spark` | 圆 | 旧版逐字照搬 |
 * | `shard` | 沿速度方向的细长菱形 | 暴击 |
 * | `ember` | 四角星芒 | FEVER |
 */

import type { FrameContext } from './context';

/** 余烬星芒的内外半径比。 */
const EMBER_INNER_RATIO = 0.28;

export class ParticleView {
  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    for (const p of fc.effects.particles) {
      const a = 1 - p.t / p.life;
      const r = p.r * a + 0.4;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.form === 'shard') {
        this.drawShard(ctx, p.x, p.y, r, p.vx, p.vy);
      } else if (p.form === 'ember') {
        this.drawEmber(ctx, p.x, p.y, r);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** 碎片 —— 沿速度方向的细长菱形。 */
  private drawShard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    vx: number,
    vy: number,
  ): void {
    const half = r * 0.5;
    const len = r * 2.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(vy, vx));
    ctx.beginPath();
    ctx.moveTo(len, 0);
    ctx.lineTo(0, half);
    ctx.lineTo(-len, 0);
    ctx.lineTo(0, -half);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** 余烬 —— 四角星芒。 */
  private drawEmber(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const inner = r * EMBER_INNER_RATIO;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rad = i % 2 === 0 ? r : inner;
      const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(ang) * rad;
      const py = y + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}
