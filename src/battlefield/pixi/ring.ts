/**
 * 冲击环 —— 逐字搬自 `source.html:2426-2442`（`drawRings`）。
 *
 * 注意旧代码**没有** `save` / `restore`，而是在循环后手动把 `globalAlpha` 复位
 * —— 这里保持原样（`draw-port-map-b.md` §5.7 的提醒：alpha 复位必须保留）。
 *
 * Pixi 版每个环是「同一圆路径 + 两道描边」，所以用 `GraphicsPath` 把圆存下来
 * （Pixi v8 的 `stroke()` 之后 `stroke()` 走的是退化路径，必须重新挂路径）。
 */

import { Container, Graphics } from 'pixi.js';
import type { FrameContext } from './context';
import { circlePath, setStroke } from './gfx';
import { clamp, easeOutCubic, lerp } from './math';

export class RingView {
  /** 容器（挂到 `entities` 层）。 */
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
      const path = circlePath(r.x, r.y, rad);
      setStroke(g, 10 * a + 3, r.color, a * 0.24);
      g.beginPath();
      g.context.path(path);
      g.stroke();
      setStroke(g, 3.2 * a + 0.6, r.color, a);
      g.beginPath();
      g.context.path(path);
      g.stroke();
    }
  }

  destroy(): void {
    // 无自有资源。
  }
}
