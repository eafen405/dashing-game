/**
 * 地面（大地）—— 角色脚底那一层陆地。
 *
 * 上轨是天上的轨道，下轨才是地面：地面只从下轨脚底向下铺，天空留给星空。
 * 随世界速度左移的碎石 / 草簇与怪物移速一致，读成「角色在地面上向前跑、
 * 路上遇到怪」，而不是「怪从右边飞向站着的人」。
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

export class GroundView {
  private ownerCtx: CanvasRenderingContext2D | null = null;
  private gradient: CanvasGradient | null = null;
  private specks: Speck[] = [];
  private w = 0;
  private h = 0;

  /** 尺寸变化时重建渐变与碎石。 */
  resize(layout: Layout): void {
    this.w = layout.width;
    this.h = layout.height;
    this.gradient = null;
    this.buildSpecks(layout);
  }

  private buildSpecks(layout: Layout): void {
    const top = this.topOf(layout);
    const span = Math.max(1, this.h - top);
    const count = Math.max(26, Math.round(this.w / 21));
    this.specks.length = 0;
    for (let i = 0; i < count; i++) {
      const d = Math.random(); // 0 = 近地平线，1 = 近屏幕底部
      const kind: Speck['kind'] = i % 13 === 0 ? 3 : i % 11 === 0 ? 2 : i % 7 === 0 ? 1 : 0;
      const size = 0.7 + d * 1.7;
      const y = top + 3 + Math.pow(d, 1.25) * (span - 6);
      if (kind === 2) {
        this.specks.push({
          x: Math.random() * (this.w + 120),
          y,
          rx: 14 + Math.random() * 26,
          ry: 2 + Math.random() * 3,
          a: 0.05 + Math.random() * 0.04,
          kind,
        });
        continue;
      }
      if (kind === 3) {
        this.specks.push({
          x: Math.random() * (this.w + 80),
          y,
          rx: 1.8 + Math.random() * 2.2,
          ry: 4 + d * 5 + Math.random() * 3,
          a: 0.12 + d * 0.12,
          kind,
        });
        continue;
      }
      this.specks.push({
        x: Math.random() * (this.w + 80),
        y,
        rx: kind === 1 ? size * (1.5 + Math.random() * 1.4) : size * (1 + Math.random() * 1.8),
        ry: kind === 1 ? 1.2 + size * 0.32 : 0.4 + size * 0.18,
        a: 0.1 + d * 0.18 + Math.random() * 0.05,
        kind,
      });
    }
  }

  /** 大地上缘：下轨脚底。 */
  private topOf(layout: Layout): number {
    return laneGroundY(layout, 'bottom');
  }

  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    if (this.ownerCtx !== ctx) {
      this.ownerCtx = ctx;
      this.gradient = null;
    }
    const layout = fc.layout;
    const w = this.w || layout.width;
    const h = this.h || layout.height;
    const top = this.topOf(layout);
    const span = h - top;
    if (span <= 0) return;

    if (!this.gradient) {
      const g = ctx.createLinearGradient(0, top, 0, h);
      g.addColorStop(0, 'rgba(42,62,58,.97)');
      g.addColorStop(0.1, 'rgba(24,40,40,.99)');
      g.addColorStop(0.55, 'rgba(12,23,26,1)');
      g.addColorStop(1, 'rgba(4,9,13,1)');
      this.gradient = g;
    }
    ctx.fillStyle = this.gradient;
    ctx.fillRect(0, top, w, span + 2);

    // 大地上缘：一层暖色土皮，压住下轨光带的下沿
    ctx.strokeStyle = 'rgba(255,170,110,.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, top - 0.5);
    ctx.lineTo(w, top - 0.5);
    ctx.stroke();

    // 土层：横向的深浅条纹
    const dist = fc.now * fc.scrollSpeed;
    const rows = 3;
    ctx.lineWidth = 1;
    for (let i = 1; i <= rows; i++) {
      const y = top + Math.pow(i / (rows + 1), 1.15) * span;
      ctx.strokeStyle = 'rgba(150,170,140,' + (0.05 - i * 0.01) + ')';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 随世界速度左移的土斑 / 石块 / 碎石 / 草簇（与怪物同速）
    const cycle = w + 120;
    for (const p of this.specks) {
      let x = (p.x - dist) % cycle;
      if (x < -60) x += cycle;
      if (p.kind === 2) {
        ctx.globalAlpha = p.a;
        ctx.fillStyle = '#243a38';
        ctx.beginPath();
        ctx.ellipse(x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (p.kind === 3) {
        // 草簇：三片叶子从土里长出来，近处的更高更清楚
        ctx.globalAlpha = p.a;
        ctx.strokeStyle = '#6c9678';
        ctx.lineWidth = 1.2;
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
        ctx.fillStyle = 'rgba(4,10,14,.6)';
        ctx.beginPath();
        ctx.ellipse(x, p.y + 1.2, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7d9184';
        ctx.beginPath();
        ctx.ellipse(x, p.y, p.rx * 0.92, p.ry * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.ry > 1.1 ? '#8fa294' : '#5b6f68';
        ctx.beginPath();
        ctx.ellipse(x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
