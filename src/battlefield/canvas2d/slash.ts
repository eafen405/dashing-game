/**
 * 刀光 —— 逐字搬自 `source.html:2343-2424`（`drawSlashes`）。
 *
 * 三段叠加：飞行斩（从剑尖飞向打击点的新月）、打击点新月、竖向光柱。
 * 颜色按轨道取（FEVER 时会变），所以走 `laneColorOf`。
 */

import { GOLD } from '../../game/constants';
import type { FrameContext } from './context';
import { laneColorOf } from './lane-color';
import { clamp, easeOutCubic, lerp } from './math';
import { hexA } from './paths';

export class SlashView {
  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    for (const sl of fc.effects.slashes) {
      const p = clamp(sl.t / sl.life, 0, 1);
      const color = laneColorOf(sl.lane, fc.frenzyActive);

      // 0) 暴击余晖（票 07）—— 只有打击点的一道更宽、更淡的金色拖尾。
      if (sl.kind === 'afterglow') {
        this.drawAfterglow(ctx, sl.x, sl.y, p);
        continue;
      }

      // 1) 飞行斩：从剑尖飞向打击点的新月
      const flyP = clamp(p / 0.34, 0, 1);
      if (flyP < 1) {
        const fx = lerp(sl.x0, sl.x, easeOutCubic(flyP));
        const scale = 0.55 + 0.45 * flyP;
        const a = 0.55 + 0.45 * (1 - flyP);
        ctx.save();
        ctx.translate(fx, sl.y);
        ctx.rotate(-1.15);
        ctx.lineCap = 'round';
        ctx.globalAlpha = a * 0.32;
        ctx.strokeStyle = color;
        ctx.lineWidth = 12 * scale;
        ctx.beginPath();
        ctx.arc(0, 0, 20 * scale, -1.0, 1.0);
        ctx.stroke();
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4.5 * scale;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.6 * scale;
        ctx.beginPath();
        ctx.arc(0, 0, 26 * scale, -0.95, 0.95);
        ctx.stroke();
        ctx.restore();
      }

      // 2) 打击点新月刀光
      const cp = clamp((p - 0.1) / 0.62, 0, 1);
      if (cp > 0) {
        const ang = -0.95 + cp * 0.62;
        const len = 22 + cp * 54;
        ctx.save();
        ctx.translate(sl.x, sl.y);
        ctx.rotate(ang);
        ctx.lineCap = 'round';

        ctx.globalAlpha = (1 - cp) * 0.3;
        ctx.strokeStyle = color;
        ctx.lineWidth = 14 - cp * 6;
        ctx.beginPath();
        ctx.arc(0, 0, len, -1.05, 1.05);
        ctx.stroke();

        ctx.globalAlpha = 1 - cp;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 7 - cp * 4;
        ctx.stroke();

        ctx.strokeStyle = color;
        ctx.lineWidth = 3.4 - cp * 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, len + 9, -0.95, 0.95);
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.restore();
      }

      // 3) 打击点竖向光柱
      const vp = clamp(p / 0.55, 0, 1);
      if (vp > 0) {
        const hgt = 46 * Math.sin(vp * Math.PI * 0.9);
        const vg = ctx.createLinearGradient(sl.x, sl.y - hgt, sl.x, sl.y + hgt);
        vg.addColorStop(0, hexA(color, 0));
        vg.addColorStop(0.5, hexA(color, 0.45 * (1 - vp * 0.6)));
        vg.addColorStop(1, hexA(color, 0));
        ctx.strokeStyle = vg;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sl.x, sl.y - hgt);
        ctx.lineTo(sl.x, sl.y + hgt);
        ctx.stroke();
      }
    }
  }

  /** 暴击余晖 —— 票 07（与 Pixi 版 `slash.ts` 的 `drawAfterglow` 同一口径）。 */
  private drawAfterglow(ctx: CanvasRenderingContext2D, x: number, y: number, p: number): void {
    const fade = 1 - p;
    const len = 22 + p * 54;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.95 + p * 0.62);
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 14 * 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, len, -1.05, 1.05);
    ctx.stroke();
    ctx.globalAlpha = 0.42 * fade;
    ctx.lineWidth = 7 * 1.5;
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.restore();
  }
}
