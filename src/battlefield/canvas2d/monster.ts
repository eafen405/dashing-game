/**
 * 普通怪（菱形晶体）—— 逐字搬自 `source.html:2235-2341`（`drawMonster`）。
 *
 * 旧代码里 `m.partner` / `m.pairPending` 是普通怪身上不存在的字段（靠 `undefined`
 * 判假），新模型统一用 `kind` 判别联合：`kind === 'twin'` 即「有伙伴」。
 * 其余（预警闪烁、暴击金圈、拖尾、内芯、眼睛）逐字照抄。
 */

import { GOLD, PAIR_COLOR, PAIR_WINDOW } from '../../game/constants';
import type { NormalMonster, TwinMonster } from '../../game/types';
import type { FrameContext } from './context';
import { laneGroundY } from './ground';
import { laneColorOf } from './lane-color';
import { clamp } from './math';
import { hexA } from './paths';

export class MonsterView {
  /** 画一只普通怪 / 双生怪。 */
  draw(fc: FrameContext, m: NormalMonster | TwinMonster): void {
    const ctx = fc.ctx;
    const { hitX, zoneHalf, critHalf } = fc.layout;
    const c = laneColorOf(m.lane, fc.frenzyActive);
    const bob = Math.sin(m.phase) * 4;
    const x = m.x;
    const y = m.y + bob;
    const w = m.w;
    const h = m.h;

    // 地面阴影：怪物悬浮在轨道上方，影子落在地面线上
    this.drawShadow(fc, m.x, m.w, m.lane, c);

    // 预警：接近判定区时闪烁
    const distToHit = m.x - hitX;
    const inZone = Math.abs(distToHit) <= zoneHalf;
    const missed = distToHit < -zoneHalf;
    if (missed) {
      // 越过打击点：警示光环
      ctx.strokeStyle = 'rgba(255,77,109,' + (0.18 + 0.16 * Math.sin(fc.vt * 12)) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, w * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (inZone) {
      ctx.fillStyle = hexA(c, 0.1 + 0.06 * Math.sin(fc.vt * 22));
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.85, h * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 进入中心暴击区：金圈提示
    if (Math.abs(distToHit) <= critHalf) {
      const cc = fc.frenzyActive ? '#ffffff' : GOLD;
      ctx.strokeStyle = hexA(cc, 0.55 + 0.25 * Math.sin(fc.vt * 30));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(w * 0.9, 26), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 双生成员：洋红光环；挂起时显示等待窗口
    if (m.kind === 'twin' && m.partnerId !== null) {
      ctx.strokeStyle = hexA(PAIR_COLOR, 0.45 + 0.25 * Math.sin(fc.vt * 8 + m.phase));
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, w * 0.95, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (m.kind === 'twin' && m.pairPending) {
      const frac = clamp(m.pairT / PAIR_WINDOW, 0, 1);
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, w * 1.05, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(x, y);

    // 身体（菱形晶体）
    ctx.fillStyle = '#101a2e';
    ctx.beginPath();
    ctx.moveTo(-w * 0.62, 0);
    ctx.lineTo(-w * 0.1, -h * 0.5);
    ctx.lineTo(w * 0.62, 0);
    ctx.lineTo(-w * 0.1, h * 0.5);
    ctx.closePath();
    ctx.fill();
    const bodyC = missed ? '#ff4d6d' : c;
    ctx.strokeStyle = hexA(bodyC, inZone ? 0.3 : 0.16);
    ctx.lineWidth = inZone ? 12 : 8;
    ctx.stroke();
    ctx.strokeStyle = bodyC;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 内芯
    const inner = 0.35 + 0.25 * Math.sin(fc.vt * 6 + m.phase);
    ctx.fillStyle = hexA(c, inner);
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, 0);
    ctx.lineTo(-w * 0.05, -h * 0.24);
    ctx.lineTo(w * 0.3, 0);
    ctx.lineTo(-w * 0.05, h * 0.24);
    ctx.closePath();
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(-w * 0.16, -h * 0.05, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-w * 0.16, h * 0.1, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  /** 悬浮怪的地面阴影：一圈淡光 + 一块暗影。 */
  private drawShadow(
    fc: FrameContext,
    x: number,
    w: number,
    lane: NormalMonster['lane'],
    color: string,
  ): void {
    const ctx = fc.ctx;
    const gy = laneGroundY(fc.layout, lane);
    ctx.fillStyle = hexA(color, 0.08);
    ctx.beginPath();
    ctx.ellipse(x, gy, w * 0.95, w * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.ellipse(x, gy, w * 0.58, w * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
