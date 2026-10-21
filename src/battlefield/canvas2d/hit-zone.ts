/**
 * 判定区 —— 外圈（普攻）+ 内圈（暴击）+ 脉冲 + 文字 + 方向箭头。
 *
 * 逐字搬自 `source.html:1567-1652`（`drawHitZones`）。
 *
 * **修法（结构性热点 ②）**：旧代码在每帧对**每条轨道**各做一次
 * `monsters.some(m => m.long && !m.done && m.lane === key)`（`source.html:1633`），
 * 两轨就是两次全量扫描。这里改成读渲染器**每帧预扫好的** `fc.longInLane`
 * （预扫与怪物绘制共用一次遍历），扫描次数从 2×O(n) 降到 0。
 *
 * 语义保持一致：旧代码判「该轨有**未完成**的长按怪」，
 * 新模型统一用 `removed`（`kind === 'hold' && !removed`）。
 */

import { GOLD } from '../../game/constants';
import type { Lane } from '../../game/types';
import type { FrameContext } from './context';
import { laneColorOf } from './lane-color';
import { clamp } from './math';
import { hexA } from './paths';

export class HitZoneView {
  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    const { layout } = fc;
    const pulse = 0.5 + 0.5 * Math.sin(fc.vt * 5);

    this.drawZone(ctx, fc, 'top', layout.laneY.top, pulse);
    this.drawZone(ctx, fc, 'bottom', layout.laneY.bottom, pulse);
  }

  private drawZone(
    ctx: CanvasRenderingContext2D,
    fc: FrameContext,
    lane: Lane,
    y: number,
    pulse: number,
  ): void {
    const { layout } = fc;
    const hitX = layout.hitX;
    const R = layout.zoneHalf; // 外圈半径 = 普攻判定范围
    const r = layout.critHalf; // 内圈半径 = 暴击判定范围
    const color = laneColorOf(lane, fc.frenzyActive);
    const critCol = fc.frenzyActive ? '#ffffff' : GOLD;

    // 外圈光晕
    const gg = ctx.createRadialGradient(hitX, y, r * 0.35, hitX, y, R * 1.5);
    gg.addColorStop(0, hexA(color, 0.16 + pulse * 0.09));
    gg.addColorStop(0.55, hexA(color, 0.07 + pulse * 0.05));
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(hitX, y, R * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 外圈：普攻判定
    ctx.fillStyle = hexA(color, 0.06 + pulse * 0.035);
    ctx.beginPath();
    ctx.arc(hitX, y, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(hitX, y, R, 0, Math.PI * 2);
    ctx.strokeStyle = hexA(color, 0.13 + pulse * 0.05);
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = hexA(color, 0.72 + pulse * 0.26);
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 内圈：暴击判定
    ctx.fillStyle = hexA(critCol, 0.17 + pulse * 0.09);
    ctx.beginPath();
    ctx.arc(hitX, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(hitX, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = hexA(critCol, 0.13 + pulse * 0.05);
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = hexA(critCol, 0.78 + pulse * 0.22);
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 两环之间的区域标注
    ctx.font = "600 10px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hexA(critCol, 0.9);
    ctx.fillText('暴击', hitX, y - r - 9);
    ctx.fillStyle = hexA(color, 0.8);
    ctx.fillText('普攻', hitX, y + r + 10);

    // 中心点
    ctx.fillStyle = hexA(color, 0.95);
    ctx.beginPath();
    ctx.arc(hitX, y, 3.4, 0, Math.PI * 2);
    ctx.fill();

    // 标签（放在两轨之外，避免重叠）；长按敌人占用该轨时隐藏，避免干扰起手提示
    const longHere = fc.longInLane[lane];
    const labelY = clamp(lane === 'top' ? y - R - 16 : y + R + 18, 12, layout.height - 12);
    if (!longHere) {
      ctx.font = "600 11px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillStyle = hexA(color, 0.66);
      ctx.fillText(lane === 'top' ? '打击点 · 点击上半屏' : '打击点 · 点击下半屏', hitX, labelY);
    }

    // 方向箭头
    ctx.strokeStyle = hexA(color, 0.28);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hitX + R + 30, y);
    ctx.lineTo(hitX + R + 12, y);
    ctx.moveTo(hitX + R + 19, y - 5);
    ctx.lineTo(hitX + R + 12, y);
    ctx.lineTo(hitX + R + 19, y + 5);
    ctx.stroke();
  }
}
