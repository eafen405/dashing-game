/**
 * 灵魂分身 —— 按住长条怪时点另一条轨。
 *
 * 规则层已经把伤害按**本体同一套判定**（`layout.hitX` / `zoneHalf` / `critHalf`）
 * 结算完了；这里只负责把 `soul-strike` 效果事件翻译成动画：
 *
 * 1. **分离**：从本体悬浮处飞出，起点留一圈很淡的离体环；
 * 2. **飞行**：竖向往目标轨扑过去，身体前倾、收腿、举棒；
 * 3. **代打**：站到目标轨的出手位（与本体同一个 x —— 棒尖正好够到
 *    `layout.hitX`），向下砸；命中时打击点亮星芒，暴击转金色；
 * 4. **消散**：挥棒后淡出。
 *
 * **灵魂长什么样**：直接复用 `PlayerView` 的整套身体绘制
 * （`drawSoulPose`）—— 同样的腿 / 球衣 / 帽子 / 棒子，只是整体半透明。
 * 不再单独画「幽灵剪影」，灵魂就是本体的透明拷贝。
 *
 * 判定与动画**没有契约关系**：没打中时（`hit === false`）照样飞、照样挥，
 * 只是落点不炸星芒。
 */

import { Container, Graphics } from 'pixi.js';
import type { Soul } from '../types';
import type { FrameContext } from './context';
import { setFill, setStroke } from './gfx';
import { clamp, easeInOutCubic, easeOutCubic, lerp } from './math';
import { GOLD, laneColorOf } from './palette';
import { PlayerView } from './player';
import type { SoulPose } from './player';

/** 灵魂的整体透明度 —— 「和本体一样，只是带透明效果」。 */
const SOUL_ALPHA = 0.6;
/** 灵魂相对本体的大小（1 = 与本体一模一样）。 */
const SOUL_SCALE = 1;
/** 飞到落点的时间占寿命的比例（0.13 秒 —— 规则层在按下瞬间就已结算，飞行要快）。 */
const ARRIVE = 0.26;
/** 挥棒砸中的时刻（占寿命的比例）。 */
const IMPACT = 0.46;
/** 开始消散的时刻（占寿命的比例）。 */
const FADE_START = 0.68;
/** 同时存在的灵魂上限（分身池大小；多出来的只保留最新的）。 */
const POOL = 3;

/**
 * 灵魂渲染器。
 *
 * 一个 `Graphics` 画离体环 / 落点星芒，加 `POOL` 个 `PlayerView` 实例
 * 当半透明分身 —— 每个分身复用一个 `SoulPose` 对象，每帧零分配。
 */
export class SoulView {
  /** 容器（挂到 `glow` 层 —— 分身与命中星芒都参与 bloom）。 */
  readonly container = new Container();

  /** 离体环 / 落点星芒（画在分身下面）。 */
  private readonly gfx = new Graphics();

  /** 半透明分身 —— 直接复用本体画法，保证「灵魂 = 透明本体」。 */
  private readonly ghosts: PlayerView[] = [];

  /** 复用的姿态对象（零分配）。 */
  private readonly pose: SoulPose = {
    x: 0,
    y: 0,
    scale: SOUL_SCALE,
    alpha: 0,
    rot: 0,
    legTuck: 0,
    batA: 0,
    trailFrom: 0,
    trail: 0,
    impact: 0,
  };

  constructor() {
    this.container.addChild(this.gfx);
    for (let i = 0; i < POOL; i++) {
      const ghost = new PlayerView();
      ghost.container.visible = false;
      this.ghosts.push(ghost);
      this.container.addChild(ghost.container);
    }
  }

  prepare(): void {
    for (const ghost of this.ghosts) ghost.prepare();
  }

  draw(fc: FrameContext): void {
    const g = this.gfx;
    g.clear();

    const souls = fc.effects.souls;
    // 池子满了就丢最旧的（数组按生成顺序追加）。
    const start = Math.max(0, souls.length - this.ghosts.length);
    let used = 0;
    for (let i = start; i < souls.length; i++) {
      const soul = souls[i];
      const ghost = this.ghosts[used];
      if (!soul || !ghost) continue;
      this.drawSoul(g, ghost, soul, fc);
      used++;
    }
    for (let i = used; i < this.ghosts.length; i++) {
      const ghost = this.ghosts[i];
      if (ghost) ghost.container.visible = false;
    }
  }

  destroy(): void {
    for (const ghost of this.ghosts) ghost.destroy();
  }

  /* ------------------------------------------------------------------ *
   * 单个灵魂
   * ------------------------------------------------------------------ */

  private drawSoul(g: Graphics, ghost: PlayerView, soul: Soul, fc: FrameContext): void {
    const p = clamp(soul.t / soul.life, 0, 1);
    const appear = clamp(p / 0.06, 0, 1);
    const fade = 1 - clamp((p - FADE_START) / (1 - FADE_START), 0, 1);
    const alpha = SOUL_ALPHA * appear * fade;
    const s = fc.layout.playerR * SOUL_SCALE;
    const accent = soul.crit ? GOLD : laneColorOf(soul.lane, fc.frenzyActive);
    const travel = clamp(p / ARRIVE, 0, 1);
    const arc = Math.sin(Math.PI * travel);

    // 起点：离体环（只在这 0.11 秒里出现）。
    this.drawDeparture(g, soul, s, p, accent, appear * fade);

    // 目标：目标轨上的「出手位」。x 与本体相同 —— 棒尖正好够到 hitX。
    const tx = fc.layout.playerX;
    const ty = fc.layout.laneY[soul.lane];

    // 飞行：竖向往目标轨扑，向前 / 向上各带一点小弧。
    const k = easeOutCubic(travel);
    const x = lerp(soul.x0, tx, k) + arc * s * 0.35;
    const y = lerp(soul.y0, ty, k) - arc * s * 0.25;

    // 动作：飞行举棒 → 到位砸下 → 收势。
    let batA = -1.95;
    let trail = 0;
    let impact = 0;
    let swingK = 0;
    let legTuck = 0.9;
    if (p >= ARRIVE) {
      // 到位：从「收腿悬浮」落到出击步。
      const land = easeOutCubic(clamp((p - ARRIVE) / 0.06, 0, 1));
      legTuck = lerp(0.9, 0.28, land);
      if (p < IMPACT) {
        swingK = easeInOutCubic((p - ARRIVE) / (IMPACT - ARRIVE));
        batA = lerp(-1.95, 1.2, swingK);
        trail = swingK;
        impact = clamp((swingK - 0.82) / 0.18, 0, 1);
      } else {
        const settle = clamp((p - IMPACT) / (1 - IMPACT), 0, 1);
        batA = lerp(1.2, 1.3, easeOutCubic(settle));
        trail = (1 - settle) * 0.6;
        impact = 1 - clamp(settle / 0.45, 0, 1);
        swingK = 1 - settle * 0.4;
      }
    }

    // 落点星芒（画在身体下面，不挡分身）。
    this.drawImpact(g, soul, s, p, appear * fade, accent);

    // 身体：本体的透明拷贝。
    const pose = this.pose;
    pose.x = x;
    pose.y = y;
    pose.scale = SOUL_SCALE;
    pose.alpha = alpha;
    pose.rot = 0.05 + arc * 0.16 + swingK * 0.1;
    pose.legTuck = legTuck;
    pose.batA = batA;
    pose.trailFrom = -1.95;
    pose.trail = trail;
    pose.impact = impact;
    ghost.drawSoulPose(fc, soul.lane, pose);
  }

  /** 离体瞬间：起点的一圈小环。 */
  private drawDeparture(
    g: Graphics,
    soul: Soul,
    s: number,
    p: number,
    accent: string,
    alpha: number,
  ): void {
    if (p > 0.22) return;
    const k = p / 0.22;
    setStroke(g, 1.5, accent, (1 - k) * 0.4 * alpha, 'round');
    g.beginPath();
    g.circle(soul.x0, soul.y0, s * (0.3 + 0.9 * k));
    g.stroke();
  }

  /** 砸中瞬间：命中才炸星芒，没命中只有一圈收束环。 */
  private drawImpact(
    g: Graphics,
    soul: Soul,
    s: number,
    p: number,
    alpha: number,
    accent: string,
  ): void {
    if (p < IMPACT) return;
    const k = clamp((p - IMPACT) / (1 - IMPACT), 0, 1);
    const a = (1 - k) * alpha;

    if (soul.hit) {
      setStroke(g, Math.max(1, s * 0.06 * (1 - k) + 1), accent, 0.85 * a, 'round');
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI / 4) * i + 0.25;
        const r0 = s * (0.2 + 0.55 * k);
        const r1 = r0 + s * (0.55 * (1 - k) + 0.1);
        g.moveTo(soul.x + Math.cos(ang) * r0, soul.y + Math.sin(ang) * r0);
        g.lineTo(soul.x + Math.cos(ang) * r1, soul.y + Math.sin(ang) * r1);
      }
      g.stroke();

      setFill(g, '#f4feff', 0.9 * a);
      g.circle(soul.x, soul.y, s * (0.06 + 0.22 * (1 - k)));
      g.fill();
    }

    setStroke(g, 1.5, accent, 0.5 * a, 'round');
    g.beginPath();
    g.circle(soul.x, soul.y, s * (0.3 + 1.5 * k));
    g.stroke();
  }
}
