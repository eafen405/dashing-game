/**
 * 防线 —— 角色身前「碰到怪」的竖向接触面。
 *
 * 旧实现只是一小段竖向渐变线（`source.html:1553-1565`）；角色改成一直接地行走后，
 * 把这条线从顶轨地面拉到底轨地面，读成角色前进方向上的接触面，
 * 也解释了「漏怪走到这里会撞到角色」的规则。
 */

import type { FrameContext } from './context';
import { laneGroundY } from './ground';

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
    const { layout } = fc;
    const x = layout.playerX + layout.playerR * 1.15 + 8;
    const y0 = laneGroundY(layout, 'top') - layout.playerR * 0.3;
    const y1 = laneGroundY(layout, 'bottom') + layout.playerR * 0.1;

    if (!this.gradient) {
      const g = ctx.createLinearGradient(x, y0, x, y1);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.18, 'rgba(255,255,255,.09)');
      g.addColorStop(0.55, 'rgba(255,255,255,.13)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      this.gradient = g;
    }
    ctx.strokeStyle = this.gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
  }
}
