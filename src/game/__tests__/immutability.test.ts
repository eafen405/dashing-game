import { describe, expect, it } from 'vitest';

import { createRng } from '../rng';
import { reduce } from '../reducer';
import { killMonster, resolvePairSolo, startHold } from '../rules/resolve';
import { strike } from '../rules/strike';
import { tick } from '../rules/tick';
import { holdMonster, makeState, normalMonster, twinPair } from './fixtures';

/** 递归冻结 —— 被冻结的对象在严格模式下任何写操作都会抛 TypeError。 */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

describe('状态不可变', () => {
  it('归约器不改传入的状态', () => {
    const state = deepFreeze(
      makeState({
        monsters: [normalMonster(), holdMonster()],
        combo: 5,
      }),
    );
    const rng = createRng(1);

    // 覆盖所有会改动状态的事件
    reduce(state, { type: 'Press', lane: 'top', inputId: 'p1' }, rng);
    reduce(state, { type: 'Tick', dt: 1 / 60 }, rng);
    reduce(state, { type: 'Release', inputId: 'p1' }, rng);
    reduce(state, { type: 'CancelHold' }, rng);
    reduce(state, { type: 'Pause' }, rng);
    reduce(state, { type: 'Resume' }, rng);
    reduce(state, { type: 'SetDifficulty', diffLevel: 2 }, rng);

    expect(state.score).toBe(0);
    expect(state.combo).toBe(5);
  });

  it('结算函数不改传入的状态', () => {
    const state = deepFreeze(makeState({ monsters: [normalMonster()] }));

    killMonster(state, 1, true);

    expect(state.score).toBe(0);
    expect(state.kills).toBe(0);
    expect(state.monsters[0]?.removed).toBe(false);
  });

  it('出刀不改传入的状态', () => {
    const state = deepFreeze(makeState({ monsters: [normalMonster()] }));

    strike(state, 'top');

    expect(state.monsters[0]?.removed).toBe(false);
    expect(state.attackT).toBe(0);
  });

  it('主推进不改传入的状态', () => {
    const state = deepFreeze(makeState({ monsters: [normalMonster()], spawnTimer: 0.01 }));

    tick(state, 1 / 60, createRng(1));

    expect(state.now).toBe(0);
    expect(state.monsters).toHaveLength(1);
  });

  it('起手长按不改传入的状态', () => {
    const state = deepFreeze(makeState({ monsters: [holdMonster()] }));

    startHold(state, 1, 'p1');

    expect(state.holdMonsterId).toBeNull();
    expect(state.score).toBe(0);
  });

  it('双生按单只结算不改传入的状态', () => {
    const [a, b] = twinPair();
    a.pairPending = true;
    const state = deepFreeze(makeState({ monsters: [a, b] }));

    resolvePairSolo(state, a.id);

    expect(state.hp).toBe(250);
    expect(state.score).toBe(0);
  });

  it('每次产出新对象，不复用旧引用', () => {
    const state = makeState({ monsters: [normalMonster()] });

    const killed = killMonster(state, 1, false);

    expect(killed.state).not.toBe(state);
    expect(killed.state.monsters).not.toBe(state.monsters);
    expect(killed.state.monsters[0]).not.toBe(state.monsters[0]);
  });
});
