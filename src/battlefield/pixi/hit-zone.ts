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
 *
 * **实现说明**：
 *
 * - 外圈 / 内圈都是「填充 + 两道描边」。Pixi v8 的 `fill()` → `stroke()` 会复用路径，
 *   但**第二道描边不会**（`stroke()` 之后 `stroke()` 走的是退化路径），
 *   所以用 `GraphicsPath` 把圆存下来，描第二道时重新挂一次。
 * - 外圈光晕是径向渐变，alpha 逐帧变 —— 渐变本体按参考脉冲值烘焙一次，
 *   每帧的实时 alpha 用 `fill` 的整体 alpha 施加（见 `gradient.ts` 的说明）。
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { FillGradient } from 'pixi.js';
import type { Lane } from '../../game/types';
import type { FrameContext } from './context';
import { destroyGradient, radialGradient } from './gradient';
import { circlePath, setFill, setFillGradient, setStroke } from './gfx';
import { clamp } from './math';
import { GOLD, hexA, laneColorOf } from './palette';
import { createLabel } from './text';

/** 光晕渐变的参考脉冲值（脉冲区间 0..1 的中点）。 */
const GLOW_REF_PULSE = 0.5;

/** 光晕渐变在参考脉冲下的外圈 alpha（`0.16 + pulse*0.09`）。 */
const GLOW_REF_ALPHA = 0.16 + GLOW_REF_PULSE * 0.09;

export class HitZoneView {
  /** 容器（挂到 `entities` 层）。 */
  readonly container = new Container();

  private readonly gfx = new Graphics();
  /**
   * 外圈光晕（票 07：挂到 `glow` 层，参与 bloom）。
   *
   * **不**挂在 `container` 下 —— 渲染器把它单独放进 `glow` 层。
   * 光晕是半透明径向渐变，没有遮挡语义，挪到最上层只会被 bloom 提亮。
   */
  readonly haloGfx = new Graphics();
  private readonly textLayer = new Container();

  /** 光晕渐变缓存（按颜色字符串）。 */
  private readonly glowGradients = new Map<string, FillGradient>();

  /** 「暴击」标签（每轨一个）。 */
  private readonly critLabels: Text[] = [];
  /** 「普攻」标签（每轨一个）。 */
  private readonly normalLabels: Text[] = [];
  /** 「打击点 · 点击上半屏 / 下半屏」标签（每轨一个）。 */
  private readonly hitLabels: Text[] = [];

  constructor() {
    this.container.addChild(this.gfx);
    this.container.addChild(this.textLayer);
  }

  prepare(): void {
    if (this.critLabels.length === 0) {
      for (const lane of ['top', 'bottom'] as const) {
        const crit = createLabel('暴击', 10, '600');
        const normal = createLabel('普攻', 10, '600');
        const hit = createLabel(lane === 'top' ? '打击点 · 点击上半屏' : '打击点 · 点击下半屏', 11, '600');
        this.critLabels.push(crit);
        this.normalLabels.push(normal);
        this.hitLabels.push(hit);
        this.textLayer.addChild(crit);
        this.textLayer.addChild(normal);
        this.textLayer.addChild(hit);
      }
    }
  }

  draw(fc: FrameContext): void {
    const g = this.gfx;
    g.clear();
    const halo = this.haloGfx;
    halo.clear();
    const pulse = 0.5 + 0.5 * Math.sin(fc.vt * 5);
    this.drawHalo(halo, fc, 'top', fc.layout.laneY.top, pulse);
    this.drawHalo(halo, fc, 'bottom', fc.layout.laneY.bottom, pulse);
    this.drawZone(g, fc, 'top', fc.layout.laneY.top, pulse);
    this.drawZone(g, fc, 'bottom', fc.layout.laneY.bottom, pulse);
  }

  destroy(): void {
    for (const gradient of this.glowGradients.values()) destroyGradient(gradient);
    this.glowGradients.clear();
  }

  // ── 内部 ──────────────────────────────────────────────────

  /**
   * 外圈光晕（径向渐变）—— 画在 `glow` 层（票 07：参与 bloom）。
   */
  private drawHalo(
    g: Graphics,
    fc: FrameContext,
    lane: Lane,
    y: number,
    pulse: number,
  ): void {
    const { layout } = fc;
    const R = layout.zoneHalf;
    const color = laneColorOf(lane, fc.frenzyActive);
    const glow = this.glowGradientFor(color);
    if (!glow) return;
    setFillGradient(g, glow, (0.16 + pulse * 0.09) / GLOW_REF_ALPHA);
    g.beginPath();
    g.circle(layout.hitX, y, R * 1.5);
    g.fill();
  }

  private drawZone(
    g: Graphics,
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

    // 外圈：普攻判定（填充 + 两道描边）。
    const outer = circlePath(hitX, y, R);
    setFill(g, hexA(color, 0.06 + pulse * 0.035));
    g.beginPath();
    g.context.path(outer);
    g.fill();
    setStroke(g, 8, hexA(color, 0.13 + pulse * 0.05));
    g.stroke();
    setStroke(g, 2.5, hexA(color, 0.72 + pulse * 0.26));
    g.beginPath();
    g.context.path(outer);
    g.stroke();

    // 内圈：暴击判定（填充 + 两道描边）。
    const inner = circlePath(hitX, y, r);
    setFill(g, hexA(critCol, 0.17 + pulse * 0.09));
    g.beginPath();
    g.context.path(inner);
    g.fill();
    setStroke(g, 8, hexA(critCol, 0.13 + pulse * 0.05));
    g.stroke();
    setStroke(g, 2.5, hexA(critCol, 0.78 + pulse * 0.22));
    g.beginPath();
    g.context.path(inner);
    g.stroke();

    // 中心点。
    setFill(g, hexA(color, 0.95));
    g.beginPath();
    g.circle(hitX, y, 3.4);
    g.fill();

    // 两环之间的区域标注。
    const idx = lane === 'top' ? 0 : 1;
    const critLabel = this.critLabels[idx];
    const normalLabel = this.normalLabels[idx];
    const hitLabel = this.hitLabels[idx];
    if (critLabel) {
      critLabel.tint = critCol;
      critLabel.alpha = 0.9;
      critLabel.x = hitX;
      critLabel.y = y - r - 9;
    }
    if (normalLabel) {
      normalLabel.tint = color;
      normalLabel.alpha = 0.8;
      normalLabel.x = hitX;
      normalLabel.y = y + r + 10;
    }

    // 标签（放在两轨之外，避免重叠）；长按敌人占用该轨时隐藏，避免干扰起手提示。
    const longHere = fc.longInLane[lane];
    const labelY = clamp(lane === 'top' ? y - R - 16 : y + R + 18, 12, layout.height - 12);
    if (hitLabel) {
      hitLabel.visible = !longHere;
      hitLabel.tint = color;
      hitLabel.alpha = 0.66;
      hitLabel.x = hitX;
      hitLabel.y = labelY;
    }

    // 方向箭头。
    setStroke(g, 1.5, hexA(color, 0.28));
    g.beginPath();
    g.moveTo(hitX + R + 30, y);
    g.lineTo(hitX + R + 12, y);
    g.moveTo(hitX + R + 19, y - 5);
    g.lineTo(hitX + R + 12, y);
    g.lineTo(hitX + R + 19, y + 5);
    g.stroke();
  }

  /**
   * 光晕渐变（按颜色缓存 —— 只有 4 种可能的轨道色）。
   *
   * 渐变本体按参考脉冲值烘焙（`GLOW_REF_ALPHA`），
   * 每帧的实时 alpha 由 `fill` 的整体 alpha 承担。
   */
  private glowGradientFor(color: string): FillGradient {
    const cached = this.glowGradients.get(color);
    if (cached) return cached;
    const gradient = radialGradient(
      [
        { offset: 0, color: hexA(color, GLOW_REF_ALPHA) },
        { offset: 0.55, color: hexA(color, 0.07 + GLOW_REF_PULSE * 0.05) },
        { offset: 1, color: 'rgba(0,0,0,0)' },
      ],
      0.5,
      0.5,
      0,
      0.5,
    );
    this.glowGradients.set(color, gradient);
    return gradient;
  }
}
