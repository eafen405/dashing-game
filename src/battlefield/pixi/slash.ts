/**
 * 命中火花 —— 武器在接触点实打实敲中的反馈。
 *
 * 不再画从角色飞向打击点的刀光 / 剑气：判定框已经挪到武器尖端，
 * 命中的地方就是武器敲到的地方，这里只留一圈很短的冲击环和几点碎屑。
 * 哲的球棒溅木屑；凛的镰刀溅紫红刃光。
 * 暴击（`kind === 'afterglow'`）额外叠一圈更宽、更淡的冲击环。
 */

import { Container, Graphics } from 'pixi.js';
import type { FrameContext } from './context';
import { setFill, setStroke } from './gfx';
import { clamp } from './math';
import { GOLD, hexA, laneColorOf } from './palette';

/** 木屑颜色（跟棒身一致）。 */
const WOOD = '#e0a25e';
/** 镰刀碎屑：紫红刃光。 */
const RIN_SHARD = '#c86bff';
const RIN_RING = '#ff4d9a';
const RIN_AFTERGLOW = '#c84dff';
/** 碎屑根数（每 60° 一根）。 */
const SPLINTERS = 6;

export class SlashView {
  /** 容器（挂到 `glow` 层 —— 命中火花参与 bloom）。 */
  readonly container = new Container();

  private readonly gfx = new Graphics();

  constructor() {
    this.container.addChild(this.gfx);
  }

  prepare(): void {
    // 无 DOM 依赖。
  }

  draw(fc: FrameContext): void {
    const g = this.gfx;
    g.clear();

    const rin = fc.characterId === 'rin';
    const list = fc.effects.slashes;
    for (const sl of list) {
      const p = clamp(sl.t / sl.life, 0, 1);
      const fade = 1 - p;
      if (fade <= 0) continue;
      const color = rin ? RIN_RING : laneColorOf(sl.lane, fc.frenzyActive);

      if (sl.kind === 'afterglow') {
        this.drawAfterglow(g, sl.x, sl.y, p, fade, rin);
        continue;
      }
      this.drawImpact(g, sl.x, sl.y, p, fade, color, rin);
    }
  }

  destroy(): void {
    // 没有独立纹理 / 渐变。
  }

  /** 普攻 / 长按命中：冲击环 + 中心白闪 + 四散碎屑。 */
  private drawImpact(
    g: Graphics,
    x: number,
    y: number,
    p: number,
    fade: number,
    color: string,
    rin: boolean,
  ): void {
    // 接触点冲击环。
    setStroke(g, 0.8 + 2.2 * fade, hexA(color, 0.55 * fade), 1, 'round');
    g.beginPath();
    g.arc(x, y, 8 + 20 * p, 0, Math.PI * 2);
    g.stroke();

    // 中心白闪。
    setFill(g, '#ffffff', 0.75 * fade);
    g.beginPath();
    g.arc(x, y, 1.5 + 4 * fade, 0, Math.PI * 2);
    g.fill();

    // 四散碎屑。
    setStroke(g, 1.8, hexA(rin ? RIN_SHARD : WOOD, 0.8 * fade), 1, 'round');
    g.beginPath();
    for (let i = 0; i < SPLINTERS; i++) {
      const a = (i * Math.PI) / 3 + 0.28;
      const r0 = 10 + 15 * p;
      const r1 = r0 + 2 + 7 * fade;
      if (rin) {
        // 刃光：一小段弧线，而不是直线木刺。
        const mid = (r0 + r1) / 2;
        g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        g.quadraticCurveTo(
          x + Math.cos(a + 0.16) * mid,
          y + Math.sin(a + 0.16) * mid,
          x + Math.cos(a) * r1,
          y + Math.sin(a) * r1,
        );
      } else {
        g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      }
    }
    g.stroke();
  }

  /** 暴击余晖：打击点外再叠一圈更宽、更淡的冲击环。 */
  private drawAfterglow(
    g: Graphics,
    x: number,
    y: number,
    p: number,
    fade: number,
    rin: boolean,
  ): void {
    const col = rin ? RIN_AFTERGLOW : GOLD;
    setStroke(g, 5, col, 0.22 * fade, 'round');
    g.beginPath();
    g.arc(x, y, 12 + 30 * p, 0, Math.PI * 2);
    g.stroke();

    setStroke(g, 2.5, col, 0.3 * fade, 'round');
    g.beginPath();
    g.arc(x, y, 8 + 20 * p, 0, Math.PI * 2);
    g.stroke();
  }
}
