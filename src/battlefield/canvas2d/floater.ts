/**
 * 飘分文字 —— 逐字搬自 `source.html:2456-2471`（`drawFloaters`）。
 *
 * 描边 + 填充两遍（先深色描边再彩色填充），alpha 按 `1 - p²` 衰减。
 */

import type { FrameContext } from './context';
import { clamp } from './math';

export class FloaterView {
  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "700 14px 'PingFang SC','Microsoft YaHei',sans-serif";
    for (const f of fc.effects.floaters) {
      const p = clamp(f.t / f.life, 0, 1);
      ctx.globalAlpha = 1 - p * p;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(4,8,16,.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
}
