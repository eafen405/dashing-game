/**
 * 命中火花 —— 木棍在接触点实打实敲中的反馈。
 *
 * 不再画从角色飞向打击点的刀光 / 剑气：判定框已经挪到棒尖，
 * 命中的地方就是棒子敲到的地方，这里只留一圈很短的冲击环和几点木屑。
 */

import type { FrameContext } from './context';
import { laneColorOf } from './lane-color';
import { clamp } from './math';
import { hexA } from './paths';

/** 木屑颜色（跟棒身一致）。 */
const WOOD = '#e0a25e';

export class ImpactView {
  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    for (const sl of fc.effects.impacts) {
      const p = clamp(sl.t / sl.life, 0, 1);
      const fade = 1 - p;
      if (fade <= 0) continue;
      const color = laneColorOf(sl.lane, fc.frenzyActive);

      ctx.save();
      ctx.translate(sl.x, sl.y);

      // 接触点冲击环
      ctx.strokeStyle = hexA(color, 0.55 * fade);
      ctx.lineWidth = 0.8 + 2.2 * fade;
      ctx.beginPath();
      ctx.arc(0, 0, 8 + 20 * p, 0, Math.PI * 2);
      ctx.stroke();

      // 中心白闪
      ctx.fillStyle = 'rgba(255,255,255,' + 0.75 * fade + ')';
      ctx.beginPath();
      ctx.arc(0, 0, 1.5 + 4 * fade, 0, Math.PI * 2);
      ctx.fill();

      // 四散木屑
      ctx.strokeStyle = hexA(WOOD, 0.8 * fade);
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + 0.28;
        const r0 = 10 + 15 * p;
        const r1 = r0 + 2 + 7 * fade;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }

      ctx.restore();
    }
  }
}
