/**
 * 双生锁链 —— 逐字搬自 `source.html:1983-2050`（`drawPairLinks`）。
 *
 * **修法（结构性热点 ①·O(n²)）**：
 *
 * 旧代码在遍历 `monsters` 的内层做 `monsters.indexOf(p) < i`（`source.html:1989`），
 * 外层 O(n) × 内层 O(n) = **O(n²)**，每帧都跑。
 *
 * 旧代码的**实际意图**是「每组双生只画一次锁链，且从上轨那只出发」——
 * 因为 `spawnPair` 恒定先 push 上轨再 push 下轨（`source.html:851-853`），
 * 且 `filter` 保序，所以 `indexOf(p) < i` 恒等价于「`m` 是上轨那只」
 * （推导见 `draw-port-map-b.md` §5.1）。
 *
 * 这里改成：**链主 = 上轨那只**（`kind === 'twin' && lane === 'top'`），
 * O(1) 判定，零分配，不需要下标索引表。
 * 渲染器在每帧预扫里已经把配对解析好（`fc.twinLinks`），本 view 只负责画。
 */

import { PAIR_COLOR } from '../../game/constants';
import type { TwinMonster } from '../../game/types';
import type { FrameContext } from './context';
import { hexA, roundRectPath } from './paths';

/** 锁链虚线样式（旧 `source.html:2010`）—— 提到模块级，避免每帧建数组。 */
const CHAIN_DASH = [9, 8] as const;

export class TwinView {
  /** 画全部锁链（每组一条）。 */
  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    for (let i = 0; i < fc.twinLinkCount; i++) {
      const link = fc.twinLinks[i];
      if (!link) continue;
      this.drawLink(ctx, fc, link.a, link.b);
    }
  }

  private drawLink(
    ctx: CanvasRenderingContext2D,
    fc: FrameContext,
    m: TwinMonster,
    p: TwinMonster,
  ): void {
    const vt = fc.vt;
    const ay = m.y + Math.sin(m.phase) * 4;
    const by = p.y + Math.sin(p.phase) * 4;
    const active = !!(m.pairPending || p.pairPending);
    const pulse = 0.5 + 0.5 * Math.sin(vt * (active ? 20 : 4.5));
    const alpha = active ? 0.75 + 0.25 * pulse : 0.4 + 0.22 * pulse;

    ctx.save();
    ctx.lineCap = 'round';
    // 外发光
    ctx.strokeStyle = hexA(PAIR_COLOR, alpha * 0.3);
    ctx.lineWidth = active ? 12 : 8;
    ctx.beginPath();
    ctx.moveTo(m.x, ay);
    ctx.lineTo(p.x, by);
    ctx.stroke();

    // 锁链主线（流动虚线）
    ctx.strokeStyle = hexA(PAIR_COLOR, alpha);
    ctx.lineWidth = active ? 2.8 : 1.9;
    ctx.setLineDash(CHAIN_DASH);
    ctx.lineDashOffset = -vt * 46;
    ctx.beginPath();
    ctx.moveTo(m.x, ay);
    ctx.lineTo(p.x, by);
    ctx.stroke();
    ctx.setLineDash([]);

    // 两端节点
    this.drawNode(ctx, m.x, ay, active);
    this.drawNode(ctx, p.x, by, active);

    // 中线标签
    const mx = (m.x + p.x) / 2;
    const my = (ay + by) / 2;
    const label = active ? '补齐另一轨' : '双生';
    ctx.font = "600 11px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width;
    const bw = tw + 16;
    ctx.fillStyle = 'rgba(12,16,32,.86)';
    roundRectPath(ctx, mx - bw / 2, my - 9, bw, 18, 9);
    ctx.fill();
    ctx.strokeStyle = hexA(PAIR_COLOR, active ? 0.95 : 0.62);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = active ? '#ffffff' : hexA(PAIR_COLOR, 0.95);
    ctx.fillText(label, mx, my + 0.5);
    ctx.restore();
  }

  private drawNode(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    active: boolean,
  ): void {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, active ? 3.4 : 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexA(PAIR_COLOR, 0.9);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, active ? 8 : 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}
