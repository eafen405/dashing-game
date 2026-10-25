import { describe, expect, it } from 'vitest';

import { createRng } from '../rng';
import { endFever } from '../rules/fever';
import { failLong, hurtPlayer, missLong } from '../rules/resolve';
import { tick } from '../rules/tick';
import type { GameState } from '../types';
import { holdMonster, makeState, normalMonster } from './fixtures';

const endings = [
  ['倒计时结束', (s: GameState) => tick({ ...s, feverT: 0.01 }, 0.02, createRng(1))],
  ['碰撞漏怪', (s: GameState) => hurtPlayer(s, 1, true)],
  ['另一轨漏怪', (s: GameState) => hurtPlayer(s, 1, false)],
  ['长按中断', (s: GameState) => failLong({ ...s, monsters: [holdMonster()] }, 1)],
  ['长按漏掉', (s: GameState) => missLong({ ...s, monsters: [holdMonster()] }, 1)],
] as const;

describe.each([1, 2, 3, 4] as const)('%i 星 FEVER 结束事件', (diffLevel) => {
  it.each(endings)('%s 同步关闭表现层，后续帧不重复发送', (_label, end) => {
    const state = makeState({
      diffLevel,
      frenzyActive: true,
      feverT: 5,
      spawnTimer: 100,
      monsters: [normalMonster({ id: 1, x: 900 })],
    });
    const result = end(state);
    expect(result.state.frenzyActive).toBe(false);
    expect(result.state.feverT).toBe(0);
    expect(result.effects.filter((e) => e.type === 'fever-end')).toHaveLength(1);
    const next = tick(result.state, 0.02, createRng(1));
    expect(next.effects.some((e) => e.type === 'fever-end')).toBe(false);
  });
});

describe('FEVER 结束反馈', () => {
  it('自然结束保留原来的提示，同时通知表现层关闭色散', () => {
    const result = endFever(makeState({ frenzyActive: true, feverT: 0 }));
    expect(result.effects).toContainEqual({ type: 'fever-end' });
    expect(result.effects).toContainEqual({ type: 'toast', text: 'FEVER 结束', color: '#9fb0cf' });
  });

  it.each(endings.slice(1))('未处于 FEVER 时，%s 不额外发送结束通知', (_label, end) => {
    const result = end(makeState({ monsters: [normalMonster({ id: 1 })] }));
    expect(result.effects.some((e) => e.type === 'fever-end')).toBe(false);
  });
});
