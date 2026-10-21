/**
 * 长按怪 —— 逐字搬自 `source.html:2059-2233`（`drawLongMonster`）。
 *
 * 长条胶囊 + 头部核心 + 进度槽 + 奖励刻度 + 切割线火花 + 提示标签。
 * 旧代码用 `m.long` 判长按怪、`m.done` 判「已完成」；新模型统一用
 * `kind === 'hold'` 与 `removed`（`escaped` 仍是长按怪专属状态，不是 `removed`）。
 */

import { LONG_COLOR, LONG_HOLD_TIME } from '../../game/constants';
import type { HoldMonster } from '../../game/types';
import type { FrameContext } from './context';
import { laneGroundY } from './ground';
import { laneColorOf } from './lane-color';
import { clamp } from './math';
import { hexA, roundRectPath } from './paths';

/** 奖励刻度位置（旧 `source.html:2164` 的 `[0, 1/3, 1]`）—— 提到模块级。 */
const HOLD_TICKS = [0, 1 / 3, 1] as const;
/** 三个奖励刻度（解构后类型确定，不需要 `!` 断言）。 */
const [TICK_HEAD, TICK_MID, TICK_TAIL] = HOLD_TICKS;

export class HoldMonsterView {
  /** 画一只长按怪。 */
  draw(fc: FrameContext, m: HoldMonster): void {
    const ctx = fc.ctx;
    const { hitX, zoneHalf, width } = fc.layout;
    const c = laneColorOf(m.lane, fc.frenzyActive);
    const x = m.x;
    const y = m.y;
    const len = m.len;
    const h = m.h;
    const prog = clamp(m.holdT / LONG_HOLD_TIME, 0, 1);
    const esc = m.escaped;
    const headX = x + h * 0.46; // 旧 `longHeadX`（`source.html:1089-1091`）
    const inWindow = !m.anchored && !esc && Math.abs(headX - hitX) <= zoneHalf;

    // 地面阴影：长条怪悬浮在轨道上方
    const gy = laneGroundY(fc.layout, m.lane);
    const cx = x + len / 2;
    ctx.fillStyle = hexA(c, 0.06);
    ctx.beginPath();
    ctx.ellipse(cx, gy, len * 0.52, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(cx, gy, len * 0.44, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = esc ? 0.55 : 1;

    // 外发光（宽描边代替 shadowBlur）
    const bodyGlow = m.anchored || inWindow ? 0.26 : 0.14;

    // 主体（长条胶囊）
    const bg = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    bg.addColorStop(0, hexA(c, 0.85));
    bg.addColorStop(0.45, '#0b1424');
    bg.addColorStop(1, hexA(c, 0.35));
    ctx.fillStyle = bg;
    roundRectPath(ctx, x, y - h / 2, len, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = hexA(c, bodyGlow);
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = esc ? '#ff4d6d' : hexA(c, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();

    // 外壳高光
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + h * 0.55, y - h * 0.28);
    ctx.lineTo(x + len - h * 0.4, y - h * 0.28);
    ctx.stroke();

    // 节段
    const segs = 7;
    for (let i = 1; i < segs; i++) {
      const sx = x + (len * i) / segs;
      ctx.strokeStyle = hexA(c, 0.32);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sx, y - h * 0.3);
      ctx.lineTo(sx, y + h * 0.3);
      ctx.stroke();
    }

    // 头部核心（左端）
    const headCol = esc ? '#ff4d6d' : inWindow ? '#ffffff' : LONG_COLOR;
    ctx.fillStyle = hexA(headCol, 0.28);
    ctx.beginPath();
    ctx.arc(headX, y, h * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = headCol;
    ctx.beginPath();
    ctx.arc(headX, y, h * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#071018';
    ctx.beginPath();
    ctx.arc(headX, y, h * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // 头进圈：脉冲提示环
    if (inWindow) {
      const pl = 0.5 + 0.5 * Math.sin(fc.vt * 18);
      ctx.strokeStyle = hexA(LONG_COLOR, 0.2);
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(headX, y, h * 0.85 + pl * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 + 0.45 * pl).toFixed(2) + ')';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    // 尾刺（右端）
    ctx.fillStyle = hexA(c, 0.85);
    ctx.beginPath();
    ctx.moveTo(x + len - 2, y - h * 0.4);
    ctx.lineTo(x + len + h * 0.5, y);
    ctx.lineTo(x + len - 2, y + h * 0.4);
    ctx.closePath();
    ctx.fill();

    if (m.anchored && !esc) {
      // 长按进度槽
      const gx = x + h * 0.35;
      const gw = len - h * 0.7;
      const gy = y + h * 0.3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + gw, gy);
      ctx.stroke();
      if (prog > 0) {
        const pg = ctx.createLinearGradient(gx, 0, gx + gw, 0);
        pg.addColorStop(0, LONG_COLOR);
        pg.addColorStop(1, c);
        ctx.strokeStyle = pg;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + gw * prog, gy);
        ctx.stroke();
      }
      // 头 / 1 秒 / 尾 三个奖励刻度
      this.drawTick(ctx, gx, gw, gy, prog, TICK_HEAD);
      this.drawTick(ctx, gx, gw, gy, prog, TICK_MID);
      this.drawTick(ctx, gx, gw, gy, prog, TICK_TAIL);

      // 切割线 + 火花
      if (m.holding && prog < 1) {
        const cutX = gx + gw * prog;
        ctx.strokeStyle = hexA(LONG_COLOR, 0.24);
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(cutX, y - h * 0.62);
        ctx.lineTo(cutX, y + h * 0.62);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.fillStyle = LONG_COLOR;
        for (let i = 0; i < 4; i++) {
          const a = fc.vt * 7 + i * (Math.PI / 2);
          ctx.beginPath();
          ctx.arc(cutX + Math.cos(a) * 9, y + Math.sin(a) * 7, 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 提示标签
      const label = m.holding
        ? '长按 ' + m.holdT.toFixed(1) + ' / ' + LONG_HOLD_TIME + 's'
        : '继续按住 ' + m.holdT.toFixed(1) + ' / ' + LONG_HOLD_TIME + 's';
      ctx.font = "700 11px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width;
      const cx = x + len / 2;
      const cy = y - h / 2 - 18;
      ctx.fillStyle = 'rgba(8,12,24,.86)';
      roundRectPath(ctx, cx - tw / 2 - 8, cy - 9, tw + 16, 18, 9);
      ctx.fill();
      ctx.strokeStyle = hexA(LONG_COLOR, 0.8);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = m.holding ? '#ffffff' : LONG_COLOR;
      ctx.fillText(label, cx, cy + 0.5);

      // 头 / 尾 标记（画在条内，避开判定圈文字）
      ctx.font = "700 8px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillStyle = hexA(LONG_COLOR, 0.72);
      ctx.textAlign = 'center';
      ctx.fillText('头', x + h * 1.08, y - h * 0.24);
      ctx.fillText('尾', x + len - h * 0.52, y - h * 0.24);
    } else if (!esc && x < width - 40) {
      // 接近 / 可点击提示
      const label = inWindow ? '点击起手！' : '头进圈后点击';
      const cx = Math.min(x + 70, width - 60);
      const cy = y - h / 2 - 18;
      ctx.font = "700 11px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = inWindow ? 'rgba(18,30,10,.92)' : 'rgba(8,12,24,.8)';
      roundRectPath(ctx, cx - tw / 2 - 8, cy - 9, tw + 16, 18, 9);
      ctx.fill();
      ctx.strokeStyle = hexA(LONG_COLOR, inWindow ? 0.95 : 0.55);
      ctx.lineWidth = inWindow ? 1.6 : 1;
      ctx.stroke();
      ctx.fillStyle = inWindow ? '#ffffff' : hexA(LONG_COLOR, 0.9);
      ctx.fillText(label, cx, cy + 0.5);
    }

    ctx.restore();
  }

  /** 一个奖励刻度 —— 旧 `source.html:2165-2167`。 */
  private drawTick(
    ctx: CanvasRenderingContext2D,
    gx: number,
    gw: number,
    gy: number,
    prog: number,
    t: number,
  ): void {
    ctx.strokeStyle = t <= prog + 0.001 ? '#ffffff' : hexA(LONG_COLOR, 0.55);
    ctx.lineWidth = t === 0 ? 2.4 : 2;
    ctx.beginPath();
    ctx.moveTo(gx + gw * t, gy - 6);
    ctx.lineTo(gx + gw * t, gy + 6);
    ctx.stroke();
  }
}
