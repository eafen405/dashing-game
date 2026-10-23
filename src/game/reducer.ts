/**
 * 规则层唯一公共接口 —— `reduce(state, event, rng) → { state, effects }`。
 *
 * **为什么多一个 `rng` 参数**（这是有意的设计，不是偷懒）：
 *
 * PRNG 是**有状态**的 —— 同一个种子连着抽 N 次和抽 N+1 次，前 N 次的结果一样，
 * 第 N+1 次不一样。如果把随机数发生器塞进 `GameState`，那么「状态不可变」
 * 这条铁律就破了：同一个状态快照配上同一个事件，不可能得到确定的结果，
 * 而规则层最重要的性质恰恰是**可复现**（票 03 的 golden trace 对照全靠它）。
 * 所以 PRNG 由调用方持有、按参数注入，规则层只管「抽几次、什么顺序抽」。
 *
 * **为什么返回 `{ state, effects }` 而不是裸 state**：
 * 效果队列是规则层**唯一**的对外副作用通道。旧实现里 `strike()` 会顺手调
 * `burst()` / `showToast()`，那让规则函数没法单测（要 mock 一堆 DOM）。
 * 现在规则层只产出「发生了什么」的效果事件，画不画、怎么画是表现层的事。
 */

import type { Effect } from './effects';
import { refitMonsters } from './layout';
import type { Rng } from './rng';
import { createGameState } from './state';
import { cancelHold, releaseHold } from './rules/resolve';
import { pressLane } from './rules/strike';
import { tick } from './rules/tick';
import type { CharacterId, Difficulty, GameState, Lane, Layout } from './types';

/**
 * 规则层能接受的全部事件。
 *
 * - `Start` —— 开一局新游戏（重置全部规则状态）
 * - `Tick` —— 推进一帧
 * - `Press` —— 按下半屏（长按怪优先，否则挥刀）
 * - `Release` —— 松开手指（只有松开发起长按的那根指针才判定长按中断）
 * - `CancelHold` —— 取消长按但不惩罚（暂停 / 切后台）
 * - `Pause` / `Resume` —— 暂停 / 继续
 * - `Resize` —— 战场尺寸变化，怪物重新贴合轨道
 * - `SetDifficulty` —— 切换难度星级
 */
export type GameEvent =
  | {
      type: 'Start';
      diffLevel: Difficulty;
      seed: number;
      layout: Layout;
      /** 本局角色；省略 = 旧版 250 血基线（trace / 旧测试）。 */
      characterId?: CharacterId | null;
    }
  | { type: 'Tick'; dt: number }
  | { type: 'Press'; lane: Lane; inputId: string }
  | { type: 'Release'; inputId: string }
  | { type: 'CancelHold' }
  | { type: 'Pause' }
  | { type: 'Resume' }
  | { type: 'Resize'; layout: Layout }
  | { type: 'SetDifficulty'; diffLevel: Difficulty };

/** `reduce` 的返回值。 */
export interface ReduceResult {
  /** 新的不可变状态。 */
  state: GameState;
  /** 本次事件产生的效果事件（视觉副作用的唯一出口）。 */
  effects: Effect[];
}

/**
 * 规则层的事件归约器 —— 旧实现里那一堆全局变量操作的总入口。
 *
 * 纯函数：不改传入的 `state`，不碰 DOM / Pixi / React，不调 `Math.random()`。
 */
export function reduce(state: GameState, event: GameEvent, rng: Rng): ReduceResult {
  switch (event.type) {
    case 'Start': {
      // `seed` 只作记录（供 trace 复现），随机数由注入的 `rng` 产生。
      return {
        state: createGameState({
          diffLevel: event.diffLevel,
          seed: event.seed,
          layout: event.layout,
          characterId: event.characterId ?? null,
        }),
        effects: [],
      };
    }

    case 'Tick':
      return tick(state, event.dt, rng);

    case 'Press':
      return pressLane(state, event.lane, event.inputId);

    case 'Release':
      return releaseHold(state, event.inputId);

    case 'CancelHold':
      return cancelHold(state);

    case 'Pause': {
      if (state.phase !== 'running') return { state, effects: [] };
      // 旧实现：暂停前先取消长按（不惩罚），怪物停住等待续按
      const cancelled = cancelHold(state);
      return { state: { ...cancelled.state, phase: 'paused' }, effects: cancelled.effects };
    }

    case 'Resume': {
      if (state.phase !== 'paused') return { state, effects: [] };
      return { state: { ...state, phase: 'running' }, effects: [] };
    }

    case 'Resize': {
      const monsters = refitMonsters(state.monsters, event.layout);
      return { state: { ...state, layout: event.layout, monsters }, effects: [] };
    }

    case 'SetDifficulty':
      return { state: { ...state, diffLevel: event.diffLevel }, effects: [] };
  }
}
