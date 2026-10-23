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

describe('按下结果分类（输入风控用）', () => {
  it('命中记 hit，空挥记 whiff', () => {
    const hit = strike(makeState({ monsters: [normalMonster({ x: HIT_X })] }), 'top');
    const whiff = strike(makeState({ monsters: [normalMonster({ x: HIT_X + 400 })] }), 'top');

    expect(hit.outcome).toBe('hit');
    expect(whiff.outcome).toBe('whiff');
  });

  it('长按起手记 hold，太早记 neutral', () => {
    const hold = pressLane(makeState({ monsters: [holdMonster()] }), 'top', 'p1');
    const early = pressLane(
      makeState({ monsters: [holdMonster({ lane: 'top', x: 600 })] }),
      'top',
      'p1',
    );

    expect(hold.outcome).toBe('hold');
    expect(early.outcome).toBe('neutral');
  });

  it('非 running 记 neutral', () => {
    const paused = makeState({ phase: 'paused' });

    expect(strike(paused, 'top').outcome).toBe('neutral');
    expect(pressLane(paused, 'top', 'p1').outcome).toBe('neutral');
  });
});

describe('灵魂代打（按住长条怪时点另一条轨）', () => {
  /** 正在按住上轨的长条怪，下轨来了一只怪。 */
  function holdingState(bottom: ReturnType<typeof normalMonster>) {
    return makeState({
      monsters: [
        holdMonster({ id: 1, lane: 'top', x: HIT_X - 40, anchored: true, holding: true }),
        bottom,
      ],
      holdMonsterId: 1,
      holdInputId: 'p1',
      playerLane: 'top',
      attackLane: 'top',
      attackT: 0.44,
    });
  }

  it('击杀另一条轨的怪：正常计分 / 连击 / 击杀数', () => {
    const state = holdingState(normalMonster({ id: 2, lane: 'bottom', x: HIT_X }));

    const { state: next } = pressLane(state, 'bottom', 'p2');

    expect(next.kills).toBe(1);
    expect(next.combo).toBe(1);
    expect(next.score).toBe(300); // 暴击区
    expect(next.monsters.find((m) => m.id === 2)?.removed).toBe(true);
  });

  it('本体留在长按轨：不改 playerLane / 出招状态，长按不中断', () => {
    const state = holdingState(normalMonster({ id: 2, lane: 'bottom', x: HIT_X + 40 }));

    const { state: next } = pressLane(state, 'bottom', 'p2');

    expect(next.playerLane).toBe('top');
    expect(next.attackLane).toBe('top');
    expect(next.attackT).toBe(0.44);
    expect(next.holdMonsterId).toBe(1);
    expect(next.holdInputId).toBe('p1');
    const held = next.monsters.find((m) => m.id === 1);
    expect(held?.kind).toBe('hold');
    if (held?.kind !== 'hold') throw new Error('应当是长按怪');
    expect(held.anchored).toBe(true);
    expect(held.holding).toBe(true);
  });

  it('发出 soul-strike 效果：从长按轨飞向目标轨的打击点', () => {
    const state = holdingState(normalMonster({ id: 2, lane: 'bottom', x: HIT_X + 40 }));

    const { effects } = pressLane(state, 'bottom', 'p2');
    const soul = effects.find((e) => e.type === 'soul-strike');

    expect(soul).toBeDefined();
    if (soul?.type !== 'soul-strike') throw new Error('应当有灵魂效果');
    expect(soul.from).toBe('top');
    expect(soul.lane).toBe('bottom');
    expect(soul.x).toBe(LAYOUT.hitX);
    expect(soul.y).toBe(LAYOUT.laneY.bottom);
    expect(soul.hit).toBe(true);
    expect(soul.crit).toBe(false);
    // 不再发出本体的刀光
    expect(effects.some((e) => e.type === 'slash')).toBe(false);
  });

  it('灵魂判定点与本体一致：判定区内命中、区外空挥且不额外扣血', () => {
    const inside = holdingState(
      normalMonster({ id: 2, lane: 'bottom', x: HIT_X + LAYOUT.zoneHalf - 0.01 }),
    );
    const outside = holdingState(
      normalMonster({ id: 2, lane: 'bottom', x: HIT_X + LAYOUT.zoneHalf + 0.01 }),
    );

    const hit = pressLane(inside, 'bottom', 'p2');
    const miss = pressLane(outside, 'bottom', 'p2');

    expect(hit.state.kills).toBe(1);
    expect(miss.state.kills).toBe(0);
    expect(miss.state.score).toBe(0);
    expect(miss.state.hp).toBe(state0Hp()); // 空挥不扣血
    const missSoul = miss.effects.find((e) => e.type === 'soul-strike');
    if (missSoul?.type !== 'soul-strike') throw new Error('应当有灵魂效果');
    expect(missSoul.hit).toBe(false);
  });

  it('暴击区与本体一致：灵魂也能打出暴击', () => {
    const inside = holdingState(
      normalMonster({ id: 2, lane: 'bottom', x: HIT_X + LAYOUT.critHalf - 0.01 }),
    );
    const outside = holdingState(
      normalMonster({ id: 2, lane: 'bottom', x: HIT_X + LAYOUT.critHalf + 0.01 }),
    );

    const crit = pressLane(inside, 'bottom', 'p2');
    const normal = pressLane(outside, 'bottom', 'p2');

    expect(crit.state.critCount).toBe(1);
    expect(normal.state.critCount).toBe(0);
    const soul = crit.effects.find((e) => e.type === 'soul-strike');
    if (soul?.type !== 'soul-strike') throw new Error('应当有灵魂效果');
    expect(soul.crit).toBe(true);
  });

  it('没有长按时点另一条轨仍由本体出刀', () => {
    const state = makeState({
      monsters: [normalMonster({ id: 2, lane: 'bottom', x: HIT_X })],
    });

    const { state: next, effects } = pressLane(state, 'bottom', 'p2');

    expect(next.kills).toBe(1);
    expect(effects.some((e) => e.type === 'slash')).toBe(true);
    expect(effects.some((e) => e.type === 'soul-strike')).toBe(false);
  });
});

/** 初始血量（空挥不扣血的基准）。 */
function state0Hp(): number {
  return makeState().hp;
}
