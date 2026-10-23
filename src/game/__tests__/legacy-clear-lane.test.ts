/**
 * 模式 A 的对照开关（`GameState.legacyClearLane`）的行为测试。
 *
 * 生产语义是**空轨**：轨道上没有任何在场怪物才算空（票 11 恢复了旧实现的真实口径）。
 * 票 03 的模式 A 需要复现票 02 的 D1 修法（只算长按怪占用），
 * 这个开关就是那个对照口径 —— **只能**由 `createGameState` 直接打开。
 *
 * **必须保证生产路径不可达** —— 这是本文件最重要的一条断言。
 */

import { describe, expect, it } from 'vitest';

import { reduce } from '../reducer';
import { clearLane, spawnMonster } from '../rules/spawn';
import { createRng } from '../rng';
import { computeLayout } from '../layout';
import { createGameState } from '../state';
import { holdMonster, makeState, normalMonster, recordingRng } from './fixtures';

const LAYOUT = computeLayout(900, 500, 1);

describe('clearLane 的口径开关', () => {
  it('默认（空轨语义）：普通怪只占自己那条轨，另一条可用且不消耗随机数', () => {
    const monsters = [normalMonster({ lane: 'top' })];
    const rng = recordingRng();
    expect(clearLane(monsters, rng)).toBe('bottom');
    expect(rng.calls).toEqual([]);
  });

  it('默认（空轨语义）：两轨都有怪 → 返回 null', () => {
    const monsters = [normalMonster({ lane: 'top' }), normalMonster({ id: 2, lane: 'bottom' })];
    expect(clearLane(monsters, recordingRng([0.1]))).toBeNull();
  });

  it('D1 口径：普通怪不算占用 → 两轨都「空」→ 抽一次随机选轨', () => {
    const monsters = [normalMonster({ lane: 'top' }), normalMonster({ id: 2, lane: 'bottom' })];
    const rng = recordingRng([0.2]);
    expect(clearLane(monsters, rng, true)).toBe('top');
    expect(rng.calls).toEqual(['next']);
  });

  it('D1 口径：长按怪占一轨时，另一条轨直接可用', () => {
    const monsters = [holdMonster({ lane: 'top' })];
    expect(clearLane(monsters, recordingRng(), true)).toBe('bottom');
  });

  it('两轨都空时两种口径一致：消耗一次 PRNG 选轨', () => {
    const rng = recordingRng([0.2]);
    expect(clearLane([], rng, true)).toBe('top');
    expect(rng.calls).toEqual(['next']);
  });
});

describe('对照开关在生产路径上不可达', () => {
  it('createGameState 默认关闭', () => {
    const state = createGameState({ diffLevel: 1, seed: 1, layout: LAYOUT });
    expect(state.legacyClearLane).toBe(false);
  });

  it('规则层的 Start 事件开不出这个开关', () => {
    const rng = createRng(1);
    const result = reduce(
      createGameState({ diffLevel: 1, seed: 1, layout: LAYOUT }),
      { type: 'Start', diffLevel: 2, seed: 7, layout: LAYOUT },
      rng,
    );
    expect(result.state.legacyClearLane).toBe(false);
  });

  it('其它事件也不会把它打开', () => {
    const rng = createRng(1);
    let state = makeState();
    for (const event of [
      { type: 'Tick', dt: 1 / 60 },
      { type: 'Press', lane: 'top', inputId: 'x' },
      { type: 'Release', inputId: 'x' },
      { type: 'CancelHold' },
      { type: 'SetDifficulty', diffLevel: 2 },
    ] as const) {
      state = reduce(state, event, rng).state;
      expect(state.legacyClearLane).toBe(false);
    }
  });

  it('只有直接调 createGameState 才能打开它（票 03 回放器的入口）', () => {
    const state = createGameState({ diffLevel: 1, seed: 1, layout: LAYOUT, legacyClearLane: true });
    expect(state.legacyClearLane).toBe(true);
  });
});

describe('对照开关确实改变长按怪的生成口径', () => {
  /** 长按怪分支的前置条件都满足、但 28% 判定固定为真。 */
  function baseState() {
    return makeState({
      now: 9,
      longCooldown: 0,
      pairCooldown: 5,
      monsters: [normalMonster({ lane: 'top' }), normalMonster({ id: 2, lane: 'bottom' })],
    });
  }

  it('场上有普通怪时：生产语义（空轨）不刷长按怪，D1 口径会刷', () => {
    const fixed = spawnMonster(
      { ...baseState(), legacyClearLane: false },
      recordingRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    expect(fixed.state.monsters.some((m) => m.kind === 'hold')).toBe(false);

    const d1 = spawnMonster(
      { ...baseState(), legacyClearLane: true },
      recordingRng([0.1, 0.1, 0.5, 0.5, 0.5, 0.5, 0.5]),
    );
    expect(d1.state.monsters.some((m) => m.kind === 'hold')).toBe(true);
  });

  it('生产语义下 clearLane 返回 null → 长按怪判定被短路', () => {
    const rng = recordingRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const fixed = spawnMonster({ ...baseState(), legacyClearLane: false }, rng);
    expect(fixed.state.monsters.some((m) => m.kind === 'hold')).toBe(false);
  });
});
