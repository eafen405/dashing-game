import { describe, expect, it } from 'vitest';

import { TOP_AIR_TIME } from '../constants';
import { createRng } from '../rng';
import { strike } from '../rules/strike';
import { tick } from '../rules/tick';
import { holdMonster, makeState, normalMonster, recordingRng, twinPair } from './fixtures';

const FRAME = 1 / 60;

describe('主推进', () => {
  it('游戏时间随帧累加', () => {
    const state = makeState();

    const { state: next } = tick(state, FRAME, createRng(1));

    expect(next.now).toBeCloseTo(FRAME, 10);
  });

  it('单帧步长被钳制到 0.05 秒（与旧实现一致）', () => {
    const state = makeState();

    const { state: next } = tick(state, 10, createRng(1));

    expect(next.now).toBeCloseTo(0.05, 10);
  });

  it('暂停时游戏时间不累加，出招动作也不衰减', () => {
    const state = makeState({ phase: 'paused', attackT: 0.3 });

    const { state: next } = tick(state, FRAME, createRng(1));

    expect(next.now).toBe(0);
    expect(next.attackT).toBeCloseTo(0.3, 10);
  });

  it('非 running 阶段只有出招动作衰减', () => {
    const state = makeState({ phase: 'idle', attackT: 0.3 });

    const { state: next } = tick(state, FRAME, createRng(1));

    expect(next.now).toBe(0);
    expect(next.attackT).toBeCloseTo(0.3 - FRAME, 10);
  });

  it('普通怪随全局移速曲线推进', () => {
    const state = makeState({ monsters: [normalMonster({ x: 900, sf: 1 })] });

    const { state: next } = tick(state, FRAME, createRng(1));
    const monster = next.monsters[0];

    expect(monster?.kind).toBe('normal');
    if (monster?.kind !== 'normal') throw new Error('应当是普通怪');
    expect(monster.vx).toBeCloseTo(-165, 3);
    expect(monster.x).toBeCloseTo(900 - 165 * FRAME, 4);
  });

  it('已离场的怪物在下一 tick 开头被回收', () => {
    const state = makeState({ monsters: [normalMonster({ removed: true })] });

    const { state: next } = tick(state, FRAME, createRng(1));

    expect(next.monsters).toHaveLength(0);
  });

  it('长按怪按住满 3 秒后贯穿完成', () => {
    const held = makeState({
      monsters: [holdMonster({ anchored: true, holding: true, headAwarded: true })],
      holdMonsterId: 1,
      holdInputId: 'p1',
    });

    let state = held;
    for (let i = 0; i < 200; i++) {
      state = tick(state, FRAME, createRng(1)).state;
      if (state.kills > 0) break;
    }

    expect(state.kills).toBe(1);
    expect(state.combo).toBe(1);
    expect(state.normalCount).toBe(1);
  });

  it('长按怪按住满 1 秒发放中间得分，但不加连击', () => {
    const held = makeState({
      monsters: [holdMonster({ anchored: true, holding: true, headAwarded: true })],
      holdMonsterId: 1,
      holdInputId: 'p1',
    });

    let state = held;
    for (let i = 0; i < 70; i++) state = tick(state, FRAME, createRng(1)).state;

    expect(state.score).toBe(200);
    expect(state.combo).toBe(0);
    expect(state.kills).toBe(0);
  });

  it('双生挂起窗口过期后按单只结算，另一只自爆扣血', () => {
    const [a, b] = twinPair();
    a.pairPending = true;
    a.pairT = 0.01;
    const state = makeState({ monsters: [a, b] });

    const { state: next } = tick(state, FRAME, createRng(1));

    expect(next.hp).toBe(230);
    expect(next.kills).toBe(1);
  });

  it('双生挂起过期在触线伤害之前处理', () => {
    // 挂起的那只已经越过触线：先按单只结算（自爆扣 20 血），再判定触线
    const [a, b] = twinPair();
    a.pairPending = true;
    a.pairT = 0.01;
    a.x = 120; // 已经在角色身前
    const state = makeState({ monsters: [a, b] });

    const { state: next } = tick(state, FRAME, createRng(1));

    // 自爆 -20；触线的那只因为已经被结算掉，不再额外扣血
    expect(next.hp).toBe(230);
  });

  it('漏怪扣 20 血（默认驻守下轨）', () => {
    const state = makeState({
      monsters: [normalMonster({ lane: 'bottom', y: 360, x: 130, sf: 1 })],
    });

    const { state: next } = tick(state, FRAME, createRng(1));

    expect(next.hp).toBe(230);
    expect(next.combo).toBe(0);
  });

  it('默认在下轨：上轨漏怪从头顶飞过，不扣血只清连击', () => {
    const state = makeState({ monsters: [normalMonster({ x: 130 })], combo: 7 });

    const { state: next, effects } = tick(state, FRAME, createRng(1));

    expect(next.hp).toBe(250);
    expect(next.combo).toBe(0);
    expect(effects.some((e) => e.type === 'player-flash')).toBe(false);
  });

  it('驻守上轨时，下轨漏怪不扣血，但连击清零', () => {
    const struck = strike(
      makeState({
        monsters: [normalMonster({ lane: 'bottom', y: 360, x: 130 })],
        combo: 9,
        frenzyActive: true,
        feverT: 3,
      }),
      'top',
    ).state;

    const { state: next, effects } = tick(struck, FRAME, createRng(1));

    expect(next.hp).toBe(250);
    expect(next.combo).toBe(0);
    expect(next.frenzyActive).toBe(false);
    expect(effects.some((e) => e.type === 'player-flash')).toBe(false);
    expect(next.monsters[0]?.removed).toBe(true);
  });

  it('驻守下轨时，上轨漏怪不扣血，但连击清零', () => {
    const struck = strike(
      makeState({ monsters: [normalMonster({ x: 130 })], combo: 4 }),
      'bottom',
    ).state;

    const { state: next } = tick(struck, FRAME, createRng(1));

    expect(next.hp).toBe(250);
    expect(next.combo).toBe(0);
  });

  it('驻守上轨时，上轨漏怪仍然扣血', () => {
    const struck = strike(
      makeState({ monsters: [normalMonster({ x: 130 })], combo: 4 }),
      'top',
    ).state;

    const { state: next, effects } = tick(struck, FRAME, createRng(1));

    expect(next.hp).toBe(230);
    expect(next.combo).toBe(0);
    expect(effects.some((e) => e.type === 'player-flash')).toBe(true);
  });

  it('上跳约 1 秒后落回下轨', () => {
    const struck = strike(makeState({ spawnTimer: 999 }), 'top').state;
    expect(struck.playerLane).toBe('top');
    expect(struck.airT).toBeCloseTo(TOP_AIR_TIME, 10);

    let s = struck;
    for (let i = 0; i < 20; i++) s = tick(s, 0.05, createRng(1)).state;

    expect(s.playerLane).toBe('bottom');
    expect(s.airT).toBe(0);
  });

  it('空中改打下轨：立即结束滞空', () => {
    const air = strike(makeState({ spawnTimer: 999 }), 'top').state;
    const down = strike(air, 'bottom').state;

    expect(down.playerLane).toBe('bottom');
    expect(down.airT).toBe(0);
  });

  it('双生触线时，即使角色只驻守一轨也必定受伤', () => {
    const [a, b] = twinPair();
    a.x = 130;
    b.x = 130;
    const struck = strike(makeState({ monsters: [a, b], combo: 6 }), 'top').state;

    const { state: next } = tick(struck, FRAME, createRng(1));

    expect(next.hp).toBe(230);
    expect(next.combo).toBe(0);
  });

  it('生成节奏：倒计时归零时生成一只怪并重置倒计时', () => {
    const state = makeState({ spawnTimer: 0.01 });

    const { state: next } = tick(state, FRAME, createRng(1));

    expect(next.monsters.length).toBeGreaterThan(0);
    expect(next.spawnTimer).toBeGreaterThan(0);
  });

  it('冷却倒计时逐帧递减（单帧步长钳制到 0.05 秒）', () => {
    const state = makeState({ pairCooldown: 1, longCooldown: 2 });

    const { state: next } = tick(state, 0.5, createRng(1));

    expect(next.pairCooldown).toBeCloseTo(0.95, 10);
    expect(next.longCooldown).toBeCloseTo(1.95, 10);
  });

  it('tick 不消耗随机数（除非本帧触发了生成）', () => {
    const rng = recordingRng();

    tick(makeState({ spawnTimer: 5 }), FRAME, rng);

    expect(rng.calls).toEqual([]);
  });
});

describe('300 秒模拟', () => {
  it('不崩、不出 NaN、怪物数量有界', () => {
    const rng = createRng(20240521);
    let state = makeState();

    const frames = Math.round(300 / FRAME);
    let maxMonsters = 0;
    let simulated = 0;
    let gameOvers = 0;

    for (let i = 0; i < frames; i++) {
      // 每 12 帧在交替的一条轨道上出一刀，模拟玩家操作
      if (i % 12 === 0) {
        const lane = i % 24 === 0 ? 'top' : 'bottom';
        state = strike(state, lane).state;
      }
      const { state: next } = tick(state, FRAME, rng);
      state = next;
      simulated += FRAME;

      expect(Number.isFinite(state.now)).toBe(true);
      expect(Number.isFinite(state.score)).toBe(true);
      expect(Number.isFinite(state.hp)).toBe(true);
      expect(Number.isFinite(state.combo)).toBe(true);
      expect(Number.isFinite(state.feverT)).toBe(true);
      expect(Number.isFinite(state.nextFeverAt)).toBe(true);
      for (const m of state.monsters) {
        expect(Number.isFinite(m.x)).toBe(true);
        expect(Number.isFinite(m.y)).toBe(true);
        if (m.kind === 'hold') {
          expect(Number.isFinite(m.holdT)).toBe(true);
          expect(Number.isFinite(m.waitT)).toBe(true);
        }
        if (m.kind === 'twin') {
          expect(Number.isFinite(m.pairT)).toBe(true);
        }
      }

      maxMonsters = Math.max(maxMonsters, state.monsters.length);

      // 血量归零就重开一局，让模拟继续跑满 300 秒
      if (state.phase === 'over') {
        gameOvers += 1;
        state = makeState();
      }
    }

    expect(simulated).toBeCloseTo(300, 1);
    // 场上怪物数量必须有界（活着的怪物不会无限堆积）
    expect(maxMonsters).toBeLessThan(30);
    // 已离场的怪物不会无限堆积
    expect(state.monsters.length).toBeLessThan(30);
    // 模拟期间至少推进过游戏时间
    expect(gameOvers).toBeGreaterThanOrEqual(0);
  });

  it('没有玩家操作时怪物数量同样有界', () => {
    const rng = createRng(7);
    let state = makeState();

    for (let i = 0; i < Math.round(300 / FRAME); i++) {
      state = tick(state, FRAME, rng).state;
      if (state.phase === 'over') state = makeState();
    }

    expect(state.monsters.length).toBeLessThan(30);
  });
});
