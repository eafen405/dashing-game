/**
 * 普通怪（菱形晶体）—— 逐字搬自 `source.html:2235-2341`（`drawMonster`）。
 *
 * 旧代码里 `m.partner` / `m.pairPending` 是普通怪身上不存在的字段（靠 `undefined`
 * 判假），新模型统一用 `kind` 判别联合：`kind === 'twin'` 即「有伙伴」。
 * 其余（预警闪烁、暴击金圈、拖尾、内芯、眼睛）逐字照抄。
 *
 * **与长按怪共用一个 `Graphics`**（由渲染器传入）——
 * 这样才能保持旧代码「同一个循环里按类型分派」的交错 z 序。
 */

import type { Graphics } from 'pixi.js';
import { GraphicsPath } from 'pixi.js';
import type { FillGradient } from 'pixi.js';
import { GOLD, PAIR_COLOR, PAIR_WINDOW } from '../../game/constants';
import type { NormalMonster, TwinMonster } from '../../game/types';
import type { FrameContext } from './context';
import { destroyGradient, linearGradient } from './gradient';
import { arcInto, circleInto, setFill, setFillGradient, setStroke, attachPath } from './gfx';
import { clamp } from './math';
import { hexA, laneColorOf } from './palette';

export class MonsterView {
  /** 拖尾渐变缓存（按轨道色，最多 4 种）。 */
  private readonly trailGradients = new Map<string, FillGradient>();

  /** 复用路径。 */
  private readonly ringPath = new GraphicsPath();
  private readonly trailPath = new GraphicsPath();
  private readonly bodyPath = new GraphicsPath();
  private readonly innerPath = new GraphicsPath();

  constructor(private readonly gfx: Graphics) {}

  prepare(): void {
    // 无 DOM 依赖。
  }

  /** 画一只普通怪 / 双生怪。 */
  draw(fc: FrameContext, m: NormalMonster | TwinMonster): void {
    const g = this.gfx;
    const { hitX, zoneHalf, critHalf } = fc.layout;
    const c = laneColorOf(m.lane, fc.frenzyActive);
    const bob = Math.sin(m.phase) * 4;
    const x = m.x;
    const y = m.y + bob;
    const w = m.w;
    const h = m.h;

    // 预警：接近判定区时闪烁。
    const distToHit = m.x - hitX;
    const inZone = Math.abs(distToHit) <= zoneHalf;
    const missed = distToHit < -zoneHalf;
    if (missed) {
      // 越过打击点：警示光环。
      setStroke(g, 1.6, `rgba(255,77,109,${0.18 + 0.16 * Math.sin(fc.vt * 12)})`);
      this.ringPath.clear();
      arcInto(this.ringPath, x, y, w * 0.82, 0, Math.PI * 2);
      attachPath(g, this.ringPath);
      g.stroke();
    }
    if (inZone) {
      setFill(g, hexA(c, 0.1 + 0.06 * Math.sin(fc.vt * 22)));
      g.beginPath();
      g.ellipse(x, y, w * 0.85, h * 0.62);
      g.fill();
    }
    // 进入中心暴击区：金圈提示。
    if (Math.abs(distToHit) <= critHalf) {
      const cc = fc.frenzyActive ? '#ffffff' : GOLD;
      setStroke(g, 2, hexA(cc, 0.55 + 0.25 * Math.sin(fc.vt * 30)));
      this.ringPath.clear();
      arcInto(this.ringPath, x, y, Math.max(w * 0.9, 26), 0, Math.PI * 2);
      attachPath(g, this.ringPath);
      g.stroke();
    }

    // 双生成员：洋红光环；挂起时显示等待窗口。
    if (m.kind === 'twin' && m.partnerId !== null) {
      setStroke(g, 1.6, hexA(PAIR_COLOR, 0.45 + 0.25 * Math.sin(fc.vt * 8 + m.phase)));
      this.ringPath.clear();
      arcInto(this.ringPath, x, y, w * 0.95, 0, Math.PI * 2);
      attachPath(g, this.ringPath);
      g.stroke();
    }
    if (m.kind === 'twin' && m.pairPending) {
      const frac = clamp(m.pairT / PAIR_WINDOW, 0, 1);
      setStroke(g, 3, 'rgba(255,255,255,.9)');
      this.ringPath.clear();
      arcInto(this.ringPath, x, y, w * 1.05, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      attachPath(g, this.ringPath);
      g.stroke();
    }

    // 拖尾（旧版在 `translate(x, y)` 之后画，这里直接用世界坐标）。
    const trail = this.trailGradientFor(c);
    if (trail) {
      this.trailPath.clear();
      this.trailPath.moveTo(x, y - h * 0.25);
      this.trailPath.lineTo(x + w * 2.4, y);
      this.trailPath.lineTo(x, y + h * 0.25);
      this.trailPath.closePath();
      setFillGradient(g, trail);
      attachPath(g, this.trailPath);
      g.fill();
    }

    // 身体（菱形晶体）。
    setFill(g, '#101a2e');
    this.bodyPath.clear();
    this.bodyPath.moveTo(x - w * 0.62, y);
    this.bodyPath.lineTo(x - w * 0.1, y - h * 0.5);
    this.bodyPath.lineTo(x + w * 0.62, y);
    this.bodyPath.lineTo(x - w * 0.1, y + h * 0.5);
    this.bodyPath.closePath();
    attachPath(g, this.bodyPath);
    g.fill();
    const bodyC = missed ? '#ff4d6d' : c;
    setStroke(g, inZone ? 12 : 8, hexA(bodyC, inZone ? 0.3 : 0.16));
    g.stroke();
    setStroke(g, 2.5, bodyC);
    attachPath(g, this.bodyPath);
    g.stroke();

    // 内芯。
    const inner = 0.35 + 0.25 * Math.sin(fc.vt * 6 + m.phase);
    setFill(g, hexA(c, inner));
    this.innerPath.clear();
    this.innerPath.moveTo(x - w * 0.3, y);
    this.innerPath.lineTo(x - w * 0.05, y - h * 0.24);
    this.innerPath.lineTo(x + w * 0.3, y);
    this.innerPath.lineTo(x - w * 0.05, y + h * 0.24);
    this.innerPath.closePath();
    attachPath(g, this.innerPath);
    g.fill();

    // 眼睛。
    setFill(g, '#ffffff', 0.9);
    this.ringPath.clear();
    circleInto(this.ringPath, x - w * 0.16, y - h * 0.05, 2.1);
    attachPath(g, this.ringPath);
    g.fill();
    this.ringPath.clear();
    circleInto(this.ringPath, x - w * 0.16, y + h * 0.1, 2.1);
    attachPath(g, this.ringPath);
    g.fill();
  }

  destroy(): void {
    for (const gradient of this.trailGradients.values()) destroyGradient(gradient);
    this.trailGradients.clear();
  }

  /** 拖尾渐变（按轨道色缓存）。 */
  private trailGradientFor(color: string): FillGradient {
    const cached = this.trailGradients.get(color);
    if (cached) return cached;
    // 旧版：`createLinearGradient(w*0.5, 0, w*2.4, 0)`（怪物自身坐标系）。
    // 归一化到拖尾三角形的包围盒（宽 `2.4w`）→ `0.5w / 2.4w = 0.2083`。
    const gradient = linearGradient(
      [
        { offset: 0, color: hexA(color, 0.3) },
        { offset: 1, color: hexA(color, 0) },
      ],
      0.2083,
      0.5,
      1,
      0.5,
    );
    this.trailGradients.set(color, gradient);
    return gradient;
  }
}
