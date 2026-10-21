/**
 * 冲击环 —— 逐字搬自 `source.html:2426-2442`（`drawRings`），票 07 加了档位。
 *
 * 注意旧代码**没有** `save` / `restore`，而是在循环后手动把 `globalAlpha` 复位
 * —— 这里保持原样（`draw-port-map-b.md` §5.7 的提醒：alpha 复位必须保留）。
 *
 * 档位与 Pixi 版一一对应（`src/battlefield/pixi/ring.ts`）：
 * 普攻环 = 旧版宽度；暴击环加粗 1.45 倍并加白色热核；双生环加粗 1.9 倍、热核更粗。
 */

import type { RingTier } from '../types';
import type { FrameContext } from './context';
import { clamp, easeOutCubic, lerp } from './math';

/** 每档的环体宽度系数。 */
const TIER_WIDTH: Record<RingTier, number> = {
  normal: 1,
  crit: 1.45,
  twin: 1.9,
};

/** 每档的白色热核宽度系数（0 = 没有热核）。 */
const TIER_CORE: Record<RingTier, number> = {
  normal: 0,
  crit: 1.6,
  twin: 2.4,
};

export class RingView {
  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    for (const r of fc.effects.rings) {
      const p = clamp(r.t / r.life, 0, 1);
      const rad = lerp(r.r0, r.r1, easeOutCubic(p));
      const a = 1 - p;
      const w = TIER_WIDTH[r.tier] ?? 1;
      ctx.strokeStyle = r.color;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.globalAlpha = a * 0.24;
      ctx.lineWidth = (10 * a + 3) * w;
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.lineWidth = (3.2 * a + 0.6) * w;
      ctx.stroke();
      const core = TIER_CORE[r.tier] ?? 0;
      if (core > 0) {
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = (1.6 * a + 0.4) * core;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}
