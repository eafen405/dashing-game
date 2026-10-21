/**
 * 背景 —— 星空 + 中线。
 *
 * 逐字搬自 `source.html:1480-1505`（`drawBackground`）与 `579-591`（`buildStars`）。
 *
 * **静态内容不每帧重建**：星空数据只在 `resize()` 时生成一次
 * （旧代码本来也是 `buildStars()` 只在 `resize()` 里调），
 * 中线的渐变也只在 `resize()` 时建一次，不每帧 `createLinearGradient`。
 * 星星的**位置**是动画（横向流动），所以每帧仍要画 —— 这是画面本身，不是重建。
 */

import type { Layout } from '../../game/types';
import type { FrameContext } from './context';
import { clamp, rand } from './math';

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  s: number;
}

/** 背景视图。 */
export class BackgroundView {
  private stars: Star[] = [];
  private ownerCtx: CanvasRenderingContext2D | null = null;
  private midGradient: CanvasGradient | null = null;
  private w = 0;
  private h = 0;

  /** 尺寸变化时重建星空与中线渐变。 */
  resize(layout: Layout): void {
    this.w = layout.width;
    this.h = layout.height;
    this.buildStars();
    this.midGradient = null;
  }

  /** 星空 —— `source.html:579-591`。 */
  private buildStars(): void {
    const w = this.w;
    const h = this.h;
    this.stars.length = 0;
    const n = Math.round(clamp((w * h) / 26000, 30, 90));
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: rand(0.5, 1.6),
        a: rand(0.08, 0.35),
        s: rand(2, 10),
      });
    }
  }

  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    if (this.ownerCtx !== ctx) {
      this.ownerCtx = ctx;
      this.midGradient = null;
    }
    const w = this.w;
    const h = this.h;
    const vt = fc.vt;

    // 星空
    ctx.fillStyle = '#bcd4ff';
    for (const s of this.stars) {
      const x = (s.x - vt * s.s) % (w + 40);
      const px = x < -20 ? x + w + 40 : x;
      ctx.globalAlpha = s.a;
      ctx.beginPath();
      ctx.arc(px, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 中线
    const mid = h / 2;
    if (!this.midGradient) {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      this.midGradient = g;
    }
    ctx.strokeStyle = this.midGradient;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
  }
}
