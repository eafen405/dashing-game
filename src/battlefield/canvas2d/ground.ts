/**
 * 地面 —— 角色行走的陆地。
 *
 * 上缘贴着顶轨角色的脚底，向下铺满屏幕；随世界速度左移的碎石 / 草屑
 * 与怪物移速一致，于是画面读成「角色在地面上向前走、路上遇到怪」，
 * 而不是「怪从右边冲过来」。
 *
 * 静态渐变与碎石位置只在 `resize()` 时生成；每帧只画，不分配。
 */

import type { Lane, Layout } from '../../game/types';
import type { FrameContext } from './context';

/** 角色脚底相对轨道中心的偏移（与 PlayerView 的腿长一致）。 */
export const FEET_OFFSET_R = 0.94;

/** 某条轨道的地面线（角色脚底 / 轨道光带所在的 y）。 */
export function laneGroundY(layout: Layout, lane: Lane): number {
  return layout.laneY[lane] + layout.playerR * FEET_OFFSET_R;
}

interface Speck {
  x: number;
  y: number;
  rx: number;
  ry: number;
  a: number;
  /** 0 = 小碎石，1 = 大石块，2 = 大块暗色土斑，3 = 草簇。 */
  kind: 0 | 1 | 2 | 3;
}

/** 碎石的生成数量。 */
const SPECK_COUNT = 96;

export class GroundView {
  private ownerCtx: CanvasRenderingContext2D | null = null;
  private gradient: CanvasGradient | null = null;
  private pathGradient: CanvasGradient | null = null;
  private specks: Speck[] = [];
  private w = 0;
  private h = 0;

  /** 尺寸变化时重建渐变与碎石。 */
  resize(layout: Layout): void {
    this.w = layout.width;
    this.h = layout.height;
    this.gradient = null;
    this.pathGradient = null;
    this.buildSpecks(layout);
  }

  private buildSpecks(layout: Layout): void {
    const top = this.topOf(layout);
    const span = Math.max(1, this.h - top);
    this.specks.length = 0;
    for (let i = 0; i < SPECK_COUNT; i++) {
      const d = Math.random(); // 0 = 近地平线，1 = 近屏幕底部
      const kind: Speck['kind'] = i % 13 === 0 ? 3 : i % 11 === 0 ? 2 : i % 7 === 0 ? 1 : 0;
      const size = 0.9 + d * 2.8;
      const y = top + 4 + Math.pow(d, 1.35) * (span - 10);
      if (kind === 2) {
        this.specks.push({
          x: Math.random() * (this.w + 160),
          y,
          rx: 22 + Math.random() * 42,
          ry: 3 + Math.random() * 5,
          a: 0.04 + Math.random() * 0.03,
          kind,
        });
        continue;
      }
      if (kind === 3) {
        this.specks.push({
          x: Math.random() * (this.w + 80),
          y,
          rx: 2 + Math.random() * 2.6,
          ry: 4 + d * 7 + Math.random() * 3,
          a: 0.1 + d * 0.14,
          kind,
        });
        continue;
      }
      this.specks.push({
        x: Math.random() * (this.w + 80),
        y,
        rx: kind === 1 ? size * (1.8 + Math.random() * 1.8) : size * (1.1 + Math.random() * 2.1),
        ry: kind === 1 ? 1.4 + size * 0.3 : 0.5 + size * 0.2,
        a: 0.08 + d * 0.2 + Math.random() * 0.06,
        kind,
      });
    }
  }

  /** 地面近地平线的上缘：比顶轨脚底再高一点，让鞋底踩在土里。 */
  private topOf(layout: Layout): number {
    return laneGroundY(layout, 'top') - layout.playerR * 0.18;
  }

  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    if (this.ownerCtx !== ctx) {
      this.ownerCtx = ctx;
      this.gradient = null;
      this.pathGradient = null;
    }
    const layout = fc.layout;
    const w = this.w || layout.width;
    const h = this.h || layout.height;
    const top = this.topOf(layout);
    const span = h - top;
    if (span <= 0) return;

    if (!this.gradient) {
      const g = ctx.createLinearGradient(0, top, 0, h);
      g.addColorStop(0, 'rgba(28,54,68,.8)');
      g.addColorStop(0.08, 'rgba(14,30,42,.94)');
      g.addColorStop(0.45, 'rgba(8,17,26,.98)');
      g.addColorStop(1, 'rgba(4,8,14,1)');
      this.gradient = g;
    }
    ctx.fillStyle = this.gradient;
    ctx.fillRect(0, top, w, span + 2);

    // 角色行走的土路：一条横穿画面的柔和暖色带，脚底正好落在路面上
    const pathY = layout.height / 2 + layout.playerR * FEET_OFFSET_R;
    const pathH = layout.playerR * 1.2;
    if (!this.pathGradient) {
      const pg = ctx.createLinearGradient(0, pathY - pathH / 2, 0, pathY + pathH / 2);
      pg.addColorStop(0, 'rgba(104,98,76,0)');
      pg.addColorStop(0.3, 'rgba(104,98,76,.07)');
      pg.addColorStop(0.5, 'rgba(118,108,82,.12)');
      pg.addColorStop(0.7, 'rgba(104,98,76,.07)');
      pg.addColorStop(1, 'rgba(104,98,76,0)');
      this.pathGradient = pg;
    }
    ctx.fillStyle = this.pathGradient;
    ctx.fillRect(0, pathY - pathH / 2, w, pathH);

    // 地平线
    const line = ctx.createLinearGradient(0, 0, w, 0);
    line.addColorStop(0, 'rgba(120,210,255,0)');
    line.addColorStop(0.22, 'rgba(120,210,255,.16)');
    line.addColorStop(0.62, 'rgba(120,210,255,.09)');
    line.addColorStop(1, 'rgba(120,210,255,0)');
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, top + 0.5);
    ctx.lineTo(w, top + 0.5);
    ctx.stroke();

    // 地面层理：横向的深浅条纹
    const dist = fc.now * fc.scrollSpeed;
    const rows = 5;
    ctx.lineWidth = 1;
    for (let i = 1; i <= rows; i++) {
      const y = top + Math.pow(i / (rows + 1), 1.35) * span;
      ctx.strokeStyle = 'rgba(120,180,210,' + (0.055 - i * 0.006) + ')';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 随世界速度左移的土斑 / 石块 / 碎石（与怪物同速，读成世界在后退）
    const cycle = w + 160;
    for (const p of this.specks) {
      let x = (p.x - dist) % cycle;
      if (x < -80) x += cycle;
      if (p.kind === 2) {
        ctx.globalAlpha = p.a;
        ctx.fillStyle = '#1c394a';
        ctx.beginPath();
        ctx.ellipse(x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (p.kind === 3) {
        // 草簇：三片叶子从地面长出来，近处的更高更清楚
        ctx.globalAlpha = p.a;
        ctx.strokeStyle = '#5b8d83';
        ctx.lineWidth = 1.3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const sgn of [-1, 0, 1]) {
          const bx = x + sgn * p.rx * 0.7;
          ctx.moveTo(bx, p.y);
          ctx.quadraticCurveTo(
            bx + sgn * p.rx * 0.5,
            p.y - p.ry * 0.6,
            bx + sgn * p.rx * (sgn === 0 ? 0.2 : 1.1),
            p.y - p.ry * (sgn === 0 ? 1 : 0.78),
          );
        }
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = p.a;
      if (p.kind === 1) {
        ctx.fillStyle = 'rgba(6,12,18,.55)';
        ctx.beginPath();
        ctx.ellipse(x, p.y + 1.5, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#6b94a4';
        ctx.beginPath();
        ctx.ellipse(x, p.y, p.rx * 0.92, p.ry * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.ry > 1.3 ? '#7fa5b2' : '#4f7484';
        ctx.beginPath();
        ctx.ellipse(x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
