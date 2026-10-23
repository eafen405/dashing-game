/**
 * 角色 —— 规则层的被动参数。
 *
 * 两个角色共用同一套判定、出招时长与武器几何；差别只有生命上限、命中回复
 * 与燃魂。外观（球棒 / 镰刀）属于渲染层，这里只记录数值，保证规则可单测。
 *
 * **`null` 是旧版基线**：250 血、无回复、无燃魂。golden trace 与旧单测夹具都走
 * 这条路径，确保角色系统不改变「旧规则核心」的逐帧结果。
 */

import { FEVER_MULT, MAX_HP } from './constants';
import type { Effect } from './effects';
import type { CharacterId, GameState } from './types';

/** 可选角色（按界面展示顺序）。 */
export const CHARACTER_IDS: readonly CharacterId[] = ['zhe', 'rin'];

/** 一个角色的被动参数。 */
export interface CharacterConfig {
  /** 角色 id；`null` = 旧版基线（无被动）。 */
  id: CharacterId | null;
  name: string;
  /** 生命上限。 */
  maxHp: number;
  /** 开局生命。 */
  startHp: number;
  /** 每次真实命中回复的生命（0 = 不回复）。 */
  healPerHit: number;
  /** 燃魂触发线 / 燃魂烧血下限；`null` = 不会燃魂。 */
  burnFloor: number | null;
  /** 燃魂每秒烧掉的生命。 */
  burnDrain: number;
  /** 燃魂期间的得分倍率。 */
  burnScoreMult: number;
}

/**
 * 旧版基线 —— 不是可选角色，只服务于 trace / 旧测试。
 *
 * 它与改造前的规则逐字一致：250 血、命中不回血、没有燃魂。
 */
const LEGACY_CHARACTER: CharacterConfig = {
  id: null,
  name: '旧版',
  maxHp: MAX_HP,
  startHp: MAX_HP,
  healPerHit: 0,
  burnFloor: null,
  burnDrain: 0,
  burnScoreMult: 1,
};

/** 可选角色的被动数值。 */
export const CHARACTERS: Record<CharacterId, CharacterConfig> = {
  zhe: {
    id: 'zhe',
    name: '哲',
    maxHp: MAX_HP + 50,
    startHp: MAX_HP + 50,
    healPerHit: 0,
    burnFloor: null,
    burnDrain: 0,
    burnScoreMult: 1,
  },
  rin: {
    id: 'rin',
    name: '凛',
    maxHp: MAX_HP,
    startHp: MAX_HP / 2,
    // 每命中一次 +5；满血触发燃魂，每秒 -12.5，烧到上限一半（125）退出。
    healPerHit: 5,
    burnFloor: MAX_HP / 2,
    burnDrain: 12.5,
    burnScoreMult: 2,
  },
};

/** 取角色配置；`null` 返回旧版基线。 */
export function characterOf(id: CharacterId | null): CharacterConfig {
  return id === null ? LEGACY_CHARACTER : CHARACTERS[id];
}

/**
 * 当前得分倍率 —— 燃魂 ×2 与 FEVER ×1.5 可以叠乘。
 *
 * 三个计分点（普攻 / 双生 / 长按）共用这一份实现，避免各自抄一遍 1.5 / 2。
 */
export function scoreMultiplierOf(
  state: Pick<GameState, 'characterId' | 'burning' | 'frenzyActive'>,
): number {
  const burn = state.burning ? characterOf(state.characterId).burnScoreMult : 1;
  const fever = state.frenzyActive ? FEVER_MULT : 1;
  return burn * fever;
}

/** 命中回血的结果。 */
export interface HealResult {
  state: GameState;
  effects: Effect[];
  /** 实际回复量（0 = 没回）。 */
  healed: number;
  /** 这一下是否把血回满并触发了燃魂。 */
  startedBurn: boolean;
}

/**
 * 一次**真实命中**后的回血 —— 只在凛的被动下生效。
 *
 * 调用点必须是「新打中一个怪物」：普攻击破、双生第一击 / 补齐、长按三个得分点。
 * 重复点击已挂起的双生、自爆伤害都不走这里。
 *
 * 燃魂期间不回血；回满的**这一击**按命中前的倍率计分，从下一击开始 ×2。
 */
export function healOnHit(state: GameState, x: number, y: number): HealResult {
  const cfg = characterOf(state.characterId);
  if (cfg.healPerHit <= 0 || state.burning || state.hp >= state.maxHp) {
    return { state, effects: [], healed: 0, startedBurn: false };
  }

  const hp = Math.min(state.maxHp, state.hp + cfg.healPerHit);
  const healed = hp - state.hp;
  let s: GameState = { ...state, hp };
  const effects: Effect[] = [{ type: 'floater', x, y, text: '+' + healed, color: '#ff6a8a' }];

  let startedBurn = false;
  if (hp >= state.maxHp && cfg.burnFloor !== null) {
    startedBurn = true;
    s = { ...s, burning: true, burnCarry: 0 };
    effects.push({ type: 'ring', x, y, life: 0.5, r0: 10, r1: 92, color: '#ff2d4a' });
    effects.push({ type: 'toast', text: '燃魂！得分 ×2', color: '#ff3b5c' });
    effects.push({ type: 'vibrate', pattern: [0, 30, 40, 60] });
  }

  return { state: s, effects, healed, startedBurn };
}

/** 燃魂推进的结果。 */
export interface BurnResult {
  state: GameState;
  effects: Effect[];
}

/**
 * 推进燃魂烧血（每 tick 一次）。
 *
 * 生命是整数，烧血是小数：`burnCarry` 累计小数部分，够 1 点才扣。
 * 烧到 `burnFloor` 立即退出，**不会**把生命烧到线下；
 * 若外部伤害先把血打到线下，这里也会退出燃魂（生命不回升）。
 */
export function stepBurn(state: GameState, step: number): BurnResult {
  if (!state.burning) return { state, effects: [] };
  const cfg = characterOf(state.characterId);
  const floor = cfg.burnFloor;
  if (floor === null) return { state: { ...state, burning: false, burnCarry: 0 }, effects: [] };

  const endBurn = (s: GameState): BurnResult => ({
    state: { ...s, burning: false, burnCarry: 0 },
    effects: [{ type: 'toast', text: '燃魂结束', color: '#ff6a8a' }],
  });

  if (state.hp <= floor) return endBurn(state);

  const carry = state.burnCarry + step * cfg.burnDrain;
  const drain = Math.floor(carry + 1e-9);
  if (drain <= 0) return { state: { ...state, burnCarry: carry }, effects: [] };

  const hp = Math.max(floor, state.hp - drain);
  const s: GameState = { ...state, hp, burnCarry: hp <= floor ? 0 : carry - drain };
  return hp <= floor ? endBurn(s) : { state: s, effects: [] };
}
