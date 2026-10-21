/**
 * 防线 —— 角色身前「碰到怪」的竖向接触面。
 *
 * 角色默认在下轨地面上跑，所以接触面只画在下轨地面之上：
 * 上轨是天空，上轨漏怪从头顶飞过，不会撞到地里的人。
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
    const gy = laneGroundY(layout, 'bottom');
    const y0 = gy - layout.playerR * 1.45;
    const y1 = gy + layout.playerR * 0.08;

    if (!this.gradient) {
      const g = ctx.createLinearGradient(x, y0, x, y1);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.35, 'rgba(255,255,255,.09)');
      g.addColorStop(0.85, 'rgba(255,255,255,.14)');
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
