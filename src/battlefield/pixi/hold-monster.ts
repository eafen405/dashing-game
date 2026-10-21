/**
 * 长按怪 —— 逐字搬自 `source.html:2059-2233`（`drawLongMonster`）。
 *
 * 长条胶囊 + 头部核心 + 进度槽 + 奖励刻度 + 切割线火花 + 提示标签。
 * 旧代码用 `m.long` 判长按怪、`m.done` 判「已完成」；新模型统一用
 * `kind === 'hold'` 与 `removed`（`escaped` 仍是长按怪专属状态，不是 `removed`）。
 *
 * **全局 alpha**：旧版用 `ctx.globalAlpha = esc ? 0.55 : 1` 覆盖整只怪。
 * 本 view 与普通怪**共用一个 `Graphics`**（由渲染器传入），不能改容器的 alpha，
 * 所以把 0.55 **乘进每一次填充 / 描边的 alpha** —— 效果等价。
 */

import type { Graphics } from 'pixi.js';
import { Container, GraphicsPath, Text } from 'pixi.js';
import type { FillGradient } from 'pixi.js';
import { LONG_COLOR, LONG_HOLD_TIME } from '../../game/constants';
import type { HoldMonster } from '../../game/types';
import type { FrameContext } from './context';
import { destroyGradient, linearGradient } from './gradient';
import {
  arcInto,
  circleInto,
  roundRectInto,
  setFill,
  setFillGradient,
  setStroke,
  attachPath,
} from './gfx';
import { clamp } from './math';
import { hexA, laneColorOf } from './palette';
import { createLabel } from './text';

/** 奖励刻度位置（旧 `source.html:2164` 的 `[0, 1/3, 1]`）。 */
const TICK_HEAD = 0;
const TICK_MID = 1 / 3;
const TICK_TAIL = 1;

export class HoldMonsterView {
  /** 容器（挂到 `entities` 层）。 */
  readonly container = new Container();

  /** 提示标签层（文本不进 `Graphics` —— 文本有自己的纹理）。 */
  private readonly textLayer = new Container();

  /** 主提示标签。 */
  private label: Text | null = null;
  /** 「头」标记。 */
  private headMark: Text | null = null;
  /** 「尾」标记。 */
  private tailMark: Text | null = null;
  /** 上一次写入标签的按住时间（0.1s 粒度）—— 避免每帧重建字符串。 */
  private lastHoldTick = -1;
  /** 上一次写入标签的文本。 */
  private lastLabel = '';

  /** 身体渐变缓存（按轨道色）。 */
  private readonly bodyGradients = new Map<string, FillGradient>();
  /** 进度槽渐变缓存（按轨道色）。 */
  private readonly progressGradients = new Map<string, FillGradient>();

  /** 复用路径。 */
  private readonly bodyPath = new GraphicsPath();
  private readonly ringPath = new GraphicsPath();
  private readonly cutPath = new GraphicsPath();
  private readonly labelBgPath = new GraphicsPath();

  constructor(private readonly gfx: Graphics) {
    this.container.addChild(this.textLayer);
  }

  prepare(): void {
    if (this.label) return;
    this.label = createLabel('', 11, '700');
    this.headMark = createLabel('头', 8, '700');
    this.tailMark = createLabel('尾', 8, '700');
    this.textLayer.addChild(this.label);
    this.textLayer.addChild(this.headMark);
    this.textLayer.addChild(this.tailMark);
  }

  /** 画一只长按怪。 */
  draw(fc: FrameContext, m: HoldMonster): void {
    const g = this.gfx;
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
    const ga = esc ? 0.55 : 1; // 旧 `ctx.globalAlpha`

    // 外发光（宽描边代替 shadowBlur）。
    const bodyGlow = m.anchored || inWindow ? 0.26 : 0.14;

    // 主体（长条胶囊）。
    const body = this.bodyGradientFor(c);
    if (body) {
      this.bodyPath.clear();
      roundRectInto(this.bodyPath, x, y - h / 2, len, h, h / 2);
      setFillGradient(g, body, ga);
      attachPath(g, this.bodyPath);
      g.fill();
    }
    setStroke(g, 10, hexA(c, bodyGlow), ga);
    attachPath(g, this.bodyPath);
    g.stroke();
    setStroke(g, 2, esc ? '#ff4d6d' : hexA(c, 0.9), ga);
    attachPath(g, this.bodyPath);
    g.stroke();

    // 外壳高光。
    setStroke(g, 1, 'rgba(255,255,255,.18)', ga);
    g.beginPath();
    g.moveTo(x + h * 0.55, y - h * 0.28);
    g.lineTo(x + len - h * 0.4, y - h * 0.28);
    g.stroke();

    // 节段。
    setStroke(g, 1.2, hexA(c, 0.32), ga);
    g.beginPath();
    const segs = 7;
    for (let i = 1; i < segs; i++) {
      const sx = x + (len * i) / segs;
      g.moveTo(sx, y - h * 0.3);
      g.lineTo(sx, y + h * 0.3);
    }
    g.stroke();

    // 头部核心（左端）。
    const headCol = esc ? '#ff4d6d' : inWindow ? '#ffffff' : LONG_COLOR;
    setFill(g, hexA(headCol, 0.28), ga);
    this.ringPath.clear();
    circleInto(this.ringPath, headX, y, h * 0.34);
    attachPath(g, this.ringPath);
    g.fill();
    setFill(g, headCol, ga);
    this.ringPath.clear();
    circleInto(this.ringPath, headX, y, h * 0.2);
    attachPath(g, this.ringPath);
    g.fill();
    setFill(g, '#071018', ga);
    this.ringPath.clear();
    circleInto(this.ringPath, headX, y, h * 0.1);
    attachPath(g, this.ringPath);
    g.fill();

    // 头进圈：脉冲提示环。
    if (inWindow) {
      const pl = 0.5 + 0.5 * Math.sin(fc.vt * 18);
      setStroke(g, 9, hexA(LONG_COLOR, 0.2), ga);
      this.ringPath.clear();
      arcInto(this.ringPath, headX, y, h * 0.85 + pl * 4, 0, Math.PI * 2);
      attachPath(g, this.ringPath);
      g.stroke();
      setStroke(g, 2.4, `rgba(255,255,255,${(0.45 + 0.45 * pl).toFixed(2)})`, ga);
      attachPath(g, this.ringPath);
      g.stroke();
    }

    // 尾刺（右端）。
    setFill(g, hexA(c, 0.85), ga);
    g.beginPath();
    g.moveTo(x + len - 2, y - h * 0.4);
    g.lineTo(x + len + h * 0.5, y);
    g.lineTo(x + len - 2, y + h * 0.4);
    g.closePath();
    g.fill();

    if (m.anchored && !esc) {
      this.drawAnchored(g, fc, m, c, x, y, len, h, prog, ga);
    } else if (!esc && x < width - 40) {
      this.drawHint(g, inWindow, x, y, h, width, ga);
    }
  }

  destroy(): void {
    for (const gradient of this.bodyGradients.values()) destroyGradient(gradient);
    for (const gradient of this.progressGradients.values()) destroyGradient(gradient);
    this.bodyGradients.clear();
    this.progressGradients.clear();
  }

  // ── 内部 ──────────────────────────────────────────────────

  /** 已锚定：进度槽 + 奖励刻度 + 切割线火花 + 标签。 */
  private drawAnchored(
    g: Graphics,
    fc: FrameContext,
    m: HoldMonster,
    c: string,
    x: number,
    y: number,
    len: number,
    h: number,
    prog: number,
    ga: number,
  ): void {
    const gx = x + h * 0.35;
    const gw = len - h * 0.7;
    const gy = y + h * 0.3;

    // 进度槽底。
    setStroke(g, 5, 'rgba(0,0,0,.55)', ga, 'round');
    g.beginPath();
    g.moveTo(gx, gy);
    g.lineTo(gx + gw, gy);
    g.stroke();

    // 进度（渐变 → 有面积的矩形）。
    if (prog > 0) {
      const gradient = this.progressGradientFor(c);
      if (gradient) {
        setFillGradient(g, gradient, ga);
        g.beginPath();
        g.rect(gx, gy - 2, gw * prog, 4);
        g.fill();
      }
    }

    // 头 / 1 秒 / 尾 三个奖励刻度。
    this.drawTick(g, gx, gw, gy, prog, TICK_HEAD, ga);
    this.drawTick(g, gx, gw, gy, prog, TICK_MID, ga);
    this.drawTick(g, gx, gw, gy, prog, TICK_TAIL, ga);

    // 切割线 + 火花。
    if (m.holding && prog < 1) {
      const cutX = gx + gw * prog;
      setStroke(g, 9, hexA(LONG_COLOR, 0.24), ga);
      this.cutPath.clear();
      this.cutPath.moveTo(cutX, y - h * 0.62);
      this.cutPath.lineTo(cutX, y + h * 0.62);
      attachPath(g, this.cutPath);
      g.stroke();
      setStroke(g, 2.6, '#ffffff', ga);
      attachPath(g, this.cutPath);
      g.stroke();
      setFill(g, LONG_COLOR, ga);
      g.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = fc.vt * 7 + i * (Math.PI / 2);
        g.circle(cutX + Math.cos(a) * 9, y + Math.sin(a) * 7, 1.7);
      }
      g.fill();
    }

    // 提示标签。
    const tick = Math.round(m.holdT * 10);
    if (tick !== this.lastHoldTick || m.holding !== this.lastHolding) {
      this.lastHoldTick = tick;
      this.lastHolding = m.holding;
      const label = m.holding
        ? '长按 ' + m.holdT.toFixed(1) + ' / ' + LONG_HOLD_TIME + 's'
        : '继续按住 ' + m.holdT.toFixed(1) + ' / ' + LONG_HOLD_TIME + 's';
      this.lastLabel = label;
      if (this.label) this.label.text = label;
    }
    const cx = x + len / 2;
    const cy = y - h / 2 - 18;
    const label = this.label;
    if (label) {
      label.visible = true;
      label.x = cx;
      label.y = cy + 0.5;
      label.tint = m.holding ? '#ffffff' : LONG_COLOR;
      label.alpha = 1;
      const tw = label.width;
      this.labelBgPath.clear();
      roundRectInto(this.labelBgPath, cx - tw / 2 - 8, cy - 9, tw + 16, 18, 9);
      setFill(g, 'rgba(8,12,24,.86)', ga);
      attachPath(g, this.labelBgPath);
      g.fill();
      setStroke(g, 1, hexA(LONG_COLOR, 0.8), ga);
      attachPath(g, this.labelBgPath);
      g.stroke();
    }

    // 头 / 尾 标记（画在条内，避开判定圈文字）。
    if (this.headMark) {
      this.headMark.visible = true;
      this.headMark.tint = LONG_COLOR;
      this.headMark.alpha = 0.72;
      this.headMark.x = x + h * 1.08;
      this.headMark.y = y - h * 0.24;
    }
    if (this.tailMark) {
      this.tailMark.visible = true;
      this.tailMark.tint = LONG_COLOR;
      this.tailMark.alpha = 0.72;
      this.tailMark.x = x + len - h * 0.52;
      this.tailMark.y = y - h * 0.24;
    }
  }

  /** 上一次写入标签时的「正在按住」状态。 */
  private lastHolding = false;

  /** 一个奖励刻度 —— 旧 `source.html:2165-2167`。 */
  private drawTick(
    g: Graphics,
    gx: number,
    gw: number,
    gy: number,
    prog: number,
    t: number,
    ga: number,
  ): void {
    setStroke(g, t === 0 ? 2.4 : 2, t <= prog + 0.001 ? '#ffffff' : hexA(LONG_COLOR, 0.55), ga);
    g.beginPath();
    g.moveTo(gx + gw * t, gy - 6);
    g.lineTo(gx + gw * t, gy + 6);
    g.stroke();
  }

  /** 接近 / 可点击提示。 */
  private drawHint(
    g: Graphics,
    inWindow: boolean,
    x: number,
    y: number,
    h: number,
    width: number,
    ga: number,
  ): void {
    const label = this.label;
    if (!label) return;
    const text = inWindow ? '点击起手！' : '头进圈后点击';
    if (this.lastLabel !== text) {
      this.lastLabel = text;
      label.text = text;
    }
    const cx = Math.min(x + 70, width - 60);
    const cy = y - h / 2 - 18;
    label.visible = true;
    label.x = cx;
    label.y = cy + 0.5;
    label.tint = inWindow ? '#ffffff' : hexA(LONG_COLOR, 0.9);
    label.alpha = 1;
    const tw = label.width;
    this.labelBgPath.clear();
    roundRectInto(this.labelBgPath, cx - tw / 2 - 8, cy - 9, tw + 16, 18, 9);
    setFill(g, inWindow ? 'rgba(18,30,10,.92)' : 'rgba(8,12,24,.8)', ga);
    attachPath(g, this.labelBgPath);
    g.fill();
    setStroke(g, inWindow ? 1.6 : 1, hexA(LONG_COLOR, inWindow ? 0.95 : 0.55), ga);
    attachPath(g, this.labelBgPath);
    g.stroke();
  }

  /** 身体渐变（按轨道色缓存）。 */
  private bodyGradientFor(color: string): FillGradient {
    const cached = this.bodyGradients.get(color);
    if (cached) return cached;
    const gradient = linearGradient(
      [
        { offset: 0, color: hexA(color, 0.85) },
        { offset: 0.45, color: '#0b1424' },
        { offset: 1, color: hexA(color, 0.35) },
      ],
      0.5,
      0,
      0.5,
      1,
    );
    this.bodyGradients.set(color, gradient);
    return gradient;
  }

  /** 进度槽渐变（按轨道色缓存）。 */
  private progressGradientFor(color: string): FillGradient {
    const cached = this.progressGradients.get(color);
    if (cached) return cached;
    const gradient = linearGradient(
      [
        { offset: 0, color: LONG_COLOR },
        { offset: 1, color },
      ],
      0,
      0.5,
      1,
      0.5,
    );
    this.progressGradients.set(color, gradient);
    return gradient;
  }
}
