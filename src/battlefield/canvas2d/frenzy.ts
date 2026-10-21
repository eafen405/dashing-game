/**
 * FEVER 全场金色氛围 —— 逐字搬自 `source.html:2474-2500`（`drawFrenzyOverlay`）。
 *
 * 注释原文：「FEVER 时的全场金色氛围（叠在场景之上、暗角之下）」——
 * 所以它必须**最后**画（暗角是 DOM 层的事，由 04b 负责）。
 */

import type { Lane } from '../../game/types';
import type { FrameContext } from './context';

/** 两条轨道（解构后类型确定，不需要 `!` 断言）。 */
const [LANE_TOP, LANE_BOTTOM] = ['top', 'bottom'] as const;

export class FrenzyView {
  draw(fc: FrameContext): void {
    if (!fc.frenzyActive) return;
    const ctx = fc.ctx;
    const { width, height } = fc.layout;
    const pulse = 0.5 + 0.5 * Math.sin(fc.vt * 4.2);

    // 整体暖金洗色
    ctx.fillStyle = 'rgba(255,170,40,' + (0.05 + pulse * 0.035) + ')';
    ctx.fillRect(0, 0, width, height);

    // 两轨金色能量带
    this.drawLaneBand(ctx, fc, LANE_TOP);
    this.drawLaneBand(ctx, fc, LANE_BOTTOM);

    // 边缘金色描边呼吸
    ctx.strokeStyle = 'rgba(255,210,74,' + (0.08 + pulse * 0.07) + ')';
    ctx.lineWidth = 16;
    ctx.strokeRect(3, 3, width - 6, height - 6);
    ctx.strokeStyle = 'rgba(255,210,74,' + (0.22 + pulse * 0.2) + ')';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, width - 6, height - 6);
  }

  /** 一条轨道的金色能量带 —— 旧 `source.html:2483-2490`。 */
  private drawLaneBand(ctx: CanvasRenderingContext2D, fc: FrameContext, lane: Lane): void {
    const { width, laneY } = fc.layout;
    const pulse = 0.5 + 0.5 * Math.sin(fc.vt * 4.2);
    const y = laneY[lane];
    const g = ctx.createLinearGradient(0, y - 34, 0, y + 34);
    g.addColorStop(0, 'rgba(255,210,74,0)');
    g.addColorStop(0.5, 'rgba(255,210,74,' + (0.1 + pulse * 0.07) + ')');
    g.addColorStop(1, 'rgba(255,210,74,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 34, width, 68);
  }
}
