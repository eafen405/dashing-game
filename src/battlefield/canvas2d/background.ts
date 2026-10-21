/**
 * 背景 —— 上轨以上的天空 / 星空。
 *
 * 逐字搬自 `source.html:1480-1505`（`drawBackground`）与 `579-591`（`buildStars`）。
 *
 * **静态内容不每帧重建**：星空数据只在 `resize()` 时生成一次
 * （旧代码本来也是 `buildStars()` 只在 `resize()` 里调）。
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
  private w = 0;
  private h = 0;

  /** 尺寸变化时重建星空。 */
  resize(layout: Layout): void {
    this.w = layout.width;
    this.h = layout.height;
    this.buildStars();
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
    const w = this.w;
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
  }
}
