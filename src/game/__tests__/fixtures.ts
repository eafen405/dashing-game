/**
 * 测试夹具 —— 规则层单测的公共脚手架。
 *
 * 布局固定为 900 × 500（DPR 1），对应旧实现「以 900 宽为基准」的设计：
 *   laneY.top = 140   laneY.bottom = 360
 *   playerR   = 46    playerX      = 106.3
 *   hitX      = 345.9 hitW         = 63
 *   zoneHalf  = 58.5  critHalf     = 29.25
 */

import { computeLayout } from '../layout';
import type { Rng } from '../rng';
import { createGameState } from '../state';
import type { GameState, HoldMonster, Layout, NormalMonster, TwinMonster } from '../types';

/** 测试用的标准布局。 */
export const LAYOUT: Layout = computeLayout(900, 500, 1);

/** 造一个开局状态（`phase: 'running'`）。 */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...createGameState({ diffLevel: 1, seed: 1, layout: LAYOUT }),
    ...overrides,
  };
}

/** 造一只普通怪。 */
export function normalMonster(overrides: Partial<NormalMonster> = {}): NormalMonster {
  return {
    kind: 'normal',
    id: 1,
    lane: 'top',
    x: 385.9,
    y: 140,
    vx: -165,
    sf: 1,
    w: 49.5,
    h: 78,
    removed: false,
    phase: 0,
    wob: 1,
    ...overrides,
  };
}

/** 造一只长按怪。 */
export function holdMonster(overrides: Partial<HoldMonster> = {}): HoldMonster {
  return {
    kind: 'hold',
    id: 1,
    lane: 'top',
    x: 300,
    y: 140,
    len: 234,
    w: 234,
    h: 44,
    removed: false,
    phase: 0,
    anchored: false,
    escaped: false,
    holdT: 0,
    headAwarded: false,
    midAwarded: false,
    waitT: 6,
    holding: false,
    tipT: null,
    escSpeed: 980,
    ...overrides,
  };
}

/** 造一组双生怪（上轨 id=1、下轨 id=2，互为 partner）。 */
export function twinPair(overrides: Partial<TwinMonster> = {}): [TwinMonster, TwinMonster] {
  const a: TwinMonster = {
    kind: 'twin',
    id: 1,
    lane: 'top',
    x: 385.9,
    y: 140,
    vx: -165,
    sf: 1,
    w: 49.5,
    h: 78,
    removed: false,
    phase: 0,
    wob: 1,
    pairId: 1,
    partnerId: 2,
    pairPending: false,
    pairT: 0,
    pairCrit: false,
    ...overrides,
  };
  const b: TwinMonster = { ...a, id: 2, lane: 'bottom', y: 360, partnerId: 1 };
  return [a, b];
}

/** 记录每次 PRNG 消耗的随机源（用来断言「消费顺序」）。 */
export interface RecordingRng extends Rng {
  /** 依次记录每个消耗点，如 `next` / `range(0.97,1.03)`。 */
  calls: string[];
}

/**
 * 造一个可记录消费顺序的随机源。
 *
 * @param values 依次返回的随机数（`[0,1)`）。给完以后统一返回 0.5。
 */
export function recordingRng(values: number[] = []): RecordingRng {
  const calls: string[] = [];
  let index = 0;
  const draw = (): number => {
    const v = values[index];
    index += 1;
    return v ?? 0.5;
  };
  return {
    calls,
    next: () => {
      calls.push('next');
      return draw();
    },
    range: (min: number, max: number) => {
      calls.push(`range(${min},${max})`);
      return min + draw() * (max - min);
    },
  };
}

/** 找出某类效果事件。 */
export function effectsOfType<T extends string>(
  effects: readonly { type: T }[],
  type: T,
): { type: T }[] {
  return effects.filter((e) => e.type === type);
}
