/**
 * 防线 —— 角色身前的竖向渐变线。
 *
 * 逐字搬自 `source.html:1553-1565`（`drawDefenseLine`）。
 *
 * 渐变位置依赖 `playerX` / `playerR` / `H`，所以只在 `resize()` 时重建。
 */

import type { FrameContext } from './context';

export class DefenseLineView {
  private ownerCtx: CanvasRenderingContext2D | null = null;
  private gradient: CanvasGradient | null = null;

  /** 尺寸变化时丢弃渐变（下次绘制重建）。 */
  resize(): void {
    this.gradient = null;
  }

  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    if (this.ownerCtx !== ctx) {
      this.ownerCtx = ctx;
      this.gradient = null;
    }
    const { height, playerX, playerR } = fc.layout;
    const x = playerX + playerR * 1.15 + 8;

    if (!this.gradient) {
      const g = ctx.createLinearGradient(x, height / 2 - 40, x, height / 2 + 40);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      this.gradient = g;
    }
    ctx.strokeStyle = this.gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, height / 2 - 40);
    ctx.lineTo(x, height / 2 + 40);
    ctx.stroke();
  }
}
