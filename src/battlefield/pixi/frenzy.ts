/**
 * FEVER 全场金色氛围 —— 逐字搬自 `source.html:2474-2500`（`drawFrenzyOverlay`）。
 *
 * 注释原文：「FEVER 时的全场金色氛围（叠在场景之上、暗角之下）」——
 * 所以它必须**最后**画（暗角是 DOM 层的事）。
 *
 * Pixi 版把它放在 `glow` 层（`entities` 之上、`floaters` 之下）——
 * 票 07 会在同一层挂 bloom。
 */

import { Container, Graphics, GraphicsPath } from 'pixi.js';
import type { FillGradient } from 'pixi.js';
import type { FrameContext } from './context';
import { destroyGradient, linearGradient } from './gradient';
import { setFill, setFillGradient, setStroke, attachPath } from './gfx';

/** 轨道能量带渐变的参考脉冲值。 */
const BAND_REF_PULSE = 0.5;

/** 轨道能量带渐变在参考脉冲下的 alpha（`0.1 + pulse*0.07`）。 */
const BAND_REF_ALPHA = 0.1 + BAND_REF_PULSE * 0.07;

export class FrenzyView {
  /** 容器（挂到 `glow` 层）。 */
  readonly container = new Container();

  private readonly gfx = new Graphics();
  private bandGradient: FillGradient | null = null;
  private readonly edgePath = new GraphicsPath();

  constructor() {
    this.container.addChild(this.gfx);
  }

  prepare(): void {
    if (this.bandGradient) return;
    this.bandGradient = linearGradient(
      [
        { offset: 0, color: 'rgba(255,210,74,0)' },
        { offset: 0.5, color: `rgba(255,210,74,${BAND_REF_ALPHA})` },
        { offset: 1, color: 'rgba(255,210,74,0)' },
      ],
      0.5,
      0,
      0.5,
      1,
    );
  }

  draw(fc: FrameContext): void {
    const g = this.gfx;
    g.clear();
    if (!fc.frenzyActive) return;
    const { width, height, laneY } = fc.layout;
    const pulse = 0.5 + 0.5 * Math.sin(fc.vt * 4.2);

    // 整体暖金洗色。
    setFill(g, `rgba(255,170,40,${0.05 + pulse * 0.035})`);
    g.beginPath();
    g.rect(0, 0, width, height);
    g.fill();

    // 两轨金色能量带。
    const gradient = this.bandGradient;
    if (gradient) {
      const alpha = (0.1 + pulse * 0.07) / BAND_REF_ALPHA;
      setFillGradient(g, gradient, alpha);
      g.beginPath();
      g.rect(0, laneY.top - 34, width, 68);
      g.fill();
      setFillGradient(g, gradient, alpha);
      g.beginPath();
      g.rect(0, laneY.bottom - 34, width, 68);
      g.fill();
    }

    // 边缘金色描边呼吸（同一个矩形描两次）。
    this.edgePath.clear();
    this.edgePath.rect(3, 3, width - 6, height - 6);
    setStroke(g, 16, `rgba(255,210,74,${0.08 + pulse * 0.07})`);
    attachPath(g, this.edgePath);
    g.stroke();
    setStroke(g, 6, `rgba(255,210,74,${0.22 + pulse * 0.2})`);
    attachPath(g, this.edgePath);
    g.stroke();
  }

  destroy(): void {
    destroyGradient(this.bandGradient);
    this.bandGradient = null;
  }
}
