/**
 * 防线 —— 角色身前的竖向渐变线。
 *
 * 逐字搬自 `source.html:1553-1565`（`drawDefenseLine`）。
 *
 * 旧版是 `ctx.lineWidth = 2` 的竖向描边，渐变位置依赖 `playerX` / `playerR` / `H`。
 * Pixi 的**局部渐变**跟着形状走，所以渐变只需建一次（不用像旧版那样在
 * `resize()` 时重建 —— 位置变化时形状跟着动，渐变自动贴合）。
 */

import { Container, Graphics } from 'pixi.js';
import type { FillGradient } from 'pixi.js';
import type { FrameContext } from './context';
import { destroyGradient, linearGradient } from './gradient';
import { setFill } from './gfx';

/** 防线半高（`source.html:1560` 的 ±40）。 */
const HALF_H = 40;

/** 防线半宽（旧版 `lineWidth = 2`）。 */
const HALF_W = 1;

export class DefenseLineView {
  /** 容器（挂到 `defense` 层）。 */
  readonly container = new Container();

  private readonly gfx = new Graphics();
  private gradient: FillGradient | null = null;

  constructor() {
    this.container.addChild(this.gfx);
  }

  prepare(): void {
    if (!this.gradient) {
      this.gradient = linearGradient(
        [
          { offset: 0, color: 'rgba(255,255,255,0)' },
          { offset: 0.5, color: 'rgba(255,255,255,.18)' },
          { offset: 1, color: 'rgba(255,255,255,0)' },
        ],
        0.5,
        0,
        0.5,
        1,
      );
    }
  }

  /** 尺寸变化时无需重建（局部渐变自动跟随形状）。 */
  resize(): void {
    // 旧版在 resize 时丢弃渐变；Pixi 版不需要 —— 渐变是局部坐标。
  }

  draw(fc: FrameContext): void {
    const g = this.gfx;
    g.clear();
    const { height, playerX, playerR } = fc.layout;
    const x = playerX + playerR * 1.15 + 8;
    if (!this.gradient) return;
    setFill(g, '#ffffff');
    g.beginPath();
    g.rect(x - HALF_W, height / 2 - HALF_H, HALF_W * 2, HALF_H * 2);
    g.fill(this.gradient);
  }

  destroy(): void {
    destroyGradient(this.gradient);
    this.gradient = null;
  }
}
