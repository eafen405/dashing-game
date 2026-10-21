/**
 * 冲击环 —— 逐字搬自 `source.html:2426-2442`（`drawRings`），票 07 加了档位。
 *
 * 注意旧代码**没有** `save` / `restore`，而是在循环后手动把 `globalAlpha` 复位
 * —— 这里保持原样（`draw-port-map-b.md` §5.7 的提醒：alpha 复位必须保留）。
 *
 * Pixi 版每个环是「同一圆路径 + 两道描边」，所以用 `GraphicsPath` 把圆存下来
 * （Pixi v8 的 `stroke()` 之后 `stroke()` 走的是退化路径，必须重新挂路径）。
 *
 * ## 票 07：三档（普攻 / 暴击 / 双生同破）
 *
 * | 档位 | 环体宽度 | 热核 |
 * |---|---|---|
 * | `normal` | 旧版的 `10a+3` / `3.2a+0.6` | 无 |
 * | `crit` | ×1.45 | 白色热核（细） |
 * | `twin` | ×1.9 | 白色热核（粗） |
 *
 * **颜色分档**：环体颜色仍由规则层给（暴击金 / 双生粉 / 普攻轨道色），
 * 表现层额外给暴击与双生环加一道**白色热核** —— 三档一眼能分开。
 */

import { Container, Graphics } from 'pixi.js';
import type { RingTier } from '../types';
import type { FrameContext } from './context';
import { circlePath, setStroke } from './gfx';
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
  /** 容器（挂到 `glow` 层）。 */
  readonly container = new Container();

  private readonly gfx = new Graphics();

  constructor() {
    this.container.addChild(this.gfx);
  }

  prepare(): void {
    // 无 DOM 依赖。
  }

  draw(fc: FrameContext): void {
    const g = this.gfx;
    g.clear();
    for (const r of fc.effects.rings) {
      const p = clamp(r.t / r.life, 0, 1);
      const rad = lerp(r.r0, r.r1, easeOutCubic(p));
      const a = 1 - p;
      const w = TIER_WIDTH[r.tier] ?? 1;
      const path = circlePath(r.x, r.y, rad);
      setStroke(g, (10 * a + 3) * w, r.color, a * 0.24);
      g.beginPath();
      g.context.path(path);
      g.stroke();
      setStroke(g, (3.2 * a + 0.6) * w, r.color, a);
      g.beginPath();
      g.context.path(path);
      g.stroke();
      const core = TIER_CORE[r.tier] ?? 0;
      if (core > 0) {
        setStroke(g, (1.6 * a + 0.4) * core, '#ffffff', a * 0.85);
        g.beginPath();
        g.context.path(path);
        g.stroke();
      }
    }
  }

  destroy(): void {
    // 无自有资源。
  }
}
