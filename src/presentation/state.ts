/**
 * 表现层状态 —— 规则层效果事件 → 可变表现状态的翻译层。
 *
 * 分层依据 ADR-0003「规则层不可变、表现层可变」：
 *
 * ```
 * 规则层 game/  ──Effect[]──▶  表现层 presentation/  ──FrameView──▶  战场层 battlefield/
 * ```
 *
 * 规则层只描述「发生了什么」（`src/game/effects.ts` 的 `Effect`），
 * 这里决定「怎么表现」：加粒子、加环、加刀光、加飘字、改震动、闪红。
 *
 * 少数事件（`toast` / `lane-flash` / `vibrate` / `hurt` / `fever-*` / `game-over`）
 * 是**上层（会话层 / HUD 层）**的事，本层不处理，通过 `EffectSink` 钩子转交。
 */

import type { Effect } from '../game/effects';
import type { Lane } from '../game/types';
import { EffectsPool } from './effects';
import { ShakeState } from './shake';

/**
 * 上层钩子 —— 表现层不处理的事件转交到这里。
 *
 * 04b（会话层 / HUD 层）实现它；不实现就**丢弃**这些事件（不影响画面）。
 */
export interface EffectSink {
  /** 旧 `showToast(text, color)`。 */
  toast(text: string, color: string): void;
  /** 旧 `laneTop/laneBot.classList.add("hit")`。 */
  laneFlash(lane: Lane): void;
  /** 旧 `nudgeVibrate(ms | ms[])`。 */
  vibrate(pattern: number | number[]): void;
  /** 旧 `flashHurt()`。 */
  hurt(): void;
  /** 旧 `enterFrenzy()`。 */
  feverStart(): void;
  /** 旧 `endFever()`。 */
  feverEnd(): void;
  /** 旧 `gameOverNow()`。 */
  gameOver(): void;
}

/**
 * 表现层状态。
 *
 * 会话层（04b）持有它，每帧：应用效果事件 → 推进 → 读出 `FrameView` 需要的三个字段
 * （`effects` / `shake` / `playerFlash`）。
 */
export class PresentationState {
  /** 粒子 / 刀光 / 冲击环 / 飘字。 */
  readonly effects = new EffectsPool();
  /** 屏幕震动强度。 */
  readonly shake = new ShakeState();
  /** 角色受击红闪强度（0 = 正常）。 */
  playerFlash = 0;

  private readonly sink: EffectSink | null;

  constructor(sink: EffectSink | null = null) {
    this.sink = sink;
  }

  /**
   * 消费规则层的效果事件。
   *
   * 这一层是「效果事件 → 表现状态」的唯一入口，规则层不直接碰表现状态。
   */
  applyEffects(list: readonly Effect[]): void {
    for (const e of list) {
      switch (e.type) {
        case 'burst':
          this.effects.burst(e.x, e.y, e.color, e.count, e.power);
          break;
        case 'ring':
          this.effects.addRing(e.x, e.y, e.life, e.r0, e.r1, e.color);
          break;
        case 'slash':
          this.effects.addSlash(e.x, e.x0, e.y, e.life, e.lane);
          break;
        case 'floater':
          this.effects.addFloater(e.x, e.y, e.text, e.color);
          break;
        case 'shake-add':
          this.shake.add(e.amount, e.cap);
          break;
        case 'shake-max':
          this.shake.raiseTo(e.amount);
          break;
        case 'shake-set':
          this.shake.set(e.amount);
          break;
        case 'player-flash':
          this.playerFlash = 1;
          break;
        case 'toast':
          this.sink?.toast(e.text, e.color);
          break;
        case 'lane-flash':
          this.sink?.laneFlash(e.lane);
          break;
        case 'vibrate':
          this.sink?.vibrate(e.pattern);
          break;
        case 'hurt':
          this.sink?.hurt();
          break;
        case 'fever-start':
          this.sink?.feverStart();
          break;
        case 'fever-end':
          this.sink?.feverEnd();
          break;
        case 'game-over':
          this.sink?.gameOver();
          break;
        default:
          break;
      }
    }
  }

  /**
   * 推进一帧。
   *
   * 衰减口径逐字照抄旧实现：
   * - 粒子 / 环 / 刀光 / 飘字：`source.html:1378-1381` 与 `1405-1408`
   * - 角色红闪：`playerFlash = Math.max(0, playerFlash - dt*2.4)`（`source.html:1388`）
   * - 震动：`shake *= Math.pow(0.001, dt)`，`< 0.2` 归零（`source.html:1389-1390`）
   *
   * 注意旧代码在 **paused 状态下粒子/环/刀光/飘字仍继续衰减**
   * （`stepVisualOnly`，`source.html:1400-1411`）—— 这里也是照抄的，
   * 暂停与否由上层决定要不要调用 `step()`。
   */
  step(dt: number): void {
    this.effects.step(dt);
    this.playerFlash = Math.max(0, this.playerFlash - dt * 2.4);
    this.shake.decay(dt);
  }

  /** 清空（换局 / 重置）。 */
  reset(): void {
    this.effects.clear();
    this.shake.reset();
    this.playerFlash = 0;
  }
}
