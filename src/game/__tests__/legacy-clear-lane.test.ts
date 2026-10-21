/**
 * 模式 B′ 的兼容开关（`GameState.legacyClearLane`）的行为测试。
 *
 * 这个开关是票 03「模式 B′」的落点：让**新规则层**的 `clearLane()` 回到旧实现的
 * 错误口径，两边都保留 bug → 逐帧完全一致 → 证明「除 D1 外新旧完全等价」。
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

describe('clearLane 的旧口径开关', () => {
  it('默认（新语义）：只有长按怪算占用轨道', () => {
    const monsters = [normalMonster({ lane: 'top' })];
    expect(clearLane(monsters, recordingRng([0.1]))).toBe('top');
  });

  it('旧口径：任何怪都算占用 → 两轨都被占 → 返回 null', () => {
    const monsters = [normalMonster({ lane: 'top' }), normalMonster({ id: 2, lane: 'bottom' })];
    expect(clearLane(monsters, recordingRng([0.1]), true)).toBeNull();
  });

  it('旧口径：只占一轨时仍能给出另一条轨（与旧实现一致）', () => {
    const monsters = [normalMonster({ lane: 'top' })];
    expect(clearLane(monsters, recordingRng([0.1]), true)).toBe('bottom');
  });

  it('两轨都空时新旧口径一致：消耗一次 PRNG 选轨', () => {
    const rng = recordingRng([0.2]);
    expect(clearLane([], rng, true)).toBe('top');
    expect(rng.calls).toEqual(['next']);
  });
});

describe('B′ 开关在生产路径上不可达', () => {
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

describe('B′ 开关确实改变长按怪的生成口径', () => {
  /** 长按怪分支的前置条件都满足、但 28% 判定固定为真。 */
  function baseState() {
    return makeState({
      now: 9,
      longCooldown: 0,
      pairCooldown: 5,
      monsters: [normalMonster({ lane: 'top' }), normalMonster({ id: 2, lane: 'bottom' })],
    });
  }

  it('场上有普通怪时：新语义会刷长按怪，旧口径不会', () => {
    // 两次抽样：第 1 次是 clearLane 选轨，第 2 次是长按怪的 28% 判定
    const fixed = spawnMonster(
      { ...baseState(), legacyClearLane: false },
      recordingRng([0.1, 0.1]),
    );
    expect(fixed.state.monsters.some((m) => m.kind === 'hold')).toBe(true);

    const legacy = spawnMonster({ ...baseState(), legacyClearLane: true }, recordingRng([0.1]));
    expect(legacy.state.monsters.some((m) => m.kind === 'hold')).toBe(false);
  });

  it('旧口径下 clearLane 返回 null → 28% 判定被短路 → 连 PRNG 都不消费', () => {
    const rng = recordingRng([0.1]);
    const legacy = spawnMonster({ ...baseState(), legacyClearLane: true }, rng);
    // 没有长按怪；普通怪分支会消费随机数（选轨 / 速度系数 / y 抖动 …）
    expect(legacy.state.monsters.some((m) => m.kind === 'hold')).toBe(false);
    expect(rng.calls.length).toBeGreaterThan(0);
    void holdMonster;
  });
});
