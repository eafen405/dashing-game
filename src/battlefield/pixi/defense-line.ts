/**
 * 防线 —— 角色身前「碰到怪」的竖向接触面。
 *
 * 角色默认在下轨地面上跑，所以接触面只画在下轨地面之上：
 * 上轨是天空，上轨漏怪从头顶飞过，不会撞到地里的人。
 */

import { Container, Graphics } from 'pixi.js';
import type { FillGradient } from 'pixi.js';
import type { FrameContext } from './context';
import { destroyGradient, linearGradient } from './gradient';
import { setFill } from './gfx';
import { laneGroundY } from './ground';

/** 防线宽度（旧版 `lineWidth = 2`）。 */
const LINE_W = 2;

export class DefenseLineView {
  /** 容器（挂到 `defense` 层）。 */
  readonly container = new Container();

  private readonly gfx = new Graphics();
  private gradient: FillGradient | null = null;

  constructor() {
    this.container.addChild(this.gfx);
  }

  prepare(): void {
    if (!this.gradient) {
      this.gradient = linearGradient(
        [
          { offset: 0, color: 'rgba(255,255,255,0)' },
          { offset: 0.35, color: 'rgba(255,255,255,.09)' },
          { offset: 0.85, color: 'rgba(255,255,255,.14)' },
          { offset: 1, color: 'rgba(255,255,255,0)' },
        ],
        0.5,
        0,
        0.5,
        1,
      );
    }
  }

  /** 尺寸变化时无需重建（局部渐变自动跟随形状）。 */
  resize(): void {
    // 渐变是局部坐标，形状随布局每帧重画。
  }

  draw(fc: FrameContext): void {
    const g = this.gfx;
    g.clear();
    if (!this.gradient) return;

    const { layout } = fc;
    const x = layout.playerX + layout.playerR * 1.15 + 8;
    const gy = laneGroundY(layout, 'bottom');
    const y0 = gy - layout.playerR * 1.45;
    const y1 = gy + layout.playerR * 0.08;

    setFill(g, '#ffffff');
    g.beginPath();
    g.rect(x - LINE_W / 2, y0, LINE_W, y1 - y0);
    g.fill(this.gradient);
  }

  destroy(): void {
    destroyGradient(this.gradient);
    this.gradient = null;
  }
}
