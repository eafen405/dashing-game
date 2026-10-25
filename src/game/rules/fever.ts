/**
 * FEVER —— `source.html:1200-1213`。
 *
 * 旧实现把「连击够了 → 开 FEVER」这一段在 `killMonster`（937-943）、
 * `killPair`（1000-1006）、`completeLong`（1170-1176）里**重复了三遍**。
 * 这里抽成单一函数 `triggerFever()`，三处共用。
 *
 * 关键时序：`gain` 的计算在 FEVER 触发**之后**，
 * 所以触发 FEVER 的那一次击破就享受 1.5 倍 —— 调用方必须先应用本函数
 * 返回的状态，再算分。
 */

import { FEVER_COMBO, FEVER_TIME, GOLD } from '../constants';
import type { Effect } from '../effects';
import type { GameState } from '../types';

/** FEVER 结束提示色。 */
const FEVER_END_COLOR = '#9fb0cf';

/** FEVER 触发结果。 */
export interface FeverResult {
  state: GameState;
  effects: Effect[];
  /** 本次是否真的触发了 FEVER（用于决定要不要发击杀提示）。 */
  triggered: boolean;
}

/**
 * 连击达到阈值时进入 FEVER —— 旧实现三处重复块的统一版本。
 *
 * @param combo 触发这一刻的连击数。
 */
export function triggerFever(state: GameState, combo: number): FeverResult {
  if (state.frenzyActive || combo < state.nextFeverAt) {
    return { state, effects: [], triggered: false };
  }
  return {
    state: {
      ...state,
      feverT: FEVER_TIME,
      frenzyActive: true,
      nextFeverAt: combo + FEVER_COMBO,
    },
    effects: [
      { type: 'fever-start' },
      { type: 'toast', text: 'FEVER！10 秒 ×1.5', color: GOLD },
      { type: 'vibrate', pattern: [0, 40, 60, 90] },
    ],
    triggered: true,
  };
}

/** FEVER 结束 —— `source.html:1208-1213`。 */
export function endFever(state: GameState): { state: GameState; effects: Effect[] } {
  return {
    state: { ...state, frenzyActive: false, feverT: 0 },
    effects: [{ type: 'fever-end' }, { type: 'toast', text: 'FEVER 结束', color: FEVER_END_COLOR }],
  };
}
