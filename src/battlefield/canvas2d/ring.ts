/**
 * 冲击环 —— 逐字搬自 `source.html:2426-2442`（`drawRings`）。
 *
 * 注意旧代码**没有** `save` / `restore`，而是在循环后手动把 `globalAlpha` 复位
 * —— 这里保持原样（`draw-port-map-b.md` §5.7 的提醒：alpha 复位必须保留）。
 */

import type { FrameContext } from './context';
import { clamp, easeOutCubic, lerp } from './math';

export class RingView {
  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    for (const r of fc.effects.rings) {
      const p = clamp(r.t / r.life, 0, 1);
      const rad = lerp(r.r0, r.r1, easeOutCubic(p));
      const a = 1 - p;
      ctx.strokeStyle = r.color;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.globalAlpha = a * 0.24;
      ctx.lineWidth = 10 * a + 3;
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.lineWidth = 3.2 * a + 0.6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
