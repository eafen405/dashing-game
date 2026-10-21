/**
 * 轨道 —— 底光带 + 主线 + 流动刻度。
 *
 * 逐字搬自 `source.html:1511-1551`（`drawRails`）。
 *
 * **静态内容不每帧重建**：两条轨道的渐变（旧代码每帧 `createLinearGradient` 两次，
 * 一共四次）缓存在这里，只在 `resize()` 或 **FEVER 开关**时重建 ——
 * FEVER 会换轨道配色（`laneColorOf`），此时渐变必须跟着换。
 * 流动刻度是动画，仍每帧画。
 *
 * **实现说明**：
 *
 * - 旧版的主线是 `ctx.lineWidth = 2` 的水平描边。Pixi 的**局部渐变**需要一个
 *   有面积的包围盒（高度为 0 会除零），所以主线改成**等高的细矩形**
 *   （`rect(0, y-1, w, 2)`）—— 覆盖的像素与 2px 描边一致。
 * - 流动刻度的 alpha 逐条不同（沿 x 线性渐变），旧版是每条一次 `stroke()`。
 *   Pixi 版把 alpha **量化成 8 档**，同档的刻度合并成一次描边 ——
 *   视觉上无差别（alpha 区间 0.033~0.143），但绘制批次少一个数量级。
 */

import { Container, Graphics } from 'pixi.js';
import type { FillGradient } from 'pixi.js';
import type { Lane, Layout } from '../../game/types';
import type { FrameContext } from './context';
import { destroyGradient, linearGradient } from './gradient';
import { setFill, setStroke } from './gfx';
import { clamp } from './math';
import { hexA, laneColorOf } from './palette';

/** 轨道刻度间距（`source.html:1537`）。 */
const GAP = 46;

/** 刻度 alpha 的量化档数。 */
const TICK_BUCKETS = 8;

/** 轨道视图。 */
export class RailsView {
  /** 容器（挂到 `rails` 层）。 */
  readonly container = new Container();

  private readonly gfx = new Graphics();

  private bandTop: FillGradient | null = null;
  private bandBottom: FillGradient | null = null;
  private lineTop: FillGradient | null = null;
  private lineBottom: FillGradient | null = null;
  private frenzy = false;
  private w = 0;

  constructor() {
    this.container.addChild(this.gfx);
  }

  prepare(): void {
    this.buildGradients();
  }

  /** 尺寸变化时丢弃渐变（下次绘制重建）。 */
  resize(layout: Layout): void {
    this.w = layout.width;
    this.invalidate();
  }

  draw(fc: FrameContext): void {
    if (this.frenzy !== fc.frenzyActive) {
      this.frenzy = fc.frenzyActive;
      this.invalidate();
    }
    const g = this.gfx;
    g.clear();
    if (!this.w) return;

    const top = fc.layout.laneY.top;
    const bottom = fc.layout.laneY.bottom;

    this.drawRail(g, fc, 'top', top, this.bandTop, this.lineTop);
    this.drawRail(g, fc, 'bottom', bottom, this.bandBottom, this.lineBottom);
  }

  destroy(): void {
    destroyGradient(this.bandTop);
    destroyGradient(this.bandBottom);
    destroyGradient(this.lineTop);
    destroyGradient(this.lineBottom);
    this.bandTop = null;
    this.bandBottom = null;
    this.lineTop = null;
    this.lineBottom = null;
  }

  // ── 内部 ──────────────────────────────────────────────────

  private invalidate(): void {
    destroyGradient(this.bandTop);
    destroyGradient(this.bandBottom);
    destroyGradient(this.lineTop);
    destroyGradient(this.lineBottom);
    this.bandTop = null;
    this.bandBottom = null;
    this.lineTop = null;
    this.lineBottom = null;
    this.buildGradients();
  }

  /** 建渐变（FEVER 切换 / resize 时重建）。 */
  private buildGradients(): void {
    if (this.bandTop) return;
    const topColor = laneColorOf('top', this.frenzy);
    const bottomColor = laneColorOf('bottom', this.frenzy);
    this.bandTop = this.makeBand(topColor);
    this.bandBottom = this.makeBand(bottomColor);
    this.lineTop = this.makeLine(topColor);
    this.lineBottom = this.makeLine(bottomColor);
  }

  /** 轨道底光带 —— 垂直渐变（旧 `source.html:1533-1537`）。 */
  private makeBand(color: string): FillGradient {
    return linearGradient(
      [
        { offset: 0, color: 'rgba(255,255,255,0)' },
        { offset: 0.5, color: hexA(color, 0.055) },
        { offset: 1, color: 'rgba(255,255,255,0)' },
      ],
      0.5,
      0,
      0.5,
      1,
    );
  }

  /** 轨道主线 —— 水平渐变（旧 `source.html:1543-1547`）。 */
  private makeLine(color: string): FillGradient {
    return linearGradient(
      [
        { offset: 0, color: hexA(color, 0.05) },
        { offset: 0.25, color: hexA(color, 0.32) },
        { offset: 1, color: hexA(color, 0.1) },
      ],
      0,
      0.5,
      1,
      0.5,
    );
  }

  /** 画一条轨道（底光带 → 主线 → 流动刻度）。 */
  private drawRail(
    g: Graphics,
    fc: FrameContext,
    lane: Lane,
    y: number,
    band: FillGradient | null,
    line: FillGradient | null,
  ): void {
    const w = this.w;
    const color = laneColorOf(lane, this.frenzy);
    const vt = fc.vt;

    // 轨道底光带（垂直渐变 → 用有面积的矩形承载）。
    if (band) {
      setFill(g, '#ffffff');
      g.beginPath();
      g.rect(0, y - 26, w, 52);
      g.fill(band);
    }

    // 轨道主线（水平渐变 → 2px 细矩形）。
    if (line) {
      setFill(g, '#ffffff');
      g.beginPath();
      g.rect(0, y - 1, w, 2);
      g.fill(line);
    }

    // 流动刻度 —— alpha 量化成 8 档，同档合并成一次描边。
    const offset = (vt * 120) % GAP;
    for (let bucket = 0; bucket < TICK_BUCKETS; bucket++) {
      const lo = bucket / TICK_BUCKETS;
      const hi = (bucket + 1) / TICK_BUCKETS;
      const bucketAlpha = (bucket + 0.5) / TICK_BUCKETS;
      let started = false;
      for (let x = w - offset; x > -GAP; x -= GAP) {
        const edge = clamp(x / w, 0, 1);
        const alpha = 0.15 + edge * 0.5;
        if (alpha < lo || alpha >= hi) continue;
        if (!started) {
          setStroke(g, 1, hexA(color, 0.22 * bucketAlpha));
          g.beginPath();
          started = true;
        }
        g.moveTo(x, y - 7);
        g.lineTo(x, y + 7);
      }
      if (started) g.stroke();
    }
  }
}
