/**
 * 规则层状态工厂。
 *
 * 旧实现里 `resetGame()`（`source.html:650-669`）+ `startGame()`（`671-681`）
 * 把 20 多个全局变量逐个重置。这里一次性构造出一个等价的不可变状态。
 *
 * 重置清单（逐条对照 `legacy-semantics.md` §0）：
 *   hp / score / combo / maxCombo / kills / critCount / normalCount
 *   monsters / attackT / attackLane / spawnTimer / frenzyActive / feverT
 *   nextFeverAt / pairSeq / pairCooldown / pairHintShown / longCooldown
 *   longHintShown / holdMon / holdId
 *
 * **不在规则层的东西**：
 *   - `best`（跨局最高分）—— 属于 HUD / 持久化层，`resetGame()` 本来也不重置它
 *   - `difficulty` —— 由 `now` 推导（`difficultyAt(now)`），不需要独立字段
 *   - `vt`（视觉时钟）/ 粒子 / 刀光 / 冲击环 / 飘字 / 震动 —— 表现层
 */

import { FEVER_COMBO, MAX_HP } from './constants';
import type { Difficulty, GameState, Layout } from './types';

/** 初始刷新倒计时（`source.html:655`）。 */
export const INITIAL_SPAWN_TIMER = 1.3;
/** 初始双生冷却（`source.html:664`）。 */
export const INITIAL_PAIR_COOLDOWN = 4.5;
/** 初始长按怪冷却（`source.html:665`）。 */
export const INITIAL_LONG_COOLDOWN = 6.0;

/** 构造一局游戏的初始状态。 */
export function createGameState(options: {
  diffLevel: Difficulty;
  seed: number;
  layout: Layout;
}): GameState {
  return {
    phase: 'running',
    seed: options.seed,
    diffLevel: options.diffLevel,
    layout: options.layout,

    now: 0,
    hp: MAX_HP,
    score: 0,
    combo: 0,
    maxCombo: 0,
    kills: 0,
    critCount: 0,
    normalCount: 0,

    monsters: [],

    spawnTimer: INITIAL_SPAWN_TIMER,
    frenzyActive: false,
    feverT: 0,
    nextFeverAt: FEVER_COMBO,

    pairSeq: 0,
    pairCooldown: INITIAL_PAIR_COOLDOWN,
    pairHintShown: false,

    longCooldown: INITIAL_LONG_COOLDOWN,
    longHintShown: false,

    holdMonsterId: null,
    holdInputId: null,

    attackT: 0,
    attackLane: null,

    nextMonsterId: 1,
  };
}
