import { describe, expect, it } from 'vitest';

import { createRng } from '../rng';
import { reduce } from '../reducer';
import { computeLayout } from '../layout';
import { holdMonster, makeState, normalMonster, LAYOUT } from './fixtures';

describe('规则层事件归约器', () => {
  it('Start 开一局新游戏：重置全部规则状态', () => {
    const dirty = makeState({ score: 999, hp: 3, monsters: [normalMonster()] });

    const { state } = reduce(
      dirty,
      { type: 'Start', diffLevel: 2, seed: 42, layout: LAYOUT },
      createRng(42),
    );

    expect(state.phase).toBe('running');
    expect(state.score).toBe(0);
    expect(state.hp).toBe(250);
    expect(state.kills).toBe(0);
    expect(state.combo).toBe(0);
    expect(state.monsters).toHaveLength(0);
    expect(state.spawnTimer).toBeCloseTo(1.3, 10);
    expect(state.diffLevel).toBe(2);
    expect(state.seed).toBe(42);
    expect(state.nextFeverAt).toBe(50);
    expect(state.pairCooldown).toBeCloseTo(4.5, 10);
    expect(state.longCooldown).toBeCloseTo(6, 10);
    expect(state.playerLane).toBe('bottom');
    expect(state.airT).toBe(0);
  });

  it('Tick 推进一帧', () => {
    const { state } = reduce(makeState(), { type: 'Tick', dt: 1 / 60 }, createRng(1));

    expect(state.now).toBeCloseTo(1 / 60, 10);
  });

  it('Press 对该轨挥刀', () => {
    const state = makeState({ monsters: [normalMonster({ x: LAYOUT.hitX + 40 })] });

    const { state: next } = reduce(
      state,
      { type: 'Press', lane: 'top', inputId: 'p1' },
      createRng(1),
    );

    expect(next.kills).toBe(1);
    expect(next.score).toBe(200);
    expect(next.playerLane).toBe('top');
  });

  it('Press 遇到长按怪时起手长按', () => {
    const state = makeState({ monsters: [holdMonster()] });

    const { state: next } = reduce(
      state,
      { type: 'Press', lane: 'top', inputId: 'p1' },
      createRng(1),
    );

    expect(next.holdMonsterId).toBe(1);
    expect(next.holdInputId).toBe('p1');
    expect(next.playerLane).toBe('top');
  });

  it('Release 只在指针 id 匹配时判罚', () => {
    const state = makeState({ monsters: [holdMonster()] });
    const held = reduce(state, { type: 'Press', lane: 'top', inputId: 'p1' }, createRng(1)).state;

    const wrong = reduce(held, { type: 'Release', inputId: 'p2' }, createRng(1));
    expect(wrong.state.combo).toBe(0);
    expect(wrong.state.holdMonsterId).toBe(1);

    const right = reduce(held, { type: 'Release', inputId: 'p1' }, createRng(1));
    expect(right.state.holdMonsterId).toBeNull();
  });

  it('CancelHold 取消长按但不惩罚', () => {
    const state = makeState({ monsters: [holdMonster()], combo: 6 });
    const held = reduce(state, { type: 'Press', lane: 'top', inputId: 'p1' }, createRng(1)).state;

    const { state: next } = reduce(held, { type: 'CancelHold' }, createRng(1));

    expect(next.holdMonsterId).toBeNull();
    expect(next.combo).toBe(6);
  });

  it('Pause 暂停并取消长按，Resume 恢复', () => {
    const state = makeState({ monsters: [holdMonster()], combo: 6 });
    const held = reduce(state, { type: 'Press', lane: 'top', inputId: 'p1' }, createRng(1)).state;

    const paused = reduce(held, { type: 'Pause' }, createRng(1));
    expect(paused.state.phase).toBe('paused');
    expect(paused.state.holdMonsterId).toBeNull();

    const resumed = reduce(paused.state, { type: 'Resume' }, createRng(1));
    expect(resumed.state.phase).toBe('running');
  });

  it('非 running 状态下 Pause / Resume 不改变局面', () => {
    const idle = makeState({ phase: 'idle' });

    expect(reduce(idle, { type: 'Pause' }, createRng(1)).state.phase).toBe('idle');
    expect(reduce(idle, { type: 'Resume' }, createRng(1)).state.phase).toBe('idle');
  });

  it('Resize 更新布局并让在场怪物重新贴合轨道', () => {
    const state = makeState({ monsters: [normalMonster({ y: 999 })] });
    const layout = computeLayout(1200, 800, 2);

    const { state: next } = reduce(state, { type: 'Resize', layout }, createRng(1));

    expect(next.layout.width).toBe(1200);
    expect(next.layout.dpr).toBe(2);
    expect(next.monsters[0]?.y).toBeCloseTo(224, 10);
  });

  it('SetDifficulty 切换难度星级', () => {
    const { state } = reduce(makeState(), { type: 'SetDifficulty', diffLevel: 2 }, createRng(1));

    expect(state.diffLevel).toBe(2);
  });

  it('每次归约都返回新的状态对象与效果事件队列', () => {
    const state = makeState();

    const result = reduce(state, { type: 'Tick', dt: 1 / 60 }, createRng(1));

    expect(result.state).not.toBe(state);
    expect(Array.isArray(result.effects)).toBe(true);
  });
});
