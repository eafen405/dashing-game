/**
 * HUD 脏检查 —— 票 05 的硬性约束：值不变就不通知 React。
 */

import { describe, expect, it, vi } from 'vitest';

import { makeState } from '../../game/__tests__/fixtures';
import { HudStore } from '../hudStore';

describe('HudStore', () => {
  it('只在可见字段变化时通知订阅者', () => {
    const store = new HudStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    const running = makeState({ score: 200 });
    store.update(running, 0);
    expect(listener).toHaveBeenCalledTimes(1);

    // 同一份值重复推送：不通知
    store.update(running, 0);
    expect(listener).toHaveBeenCalledTimes(1);

    // 快照引用保持稳定
    expect(store.getSnapshot()).toBe(store.getSnapshot());

    unsubscribe();
  });

  it('FEVER 倒计时按整秒变化，不按帧通知', () => {
    const store = new HudStore();
    const listener = vi.fn();
    store.subscribe(listener);

    const base = makeState({ frenzyActive: true, feverT: 9.9 });
    store.update(base, 0);
    expect(store.getSnapshot().feverSeconds).toBe(10);
    const firstNotifications = listener.mock.calls.length;

    // 9.9 → 9.1：仍是 10 秒，不通知
    store.update({ ...base, feverT: 9.1 }, 0);
    expect(listener.mock.calls.length).toBe(firstNotifications);

    // 9.0 → 8.0：HUD 上变成 9 秒，通知一次
    store.update({ ...base, feverT: 8.0 }, 0);
    expect(listener.mock.calls.length).toBe(firstNotifications + 1);
    expect(store.getSnapshot().feverSeconds).toBe(8);
  });

  it('显示用最高分取 max(历史最高, 当前分数)', () => {
    const store = new HudStore();
    store.update(makeState({ score: 1200 }), 800);
    expect(store.getSnapshot().best).toBe(1200);

    store.update(makeState({ score: 300 }), 800);
    expect(store.getSnapshot().best).toBe(800);
  });
});
