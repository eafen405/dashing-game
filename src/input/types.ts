/**
 * 输入层的公共类型。
 *
 * **规则层不认识 DOM 事件**（ADR-0003：规则层是纯函数层，无 DOM）。
 * 所以输入层的唯一职责就是把「原始 DOM 事件」翻译成「规则层事件」，
 * 翻译规则集中在本文件与 `mapping.ts`，便于单测。
 */

import type { Lane } from '../game/types';

/**
 * 输入层发出的规则层事件。
 *
 * 是 `GameEvent` 的**输入子集** —— 与 `src/game/reducer.ts` 里
 * `Press` / `Release` / `CancelHold` 三个分支一一对应。
 */
export type InputEvent =
  /** 按下半屏（长按怪优先，否则挥刀）。 */
  | { type: 'Press'; lane: Lane; inputId: string }
  /** 松开手指 / 键。只有松开**发起长按的那根输入**才判定长按中断。 */
  | { type: 'Release'; inputId: string }
  /** 取消长按但不惩罚（暂停 / 切后台）。 */
  | { type: 'CancelHold' };

/**
 * 输入层的接收端。
 *
 * 由 `GameSession` 实现（`press` / `release` / `cancelHold` 三个方法）。
 * 抽成接口是为了让输入层可以脱离会话层单测。
 */
export interface InputSink {
  /** 按下半屏。 */
  press(lane: Lane, inputId: string): void;
  /** 松开输入。 */
  release(inputId: string): void;
  /** 取消长按但不惩罚。 */
  cancelHold(): void;
}
