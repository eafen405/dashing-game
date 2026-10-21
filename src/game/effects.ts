/**
 * 规则层 → 上层的效果事件。
 *
 * 旧实现里规则函数顺手调用的视觉副作用（`burst()` / `showToast()` / `rings.push()` /
 * `nudgeVibrate()` / `shake` / `playerFlash` / `flashHurt()`）在这一层全部改成
 * **效果事件**：规则层只描述「发生了什么」，表现层决定「怎么画」。
 *
 * 逐条映射见 `docs/adr/0003-rules-immutable-presentation-mutable.md` 与本票简报。
 */

import type { Lane } from './types';

/**
 * 效果事件全集。
 *
 * - `burst` —— 旧 `burst(x, y, color, n, power)`
 * - `ring` —— 旧 `rings.push({ x, y, t, life, r0, r1, color })`（`t` 是年龄，属表现层）
 * - `slash` —— 旧 `slashes.push({ x, x0, y, t, life, lane })`
 * - `floater` —— 旧 `addFloater(x, y, text, color)`
 * - `toast` —— 旧 `showToast(text, color)`
 * - `lane-flash` —— 旧 `laneTop/laneBot.classList.add("hit")`（轨道受击高亮）
 * - `shake-add` —— 旧 `shake = Math.min(shake + n, cap)`
 * - `shake-max` —— 旧 `shake = Math.max(shake, n)`
 * - `shake-set` —— 旧 `shake = 14`（直接赋值）
 * - `player-flash` —— 旧 `playerFlash = 1`
 * - `hurt` —— 旧 `flashHurt()`
 * - `vibrate` —— 旧 `nudgeVibrate(ms | ms[])`
 * - `fever-start` —— 旧 `enterFrenzy()`
 * - `fever-end` —— 旧 `endFever()`
 * - `pair-smash` —— 双生击破：角色大幅跳起下砸（纯表现，规则层不关心）
 * - `game-over` —— 旧 `gameOverNow()`
 */
export type Effect =
  | { type: 'burst'; x: number; y: number; color: string; count: number; power: number }
  | { type: 'ring'; x: number; y: number; life: number; r0: number; r1: number; color: string }
  | { type: 'slash'; x: number; x0: number; y: number; life: number; lane: Lane }
  | { type: 'floater'; x: number; y: number; text: string; color: string }
  | { type: 'toast'; text: string; color: string }
  | { type: 'lane-flash'; lane: Lane }
  | { type: 'shake-add'; amount: number; cap: number }
  | { type: 'shake-max'; amount: number }
  | { type: 'shake-set'; amount: number }
  | { type: 'player-flash' }
  | { type: 'hurt' }
  | { type: 'vibrate'; pattern: number | number[] }
  | { type: 'fever-start' }
  | { type: 'fever-end' }
  | { type: 'pair-smash' }
  | { type: 'game-over' };

/** 效果事件类型名（表现层按类型分派）。 */
export type EffectType = Effect['type'];
