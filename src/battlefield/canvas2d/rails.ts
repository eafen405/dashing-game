/**
 * 轨道 —— 底光带 + 主线 + 流动刻度。
 *
 * 逐字搬自 `source.html:1511-1551`（`drawRails`）。
 *
 * **静态内容不每帧重建**：两条轨道的渐变（旧代码每帧 `createLinearGradient` 两次，
 * 一共四次）缓存在这里，只在 `resize()` 或 **FEVER 开关**时重建 ——
 * FEVER 会换轨道配色（`laneColorOf`），此时渐变必须跟着换。
 * 流动刻度是动画，仍每帧画。
 */

import type { Lane, Layout } from '../../game/types';
import type { FrameContext } from './context';
import { laneColorOf } from './lane-color';
import { clamp } from './math';
import { hexA } from './paths';

/** 轨道刻度间距（`source.html:1537`）。 */
const GAP = 46;

/** 轨道视图。 */
export class RailsView {
  private ownerCtx: CanvasRenderingContext2D | null = null;
  private frenzy = false;
  private bandTop: CanvasGradient | null = null;
  private bandBottom: CanvasGradient | null = null;
  private lineTop: CanvasGradient | null = null;
  private lineBottom: CanvasGradient | null = null;
  private w = 0;

  /** 尺寸变化时丢弃渐变（下次绘制重建）。 */
  resize(layout: Layout): void {
    this.w = layout.width;
    this.invalidate();
  }

  private invalidate(): void {
    this.bandTop = null;
    this.bandBottom = null;
    this.lineTop = null;
    this.lineBottom = null;
  }

  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    if (this.ownerCtx !== ctx) {
      this.ownerCtx = ctx;
      this.invalidate();
    }
    if (this.frenzy !== fc.frenzyActive) {
      this.frenzy = fc.frenzyActive;
      this.invalidate();
    }

    this.drawRail(ctx, fc, 'top', this.laneY(fc, 'top'), this.bandTop, this.lineTop);
    this.drawRail(ctx, fc, 'bottom', this.laneY(fc, 'bottom'), this.bandBottom, this.lineBottom);
  }

  private laneY(fc: FrameContext, lane: Lane): number {
    return fc.layout.laneY[lane];
  }

  /**
   * 画一条轨道。
   *
   * 渐变按需重建（`band` / `line` 参数是缓存，命中就复用）。
   */
  private drawRail(
    ctx: CanvasRenderingContext2D,
    fc: FrameContext,
    lane: Lane,
    y: number,
    bandCache: CanvasGradient | null,
    lineCache: CanvasGradient | null,
  ): void {
    const w = this.w;
    const color = laneColorOf(lane, fc.frenzyActive);
    const vt = fc.vt;

    // 轨道底光带
    let band = bandCache;
    if (!band) {
      band = ctx.createLinearGradient(0, y - 26, 0, y + 26);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.5, hexA(color, 0.055));
      band.addColorStop(1, 'rgba(255,255,255,0)');
      if (lane === 'top') this.bandTop = band;
      else this.bandBottom = band;
    }
    ctx.fillStyle = band;
    ctx.fillRect(0, y - 26, w, 52);

    // 轨道主线
    let line = lineCache;
    if (!line) {
      line = ctx.createLinearGradient(0, 0, w, 0);
      line.addColorStop(0, hexA(color, 0.05));
      line.addColorStop(0.25, hexA(color, 0.32));
      line.addColorStop(1, hexA(color, 0.1));
      if (lane === 'top') this.lineTop = line;
      else this.lineBottom = line;
    }
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    // 流动刻度
    const offset = (vt * 120) % GAP;
    ctx.strokeStyle = hexA(color, 0.22);
    ctx.lineWidth = 1;
    for (let x = w - offset; x > -GAP; x -= GAP) {
      const edge = clamp(x / w, 0, 1);
      ctx.globalAlpha = 0.15 + edge * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x, y + 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
