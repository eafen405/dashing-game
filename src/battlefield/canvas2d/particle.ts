/**
 * 粒子 —— 逐字搬自 `source.html:2444-2454`（`drawParticles`）。
 *
 * 半径随寿命线性收缩到 0.4，alpha 同步衰减。
 * 同样保持旧代码的手动 `globalAlpha` 复位。
 */

import type { FrameContext } from './context';

export class ParticleView {
  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    for (const p of fc.effects.particles) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * a + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
