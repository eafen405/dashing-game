import { describe, expect, it } from 'vitest';

import { clearLane, hasActiveLong, hasActivePair, laneBlocked, spawnMonster } from '../rules/spawn';
import { holdMonster, makeState, normalMonster, recordingRng, twinPair } from './fixtures';

describe('轨道占用判断', () => {
  it('长按怪在场才算占用轨道', () => {
    const monsters = [holdMonster({ lane: 'top' })];

    expect(laneBlocked(monsters, 'top')).toBe(true);
    expect(laneBlocked(monsters, 'bottom')).toBe(false);
    expect(hasActiveLong(monsters)).toBe(true);
  });

  it('普通怪不影响普通怪的选轨（只有长按怪占用轨道）', () => {
    const monsters = [normalMonster({ lane: 'top' }), normalMonster({ id: 2, lane: 'bottom' })];

    expect(laneBlocked(monsters, 'top')).toBe(false);
    expect(laneBlocked(monsters, 'bottom')).toBe(false);
    expect(hasActiveLong(monsters)).toBe(false);
  });

  it('普通怪只占用自己那条轨，不阻止长按怪刷到另一条空轨', () => {
    const monsters = [normalMonster({ lane: 'top' })];
    const rng = recordingRng();

    expect(clearLane(monsters, rng)).toBe('bottom');
    expect(rng.calls).toEqual([]);
  });

  it('两轨都有普通怪时不刷长按怪 —— 长按怪必须独占一条空轨', () => {
    const monsters = [normalMonster({ lane: 'top' }), normalMonster({ id: 2, lane: 'bottom' })];

    expect(clearLane(monsters, recordingRng())).toBeNull();
  });

  it('一轨长按怪 + 另一轨普通怪时没有空轨', () => {
    const monsters = [holdMonster({ lane: 'top' }), normalMonster({ id: 2, lane: 'bottom' })];

    expect(clearLane(monsters, recordingRng())).toBeNull();
  });

  it('长按怪所在轨道被占用，另一条轨道可用', () => {
    const monsters = [holdMonster({ lane: 'top' })];

    expect(clearLane(monsters, recordingRng())).toBe('bottom');
  });

  it('两条轨道都被长按怪占用时没有可用轨道', () => {
    const monsters = [holdMonster({ lane: 'top' }), holdMonster({ id: 2, lane: 'bottom' })];

    expect(clearLane(monsters, recordingRng())).toBeNull();
  });

  it('已离场的长按怪不再占用轨道', () => {
    const monsters = [holdMonster({ lane: 'top', removed: true })];

    expect(laneBlocked(monsters, 'top')).toBe(false);
    expect(hasActiveLong(monsters)).toBe(false);
    expect(clearLane(monsters, recordingRng([0.1]))).toBe('top');
  });

  it('两轨都空时 clearLane 消耗一次随机数来选轨', () => {
    const rng = recordingRng([0.1]);

    clearLane([], rng);

    expect(rng.calls).toEqual(['next']);
  });

  it('只有一轨被占用时 clearLane 不消耗随机数', () => {
    const rng = recordingRng();

    clearLane([holdMonster({ lane: 'top' })], rng);

    expect(rng.calls).toEqual([]);
  });

  it('双生在场时算「有双生」', () => {
    const [a, b] = twinPair();

    expect(hasActivePair([a, b])).toBe(true);
    expect(hasActivePair([normalMonster()])).toBe(false);
  });

  it('只剩一只（另一只已离场）时不再算「有双生」', () => {
    const [a, b] = twinPair();
    b.removed = true;

    expect(hasActivePair([a, b])).toBe(false);
  });

  it('已离场的双生不再算「有双生」', () => {
    const [a, b] = twinPair();
    a.removed = true;

    expect(hasActivePair([a, b])).toBe(false);
  });
});

describe('生成怪物', () => {
  it('开局阶段只生成普通怪', () => {
    const rng = recordingRng([0.1, 0.5, 0.5, 0.5, 0.5]);
    const { state } = spawnMonster(makeState({ now: 0 }), rng);

    expect(state.monsters).toHaveLength(1);
    expect(state.monsters[0]?.kind).toBe('normal');
  });

  it('普通怪的随机数消费顺序：选轨 → 速度系数 → y 抖动 → 相位 → 浮动', () => {
    const rng = recordingRng([0.1, 0.5, 0.5, 0.5, 0.5]);

    spawnMonster(makeState({ now: 0 }), rng);

    expect(rng.calls[0]).toBe('next');
    expect(rng.calls[1]).toBe('range(0.97,1.03)');
    expect(rng.calls[2]).toBe('range(-6,6)');
    expect(rng.calls[3]).toMatch(/^range\(0,/);
    expect(rng.calls[4]).toBe('range(0.8,1.6)');
    expect(rng.calls).toHaveLength(5);
  });

  it('长按怪的随机数消费顺序：clearLane 选轨 → 28% 判定 → 相位 → 冷却', () => {
    const rng = recordingRng([0.1, 0.1, 0.5, 0.5]);
    const { state } = spawnMonster(makeState({ now: 9, longCooldown: 0 }), rng);

    expect(state.monsters).toHaveLength(1);
    expect(state.monsters[0]?.kind).toBe('hold');
    expect(rng.calls[0]).toBe('next');
    expect(rng.calls[1]).toBe('next');
    expect(rng.calls[2]).toMatch(/^range\(0,/);
    expect(rng.calls[3]).toBe('range(14,18)');
  });

  it('clearLane 的随机数消耗发生在 28% 判定之前 —— 即使没生成长按怪也照样消耗', () => {
    // 第一次抽取给 clearLane 选轨，第二次给 28% 判定（0.9 → 不生成长按怪）
    const rng = recordingRng([0.1, 0.9, 0.1, 0.5, 0.5, 0.5, 0.5]);
    const { state } = spawnMonster(makeState({ now: 9, longCooldown: 0 }), rng);

    expect(state.monsters.some((m) => m.kind === 'hold')).toBe(false);
    // 前两次消耗都发生在普通怪生成之前
    expect(rng.calls[0]).toBe('next');
    expect(rng.calls[1]).toBe('next');
    expect(rng.calls[2]).toBe('next');
  });

  it('长按怪成功生成后进入 14~18 秒冷却', () => {
    const rng = recordingRng([0.1, 0.1, 0.5, 0.5]);
    const { state } = spawnMonster(makeState({ now: 9, longCooldown: 0 }), rng);

    expect(state.longCooldown).toBeGreaterThanOrEqual(14);
    expect(state.longCooldown).toBeLessThanOrEqual(18);
  });

  it('双生的随机数消费顺序：20% 判定 → 速度系数 → 相位 → 两只的浮动 → 冷却', () => {
    const rng = recordingRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const { state } = spawnMonster(makeState({ now: 7, pairCooldown: 0 }), rng);

    expect(state.monsters).toHaveLength(2);
    expect(state.monsters.every((m) => m.kind === 'twin')).toBe(true);
    expect(rng.calls[0]).toBe('next');
    expect(rng.calls[1]).toBe('range(0.97,1.03)');
    expect(rng.calls[2]).toMatch(/^range\(0,/);
    expect(rng.calls[3]).toBe('range(0.8,1.6)');
    expect(rng.calls[4]).toBe('range(0.8,1.6)');
    expect(rng.calls[5]).toBe('range(5,8)');
  });

  it('双生两只互为 partner，共享速度与尺寸', () => {
    const rng = recordingRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const { state } = spawnMonster(makeState({ now: 7, pairCooldown: 0 }), rng);
    const [a, b] = state.monsters;

    expect(a?.kind).toBe('twin');
    expect(b?.kind).toBe('twin');
    if (a?.kind !== 'twin' || b?.kind !== 'twin') throw new Error('应当是双生怪');
    expect(a.partnerId).toBe(b.id);
    expect(b.partnerId).toBe(a.id);
    expect(a.sf).toBe(b.sf);
    expect(a.phase).toBe(b.phase);
  });

  it('长按怪不会刷进已经有普通怪的轨道', () => {
    const state = makeState({
      now: 9,
      longCooldown: 0,
      pairCooldown: 10,
      monsters: [normalMonster({ lane: 'top' })],
    });
    // clearLane 无随机；随后是 28% 判定、长按怪相位、14~18 秒冷却
    const rng = recordingRng([0.1, 0.5, 0.5]);

    const { state: next } = spawnMonster(state, rng);
    const hold = next.monsters.find((m) => m.kind === 'hold');

    expect(hold?.lane).toBe('bottom');
    expect(next.monsters.filter((m) => m.kind === 'normal')).toHaveLength(1);
  });

  it('两轨都有普通怪时本轮不刷长按怪', () => {
    const state = makeState({
      now: 9,
      longCooldown: 0,
      pairCooldown: 10,
      monsters: [normalMonster({ lane: 'top' }), normalMonster({ id: 2, lane: 'bottom' })],
    });
    const rng = recordingRng([0.1, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);

    const { state: next } = spawnMonster(state, rng);

    expect(next.monsters.some((m) => m.kind === 'hold')).toBe(false);
  });

  it('长按怪在场时不再生成普通怪到同一条轨道', () => {
    const state = makeState({
      now: 0,
      monsters: [holdMonster({ lane: 'top' })],
    });
    const rng = recordingRng([0.1, 0.5, 0.5, 0.5, 0.5]);

    const next = spawnMonster(state, rng);

    expect(next.state.monsters[1]?.lane).toBe('bottom');
  });

  it('两条轨道都被长按怪占用时本轮不生成普通怪', () => {
    const state = makeState({
      now: 0,
      monsters: [holdMonster({ lane: 'top' }), holdMonster({ id: 2, lane: 'bottom' })],
    });
    const rng = recordingRng([0.1]);

    const next = spawnMonster(state, rng);

    expect(next.state.monsters).toHaveLength(2);
  });
});
