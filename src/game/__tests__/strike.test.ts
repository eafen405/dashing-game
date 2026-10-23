import { describe, expect, it } from 'vitest';

import { pressLane, strike } from '../rules/strike';
import { LAYOUT, holdMonster, makeState, normalMonster, twinPair } from './fixtures';

/** 判定区中心（hitX）。 */
const HIT_X = LAYOUT.hitX;

describe('出刀', () => {
  it('命中判定区内的普通怪：普攻 200 分，连击 +1', () => {
    const state = makeState({ monsters: [normalMonster({ x: HIT_X + 40 })] });

    const { state: next, effects } = strike(state, 'top');

    expect(next.score).toBe(200);
    expect(next.combo).toBe(1);
    expect(next.kills).toBe(1);
    expect(next.normalCount).toBe(1);
    expect(next.critCount).toBe(0);
    expect(effects.some((e) => e.type === 'burst')).toBe(true);
  });

  it('命中暴击区内的普通怪：暴击 300 分，记暴击数', () => {
    const state = makeState({ monsters: [normalMonster({ x: HIT_X })] });

    const { state: next } = strike(state, 'top');

    expect(next.score).toBe(300);
    expect(next.critCount).toBe(1);
    expect(next.normalCount).toBe(0);
  });

  it('判定区外的怪打不到（空挥）', () => {
    const state = makeState({ monsters: [normalMonster({ x: HIT_X + 400 })] });

    const { state: next } = strike(state, 'top');

    expect(next.score).toBe(0);
    expect(next.kills).toBe(0);
  });

  it('对不上轨的怪打不到', () => {
    const state = makeState({ monsters: [normalMonster({ lane: 'bottom', x: HIT_X })] });

    const { state: next } = strike(state, 'top');

    expect(next.score).toBe(0);
  });

  it('同一次挥击期间不重复起招，换轨则重新起招', () => {
    const first = makeState({ monsters: [normalMonster({ x: HIT_X + 400 })] });

    const afterFirst = strike(first, 'top').state;
    const afterSecond = strike(afterFirst, 'top').state;

    expect(afterSecond.attackLane).toBe('top');
    expect(afterSecond.attackT).toBeCloseTo(0.44, 10);

    const afterOther = strike(afterSecond, 'bottom').state;
    expect(afterOther.attackLane).toBe('bottom');
  });

  it('双生：第一击不杀死，而是挂起等待另一轨', () => {
    const [a, b] = twinPair();
    const state = makeState({ monsters: [a, b] });

    const { state: next } = strike(state, 'top');

    expect(next.kills).toBe(0);
    expect(next.score).toBe(0);
    const pending = next.monsters.find((m) => m.id === a.id);
    expect(pending?.kind).toBe('twin');
    if (pending?.kind !== 'twin') throw new Error('应当是双生怪');
    expect(pending.pairPending).toBe(true);
    expect(pending.pairT).toBeCloseTo(0.18, 10);
  });

  it('双生：窗口内补齐 → 700 分，一次算 2 连击', () => {
    const [a, b] = twinPair();
    const state = makeState({ monsters: [a, b] });

    const pending = strike(state, 'top');
    const completed = strike(pending.state, 'bottom');

    expect(completed.state.score).toBe(700);
    expect(completed.state.kills).toBe(2);
    expect(completed.state.combo).toBe(2);
    expect(completed.state.normalCount).toBe(2);
  });

  it('双生：双方都暴击 → 1000 分', () => {
    const [a, b] = twinPair({ x: HIT_X });
    const state = makeState({ monsters: [a, b] });

    const pending = strike(state, 'top');
    const completed = strike(pending.state, 'bottom');

    expect(completed.state.score).toBe(1000);
    expect(completed.state.critCount).toBe(2);
  });

  it('双生：对同一轨重复点击不刷新时间窗', () => {
    const [a, b] = twinPair();
    const state = makeState({ monsters: [a, b] });

    const pending = strike(state, 'top');
    const again = strike(pending.state, 'top');

    const still = again.state.monsters.find((m) => m.id === a.id);
    expect(still?.kind).toBe('twin');
    if (still?.kind !== 'twin') throw new Error('应当是双生怪');
    expect(still.pairPending).toBe(true);
    expect(still.pairT).toBeCloseTo(0.18, 10);
    expect(again.state.kills).toBe(0);
  });

  it('双生：一边暴击一边不暴击 → 不算双生暴击，按 700 分', () => {
    const [a, b] = twinPair();
    b.x = HIT_X; // 下轨那只在暴击区，上轨那只在判定区外围
    const state = makeState({ monsters: [a, b] });

    const pending = strike(state, 'top');
    const completed = strike(pending.state, 'bottom');

    expect(completed.state.score).toBe(700);
    expect(completed.state.critCount).toBe(0);
    expect(completed.state.normalCount).toBe(2);
  });
});

describe('按下半屏', () => {
  it('该轨有长按怪时优先起手长按，不挥刀', () => {
    const state = makeState({ monsters: [holdMonster({ lane: 'top' })] });

    const { state: next } = pressLane(state, 'top', 'p1');

    expect(next.holdMonsterId).toBe(1);
    expect(next.holdInputId).toBe('p1');
    expect(next.score).toBe(200); // 头部得分
    expect(next.combo).toBe(0); // 长按的得分点不增加连击
  });

  it('该轨没有长按怪时挥刀', () => {
    const state = makeState({ monsters: [normalMonster({ lane: 'bottom', x: HIT_X })] });

    const { state: next } = pressLane(state, 'bottom', 'p1');

    expect(next.holdMonsterId).toBeNull();
    expect(next.kills).toBe(1);
  });

  it('长按怪头部还没进判定区时不挥空刀，只提示「太早」', () => {
    const state = makeState({ monsters: [holdMonster({ lane: 'top', x: 600 })] });

    const { state: next, effects } = pressLane(state, 'top', 'p1');

    expect(next.holdMonsterId).toBeNull();
    expect(next.kills).toBe(0);
    expect(effects.some((e) => e.type === 'floater' && e.text === '太早')).toBe(true);
  });

  it('长按怪头部已越过判定区时判定漏怪（连击清零，不扣血）', () => {
    const state = makeState({ monsters: [holdMonster({ lane: 'top', x: 100 })], combo: 7 });

    const { state: next } = pressLane(state, 'top', 'p1');

    expect(next.combo).toBe(0);
    expect(next.hp).toBe(250);
  });
});
