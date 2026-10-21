/**
 * 刀光 —— 逐字搬自 `source.html:2343-2424`（`drawSlashes`）。
 *
 * 三段叠加：飞行斩（从剑尖飞向打击点的新月）、打击点新月、竖向光柱。
 * 颜色按轨道取（FEVER 时会变），所以走 `laneColorOf`。
 *
 * **实现说明**：
 *
 * - 旧版用 `ctx.translate` + `ctx.rotate` 施加在绘制上；Pixi 版用
 *   **容器变换**（`position` / `rotation`）承载，每道刀光两个容器
 *   （飞行斩固定旋转 `-1.15`，打击点新月旋转 `ang`），全部**池化复用**。
 * - 竖向光柱是渐变描边；Pixi 的局部渐变需要**有面积的包围盒**，
 *   所以光柱改成 3px 宽的**矩形**（覆盖范围与 3px 描边一致）。
 */

import { Container, Graphics } from 'pixi.js';
import type { FillGradient } from 'pixi.js';
import type { FrameContext } from './context';
import { destroyGradient, linearGradient } from './gradient';
import { arcPath, attachPath, setFillGradient, setStroke } from './gfx';
import { clamp, easeOutCubic, lerp } from './math';
import { hexA, laneColorOf } from './palette';

/** 同时存在的刀光上限（池子大小）。 */
const MAX_SLASHES = 10;

/** 竖向光柱半宽（旧版 `lineWidth = 3`）。 */
const BEAM_HALF_W = 1.5;

/** 光柱渐变的参考 alpha（`vp = 0` 时的 `0.45`）。 */
const BEAM_REF_ALPHA = 0.45;

/** 一道刀光的复用槽位。 */
interface SlashSlot {
  /** 飞行斩的容器（`position` = 斩击点，`rotation` = -1.15）。 */
  flyRoot: Container;
  /** 飞行斩的图形。 */
  flyGfx: Graphics;
  /** 打击点新月的容器。 */
  hitRoot: Container;
  /** 打击点新月的图形。 */
  hitGfx: Graphics;
}

export class SlashView {
  /** 容器（挂到 `entities` 层）。 */
  readonly container = new Container();

  /** 竖向光柱（世界坐标，不旋转）—— 所有刀光共用一个 `Graphics`。 */
  private readonly beamGfx = new Graphics();

  private readonly slots: SlashSlot[] = [];

  /** 光柱渐变缓存（按颜色）。 */
  private readonly beamGradients = new Map<string, FillGradient>();

  constructor() {
    this.container.addChild(this.beamGfx);
    for (let i = 0; i < MAX_SLASHES; i++) {
      const flyRoot = new Container();
      const flyGfx = new Graphics();
      flyRoot.addChild(flyGfx);
      const hitRoot = new Container();
      const hitGfx = new Graphics();
      hitRoot.addChild(hitGfx);
      this.container.addChild(flyRoot);
      this.container.addChild(hitRoot);
      this.slots.push({ flyRoot, flyGfx, hitRoot, hitGfx });
    }
  }

  prepare(): void {
    // 无 DOM 依赖。
  }

  draw(fc: FrameContext): void {
    const list = fc.effects.slashes;
    const n = Math.min(list.length, this.slots.length);
    const beam = this.beamGfx;
    beam.clear();

    for (let i = 0; i < n; i++) {
      const sl = list[i];
      const slot = this.slots[i];
      if (!sl || !slot) continue;
      const p = clamp(sl.t / sl.life, 0, 1);
      const color = laneColorOf(sl.lane, fc.frenzyActive);

      // 1) 飞行斩：从剑尖飞向打击点的新月。
      const flyP = clamp(p / 0.34, 0, 1);
      const flyGfx = slot.flyGfx;
      flyGfx.clear();
      if (flyP < 1) {
        const fx = lerp(sl.x0, sl.x, easeOutCubic(flyP));
        const scale = 0.55 + 0.45 * flyP;
        const a = 0.55 + 0.45 * (1 - flyP);
        slot.flyRoot.visible = true;
        slot.flyRoot.position.set(fx, sl.y);
        slot.flyRoot.rotation = -1.15;
        // 第一道：外圈彩色宽描边。
        const outer = arcPath(0, 0, 20 * scale, -1.0, 1.0);
        setStroke(flyGfx, 12 * scale, color, a * 0.32, 'round');
        flyGfx.beginPath();
        flyGfx.context.path(outer);
        flyGfx.stroke();
        // 第二道：白色亮描边（同一路径 —— 必须重新挂一次，见 gfx.ts 的说明）。
        setStroke(flyGfx, 4.5 * scale, '#ffffff', a, 'round');
        attachPath(flyGfx, outer);
        flyGfx.stroke();
        // 第三道：外圈彩色细描边（另一条路径）。
        setStroke(flyGfx, 2.6 * scale, color, 1, 'round');
        flyGfx.beginPath();
        flyGfx.context.path(arcPath(0, 0, 26 * scale, -0.95, 0.95));
        flyGfx.stroke();
      } else {
        slot.flyRoot.visible = false;
      }

      // 2) 打击点新月刀光。
      const cp = clamp((p - 0.1) / 0.62, 0, 1);
      const hitGfx = slot.hitGfx;
      hitGfx.clear();
      if (cp > 0) {
        const ang = -0.95 + cp * 0.62;
        const len = 22 + cp * 54;
        slot.hitRoot.visible = true;
        slot.hitRoot.position.set(sl.x, sl.y);
        slot.hitRoot.rotation = ang;
        const crescent = arcPath(0, 0, len, -1.05, 1.05);
        setStroke(hitGfx, 14 - cp * 6, color, (1 - cp) * 0.3, 'round');
        hitGfx.beginPath();
        hitGfx.context.path(crescent);
        hitGfx.stroke();
        setStroke(hitGfx, 7 - cp * 4, '#ffffff', 1 - cp, 'round');
        attachPath(hitGfx, crescent);
        hitGfx.stroke();
        setStroke(hitGfx, 3.4 - cp * 1.8, color, 1, 'round');
        hitGfx.beginPath();
        hitGfx.context.path(arcPath(0, 0, len + 9, -0.95, 0.95));
        hitGfx.stroke();
      } else {
        slot.hitRoot.visible = false;
      }

      // 3) 打击点竖向光柱（世界坐标）。
      const vp = clamp(p / 0.55, 0, 1);
      if (vp > 0) {
        const hgt = 46 * Math.sin(vp * Math.PI * 0.9);
        const gradient = this.beamGradientFor(color);
        if (gradient) {
          setFillGradient(beam, gradient, 1 - vp * 0.6);
          beam.beginPath();
          beam.rect(sl.x - BEAM_HALF_W, sl.y - hgt, BEAM_HALF_W * 2, hgt * 2);
          beam.fill();
        }
      }
    }

    for (let i = n; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      slot.flyRoot.visible = false;
      slot.hitRoot.visible = false;
    }
  }

  destroy(): void {
    for (const gradient of this.beamGradients.values()) destroyGradient(gradient);
    this.beamGradients.clear();
  }

  /** 光柱渐变（按颜色缓存 —— 只有 4 种可能的轨道色）。 */
  private beamGradientFor(color: string): FillGradient {
    const cached = this.beamGradients.get(color);
    if (cached) return cached;
    const gradient = linearGradient(
      [
        { offset: 0, color: hexA(color, 0) },
        { offset: 0.5, color: hexA(color, BEAM_REF_ALPHA) },
        { offset: 1, color: hexA(color, 0) },
      ],
      0.5,
      0,
      0.5,
      1,
    );
    this.beamGradients.set(color, gradient);
    return gradient;
  }
}
