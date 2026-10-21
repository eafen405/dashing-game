/**
 * 表现层状态（效果事件 → 表现状态）的契约测试。
 *
 * 这是**次 seam**：`src/presentation/` 消费规则层的 `Effect[]`，
 * 把「发生了什么」翻译成「怎么表现」。
 */

import { describe, expect, it, vi } from 'vitest';

import type { Effect } from '../../game/effects';
import { MAX_PARTICLES, PAIR_SMASH_DUR, PresentationState, type EffectSink } from '../index';

function makeSink(): EffectSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    toast: (text) => calls.push(`toast:${text}`),
    laneFlash: (lane) => calls.push(`laneFlash:${lane}`),
    vibrate: (pattern) => calls.push(`vibrate:${String(pattern)}`),
    hurt: () => calls.push('hurt'),
    feverStart: () => calls.push('feverStart'),
    feverEnd: () => calls.push('feverEnd'),
    gameOver: () => calls.push('gameOver'),
  };
}

describe('表现层状态 · 效果事件', () => {
  it('burst 事件产生粒子', () => {
    const state = new PresentationState();

    state.applyEffects([{ type: 'burst', x: 10, y: 20, color: '#fff', count: 5, power: 1 }]);

    expect(state.effects.particles).toHaveLength(5);
  });

  it('ring / slash / floater 事件产生对应效果', () => {
    const state = new PresentationState();

    const events: Effect[] = [
      { type: 'ring', x: 1, y: 2, life: 0.3, r0: 5, r1: 28, color: '#a6ff5e' },
      { type: 'slash', x: 3, x0: 4, y: 5, life: 0.25, lane: 'top' },
      { type: 'floater', x: 6, y: 7, text: '+700', color: '#ff5ecb' },
    ];
    state.applyEffects(events);

    expect(state.effects.rings).toHaveLength(1);
    expect(state.effects.slashes).toHaveLength(1);
    expect(state.effects.floaters).toHaveLength(1);
    expect(state.effects.floaters[0]?.text).toBe('+700');
  });

  it('粒子事件也受 260 上限约束', () => {
    const state = new PresentationState();

    state.applyEffects([
      { type: 'burst', x: 0, y: 0, color: '#fff', count: 1000, power: 1 },
    ]);

    expect(state.effects.particles).toHaveLength(MAX_PARTICLES);
  });

  it('三种震动事件语义各自落实', () => {
    const state = new PresentationState();

    state.applyEffects([{ type: 'shake-add', amount: 5, cap: 17 }]);
    expect(state.shake.value).toBe(5);

    // shake-add 是**累加**：第二次再加 5 应该是 10
    state.applyEffects([{ type: 'shake-add', amount: 5, cap: 17 }]);
    expect(state.shake.value).toBe(10);

    // shake-add 受上限约束：加 30 但 cap 是 17 → 17
    state.applyEffects([{ type: 'shake-add', amount: 30, cap: 17 }]);
    expect(state.shake.value).toBe(17);

    // shake-max 只在更大时才抬升
    state.applyEffects([{ type: 'shake-max', amount: 3 }]);
    expect(state.shake.value).toBe(17);

    state.applyEffects([{ type: 'shake-max', amount: 9 }]);
    expect(state.shake.value).toBe(17);

    state.applyEffects([{ type: 'shake-max', amount: 25 }]);
    expect(state.shake.value).toBe(25);

    // shake-set 是直接赋值
    state.applyEffects([{ type: 'shake-set', amount: 2 }]);
    expect(state.shake.value).toBe(2);
  });

  it('player-flash 事件点亮红闪', () => {
    const state = new PresentationState();

    state.applyEffects([{ type: 'player-flash' }]);

    expect(state.playerFlash).toBe(1);
  });

  it('pair-smash 触发双生下砸动画并随时间衰减', () => {
    const state = new PresentationState();

    state.applyEffects([{ type: 'pair-smash' }]);
    expect(state.pairSmashT).toBe(PAIR_SMASH_DUR);

    state.step(PAIR_SMASH_DUR / 2);
    expect(state.pairSmashT).toBeCloseTo(PAIR_SMASH_DUR / 2, 10);

    state.reset();
    expect(state.pairSmashT).toBe(0);
  });

  it('上层事件转交给 sink', () => {
    const sink = makeSink();
    const state = new PresentationState(sink);

    state.applyEffects([
      { type: 'toast', text: '双生敌人！', color: '#ff5ecb' },
      { type: 'lane-flash', lane: 'top' },
      { type: 'vibrate', pattern: 30 },
      { type: 'hurt' },
      { type: 'fever-start' },
      { type: 'fever-end' },
      { type: 'game-over' },
    ]);

    expect(sink.calls).toEqual([
      'toast:双生敌人！',
      'laneFlash:top',
      'vibrate:30',
      'hurt',
      'feverStart',
      'feverEnd',
      'gameOver',
    ]);
  });

  it('没有 sink 时上层事件被安全丢弃', () => {
    const state = new PresentationState();

    expect(() => state.applyEffects([{ type: 'toast', text: 'x', color: '#fff' }])).not.toThrow();
  });

  it('step 推进效果、衰减红闪与震动', () => {
    const state = new PresentationState();
    state.applyEffects([
      { type: 'burst', x: 0, y: 0, color: '#fff', count: 1, power: 1 },
      { type: 'player-flash' },
      { type: 'shake-set', amount: 14 },
    ]);

    state.step(1);

    expect(state.effects.particles).toHaveLength(0); // 寿命 0.25~0.65 秒，一秒后必然过期
    expect(state.playerFlash).toBe(0);
    expect(state.shake.value).toBe(0); // 0.001^1 后低于 0.2 → 归零
  });

  it('reset 清空一切', () => {
    const state = new PresentationState();
    state.applyEffects([
      { type: 'burst', x: 0, y: 0, color: '#fff', count: 3, power: 1 },
      { type: 'shake-set', amount: 14 },
      { type: 'player-flash' },
    ]);

    state.reset();

    expect(state.effects.particles).toHaveLength(0);
    expect(state.shake.value).toBe(0);
    expect(state.playerFlash).toBe(0);
  });
});

describe('表现层状态 · 随机性', () => {
  it('burst 用 Math.random，不消费规则层 PRNG', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = new PresentationState();

    state.applyEffects([{ type: 'burst', x: 0, y: 0, color: '#fff', count: 3, power: 1 }]);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
