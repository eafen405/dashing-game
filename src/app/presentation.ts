/**
 * 表现层端口 —— 会话层与表现层之间的接缝。
 *
 * **为什么要有这个接口**：规则层只产出「发生了什么」的效果事件（`Effect`），
 * 「怎么画」是表现层的事（ADR-0003）。但**谁持有表现层的可变状态**（粒子 / 刀光 /
 * 冲击环 / 飘字 / 震动 / 角色闪白）需要在会话层与表现层之间划一条线：
 *
 * ```
 * GameSession ──apply(effects)──► 表现层 ──snapshot──► FrameView.effects
 *             ──advance(dt)─────►（衰减）
 * ```
 *
 * 表现层的实现由战场渲染器那一侧提供（`src/presentation/`，对象池 + swap-remove）。
 * 本文件里的 `createSimplePresentation()` 是一个**最小可用**实现：
 * 语义与旧实现逐字一致（衰减公式见 `legacy-semantics.md` §7.1），
 * 但没有对象池 —— 它是 04a 的表现层落地前的过渡实现，
 * 正式实现到位后由上层换成那一个（**端口不变，调用方只改一行**）。
 *
 * 端口里**没有** DOM 副作用（toast / 受击红屏 / FEVER 闪屏 / 震动）——
 * 那些走规则层的 `Effect` 回调，由上层（React 层）处理。
 */

import type { Effects, Floater, Particle, Ring, Slash } from '../battlefield/types';
import { GOLD } from '../game/constants';
import type { Effect } from '../game/effects';
import type { Layout } from '../game/types';

/** 粒子上限 —— 与旧实现一致（`source.html:1258`）。 */
export const MAX_PARTICLES = 260;

/** 表现层每帧推进需要的上下文。 */
export interface PresentationContext {
  /** 当前布局（FEVER 火花要知道角色位置与半径）。 */
  layout: Layout;
  /** FEVER 是否生效（决定要不要冒金色火花）。 */
  frenzyActive: boolean;
}

/** 表现层端口。 */
export interface PresentationPort {
  /** 应用一批规则层效果（不关心的效果直接忽略）。 */
  apply(effects: readonly Effect[]): void;
  /** 推进表现层衰减 —— **所有阶段都调用**（暂停时粒子照常衰减）。 */
  advance(dt: number, ctx: PresentationContext): void;
  /** 当前表现层状态（喂给 `FrameView.effects`）。 */
  readonly snapshot: Effects;
  /** 当前屏幕震动强度。 */
  readonly shake: number;
  /** 角色受击红闪强度。 */
  readonly playerFlash: number;
  /** 清空（开新局时）。 */
  reset(): void;
}

/** 旧实现的 `rand(a, b)` —— `a + Math.random() * (b - a)`（`source.html:493`）。 */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** 就地移除（swap-remove）—— 不用 `filter` / `splice` 重建数组（ADR-0004）。 */
function removeAt<T>(list: T[], index: number): void {
  const last = list.length - 1;
  if (index !== last) list[index] = list[last] as T;
  list.pop();
}

/**
 * 最小表现层实现 —— 语义照抄旧实现，效果池留给正式实现。
 *
 * 衰减公式（`legacy-semantics.md` §7.1，逐字照抄）：
 *   - 粒子：`vx *= 0.08^dt`、`vy *= 0.08^dt`、`vy += 260*dt`
 *   - 飘字：`vy *= 0.2^dt`
 *   - 刀光 / 冲击环：只推进 `t`
 *   - 震动：`shake *= 0.001^dt`，小于 0.2 归零
 *   - 角色闪白：`playerFlash -= dt * 2.4`
 */
export function createSimplePresentation(): PresentationPort {
  const particles: Particle[] = [];
  const slashes: Slash[] = [];
  const rings: Ring[] = [];
  const floaters: Floater[] = [];

  const effects: Effects = { particles, slashes, rings, floaters };

  let shake = 0;
  let playerFlash = 0;
  let frenzySparkT = 0;

  const burst = (x: number, y: number, color: string, count: number, power: number): void => {
    let n = Math.min(count, MAX_PARTICLES - particles.length);
    if (n <= 0) return;
    while (n > 0) {
      n -= 1;
      const a = Math.random() * Math.PI * 2;
      const sp = rand(60, 300) * power;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: rand(1.2, 3.6),
        life: rand(0.25, 0.65),
        t: 0,
        color,
      });
    }
  };

  const emitFrenzy = (dt: number, layout: Layout): void => {
    frenzySparkT -= dt;
    if (frenzySparkT > 0 || particles.length >= MAX_PARTICLES) return;
    frenzySparkT = rand(0.035, 0.08);
    const a = rand(0, Math.PI * 2);
    const rr = layout.playerR * rand(1.2, 2.1);
    particles.push({
      x: layout.playerX + Math.cos(a) * rr,
      y: layout.height / 2 + Math.sin(a) * rr,
      vx: -rand(40, 160),
      vy: rand(-70, 20),
      r: rand(1.4, 3.2),
      life: rand(0.3, 0.7),
      t: 0,
      color: Math.random() < 0.35 ? '#fff4c2' : GOLD,
    });
  };

  const apply = (batch: readonly Effect[]): void => {
    for (const effect of batch) {
      switch (effect.type) {
        case 'burst':
          burst(effect.x, effect.y, effect.color, effect.count, effect.power);
          break;
        case 'ring':
          rings.push({
            x: effect.x,
            y: effect.y,
            t: 0,
            life: effect.life,
            r0: effect.r0,
            r1: effect.r1,
            color: effect.color,
          });
          break;
        case 'slash':
          slashes.push({
            x: effect.x,
            x0: effect.x0,
            y: effect.y,
            t: 0,
            life: effect.life,
            lane: effect.lane,
          });
          break;
        case 'floater':
          floaters.push({
            x: effect.x,
            y: effect.y,
            text: effect.text,
            color: effect.color,
            t: 0,
            life: 0.95,
            vy: -46,
          });
          break;
        case 'shake-add':
          shake = Math.min(shake + effect.amount, effect.cap);
          break;
        case 'shake-max':
          shake = Math.max(shake, effect.amount);
          break;
        case 'shake-set':
          shake = effect.amount;
          break;
        case 'player-flash':
          playerFlash = 1;
          break;
        default:
          // toast / hurt / lane-flash / vibrate / fever-* / game-over 是 DOM 侧的副作用，
          // 由上层通过 `onEffect` 回调处理，表现层不管。
          break;
      }
    }
  };

  const advance = (dt: number, ctx: PresentationContext): void => {
    // 粒子
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i] as Particle;
      p.t += dt;
      if (p.t >= p.life) {
        removeAt(particles, i);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.08, dt);
      p.vy *= Math.pow(0.08, dt);
      p.vy += 260 * dt;
    }

    // 刀光
    for (let i = slashes.length - 1; i >= 0; i -= 1) {
      const s = slashes[i] as Slash;
      s.t += dt;
      if (s.t >= s.life) removeAt(slashes, i);
    }

    // 冲击环
    for (let i = rings.length - 1; i >= 0; i -= 1) {
      const r = rings[i] as Ring;
      r.t += dt;
      if (r.t >= r.life) removeAt(rings, i);
    }

    // 飘字
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const f = floaters[i] as Floater;
      f.t += dt;
      if (f.t >= f.life) {
        removeAt(floaters, i);
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= Math.pow(0.2, dt);
    }

    if (ctx.frenzyActive) emitFrenzy(dt, ctx.layout);

    playerFlash = Math.max(0, playerFlash - dt * 2.4);
    shake *= Math.pow(0.001, dt);
    if (shake < 0.2) shake = 0;
  };

  const reset = (): void => {
    particles.length = 0;
    slashes.length = 0;
    rings.length = 0;
    floaters.length = 0;
    shake = 0;
    playerFlash = 0;
    frenzySparkT = 0;
  };

  return {
    apply,
    advance,
    get snapshot(): Effects {
      return effects;
    },
    get shake(): number {
      return shake;
    },
    get playerFlash(): number {
      return playerFlash;
    },
    reset,
  };
}
