/**
 * 双生锁链 —— 逐字搬自 `source.html:1983-2050`（`drawPairLinks`）。
 *
 * **修法（结构性热点 ①·O(n²)）**：旧代码在内层做 `monsters.indexOf(p) < i`
 * （`source.html:1989`），外层 O(n) × 内层 O(n) = **O(n²)**，每帧都跑。
 * 现在由渲染器每帧预扫出「链主 = 上轨那只」，O(1) 判定，零分配。
 *
 * **虚线**：Pixi v8 的描边**不支持虚线**（`StrokeAttributes` 只有
 * width / alignment / cap / join / miterLimit / pixelLine），
 * 所以流动虚线用**手工分段**实现：沿锁链方向按 `[9, 8]` 的节奏切段，
 * 段相位随 `vt` 推进（与旧版 `setLineDash([9,8])` + `lineDashOffset = -vt*46` 同口径）。
 */

import { Container, Graphics, GraphicsPath, Text } from 'pixi.js';
import type { FrameContext, TwinLink } from './context';
import { PAIR_COLOR } from '../../game/constants';
import { arcInto, circleInto, roundRectInto, setFill, setStroke, attachPath } from './gfx';
import { hexA } from './palette';
import { createLabel } from './text';

/** 虚线节奏（旧 `source.html:2010` 的 `[9, 8]`）。 */
const DASH = 9;
const GAP = 8;
const PERIOD = DASH + GAP;

/** 同时存在的锁链数上限（每组一条，最多两组）。 */
const MAX_LINKS = 2;

export class TwinView {
  /** 容器（挂到 `entities` 层）。 */
  readonly container = new Container();

  private readonly gfx = new Graphics();
  private readonly textLayer = new Container();

  /** 中线标签（每组一个）。 */
  private readonly labels: Text[] = [];

  /** 复用路径。 */
  private readonly nodePath = new GraphicsPath();
  private readonly labelBgPath = new GraphicsPath();

  constructor() {
    this.container.addChild(this.gfx);
    this.container.addChild(this.textLayer);
  }

  prepare(): void {
    if (this.labels.length > 0) return;
    for (let i = 0; i < MAX_LINKS; i++) {
      const label = createLabel('双生', 11, '600');
      label.visible = false;
      this.labels.push(label);
      this.textLayer.addChild(label);
    }
  }

  draw(fc: FrameContext): void {
    const g = this.gfx;
    g.clear();
    const count = fc.twinLinkCount;
    for (let i = 0; i < count; i++) {
      const link = fc.twinLinks[i];
      const label = this.labels[i];
      if (!link) continue;
      this.drawLink(g, fc, link, label ?? null);
    }
    for (let i = count; i < this.labels.length; i++) {
      const label = this.labels[i];
      if (label) label.visible = false;
    }
  }

  destroy(): void {
    // 文本纹理随 `app.destroy` 一起释放。
  }

  // ── 内部 ──────────────────────────────────────────────────

  private drawLink(g: Graphics, fc: FrameContext, link: TwinLink, label: Text | null): void {
    const m = link.a;
    const p = link.b;
    const vt = fc.vt;
    const ay = m.y + Math.sin(m.phase) * 4;
    const by = p.y + Math.sin(p.phase) * 4;
    const active = !!(m.pairPending || p.pairPending);
    const pulse = 0.5 + 0.5 * Math.sin(vt * (active ? 20 : 4.5));
    const alpha = active ? 0.75 + 0.25 * pulse : 0.4 + 0.22 * pulse;

    // 外发光。
    setStroke(g, active ? 12 : 8, hexA(PAIR_COLOR, alpha * 0.3), 1, 'round');
    g.beginPath();
    g.moveTo(m.x, ay);
    g.lineTo(p.x, by);
    g.stroke();

    // 锁链主线（流动虚线）。
    setStroke(g, active ? 2.8 : 1.9, hexA(PAIR_COLOR, alpha), 1, 'round');
    g.beginPath();
    this.dashLine(g, m.x, ay, p.x, by, vt * 46);
    g.stroke();

    // 两端节点。
    this.drawNode(g, m.x, ay, active);
    this.drawNode(g, p.x, by, active);

    // 中线标签。
    const mx = (m.x + p.x) / 2;
    const my = (ay + by) / 2;
    const text = active ? '补齐另一轨' : '双生';
    if (label) {
      label.visible = true;
      if (label.text !== text) label.text = text;
      label.x = mx;
      label.y = my + 0.5;
      label.tint = active ? '#ffffff' : PAIR_COLOR;
      label.alpha = active ? 1 : 0.95;
      const tw = label.width;
      this.labelBgPath.clear();
      roundRectInto(this.labelBgPath, mx - (tw + 16) / 2, my - 9, tw + 16, 18, 9);
      setFill(g, 'rgba(12,16,32,.86)');
      attachPath(g, this.labelBgPath);
      g.fill();
      setStroke(g, 1.2, hexA(PAIR_COLOR, active ? 0.95 : 0.62));
      attachPath(g, this.labelBgPath);
      g.stroke();
    }
  }

  /** 一条节点圆环。 */
  private drawNode(g: Graphics, x: number, y: number, active: boolean): void {
    setFill(g, '#ffffff');
    this.nodePath.clear();
    circleInto(this.nodePath, x, y, active ? 3.4 : 2.6);
    attachPath(g, this.nodePath);
    g.fill();
    setStroke(g, 1.6, hexA(PAIR_COLOR, 0.9));
    this.nodePath.clear();
    arcInto(this.nodePath, x, y, active ? 8 : 6, 0, Math.PI * 2);
    attachPath(g, this.nodePath);
    g.stroke();
  }

  /**
   * 流动虚线（手工分段）。
   *
   * @param phase 虚线相位（px）—— 旧版是 `lineDashOffset = -vt * 46`。
   */
  private dashLine(g: Graphics, x0: number, y0: number, x1: number, y1: number, phase: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;
    const ux = dx / len;
    const uy = dy / len;
    const offset = phase % PERIOD;
    let t = -offset;
    while (t < len) {
      const t0 = t < 0 ? 0 : t;
      const t1 = Math.min(len, t + DASH);
      if (t1 > t0) {
        g.moveTo(x0 + ux * t0, y0 + uy * t0);
        g.lineTo(x0 + ux * t1, y0 + uy * t1);
      }
      t += PERIOD;
    }
  }
}
