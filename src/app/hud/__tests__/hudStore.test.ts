/**
 * hudStore 的单测 —— 「值没变就不通知」是这条 seam 的全部要点。
 */

import { describe, expect, it } from 'vitest';

import { comboLabelOf, createHudStore, type HudValues } from '../hudStore';

function values(overrides: Partial<HudValues> = {}): HudValues {
  return {
    hp: 250,
    maxHp: 250,
    burning: false,
    score: 0,
    combo: 0,
    maxCombo: 0,
    kills: 0,
    critCount: 0,
    normalCount: 0,
    frenzyActive: false,
    feverT: 0,
    best: 0,
    ...overrides,
  };
}

describe('hudStore', () => {
  it('发布相同的值 → 不通知订阅者', () => {
    const store = createHudStore();
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    store.publish(values());
    store.publish(values());
    store.publish(values({ score: 0, combo: 0, hp: 250 }));

    expect(notified).toBe(0);
  });

  it('发布不同的值 → 通知订阅者', () => {
    const store = createHudStore();
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    store.publish(values({ score: 200 }));

    expect(notified).toBe(1);
    expect(store.getSnapshot().score).toBe(200);
  });

  it('没变的时候快照引用保持稳定（useSyncExternalStore 依赖这一点）', () => {
    const store = createHudStore();
    const first = store.getSnapshot();
    store.publish(values());
    expect(store.getSnapshot()).toBe(first);

    store.publish(values({ combo: 3 }));
    expect(store.getSnapshot()).not.toBe(first);
  });

  it('任何一个字段变了都算变化', () => {
    const store = createHudStore();
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    const fields: readonly (keyof HudValues)[] = [
      'hp',
      'maxHp',
      'burning',
      'score',
      'combo',
      'maxCombo',
      'kills',
      'critCount',
      'normalCount',
      'frenzyActive',
      'feverT',
      'best',
    ];

    for (const field of fields) {
      const before = notified;
      const changed = values();
      switch (field) {
        case 'hp':
          changed.hp = 200;
          break;
        case 'maxHp':
          changed.maxHp = 300;
          break;
        case 'burning':
          changed.burning = true;
          break;
        case 'score':
          changed.score = 100;
          break;
        case 'combo':
          changed.combo = 2;
          break;
        case 'maxCombo':
          changed.maxCombo = 4;
          break;
        case 'kills':
          changed.kills = 1;
          break;
        case 'critCount':
          changed.critCount = 1;
          break;
        case 'normalCount':
          changed.normalCount = 1;
          break;
        case 'frenzyActive':
          changed.frenzyActive = true;
          break;
        case 'feverT':
          changed.feverT = 5;
          break;
        case 'best':
          changed.best = 900;
          break;
      }
      store.publish(changed);
      expect(notified, `${field} 变了应该通知`).toBe(before + 1);
    }
  });

  it('FEVER 剩余秒数取整：同一秒内不通知', () => {
    const store = createHudStore();
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    store.publish(values({ frenzyActive: true, feverT: 3.2 }));
    expect(notified).toBe(1);
    expect(store.getSnapshot().feverT).toBe(4);
    expect(store.getSnapshot().comboLabel).toBe('FEVER 4s');

    // 3.2 → 3.9 都在「4 秒」这一档里，不该再通知
    store.publish(values({ frenzyActive: true, feverT: 3.9 }));
    expect(notified).toBe(1);

    // 掉到 2.x → 整秒变了 → 通知
    store.publish(values({ frenzyActive: true, feverT: 2.1 }));
    expect(notified).toBe(2);
    expect(store.getSnapshot().comboLabel).toBe('FEVER 3s');
  });

  it('解绑后不再收到通知', () => {
    const store = createHudStore();
    let notified = 0;
    const off = store.subscribe(() => {
      notified += 1;
    });

    store.publish(values({ score: 1 }));
    off();
    store.publish(values({ score: 2 }));

    expect(notified).toBe(1);
  });

  it('初始快照带默认值与标签', () => {
    const store = createHudStore();
    expect(store.getSnapshot().hp).toBe(250);
    expect(store.getSnapshot().maxHp).toBe(250);
    expect(store.getSnapshot().burning).toBe(false);
    expect(store.getSnapshot().comboLabel).toBe('COMBO');
  });

  it('带初值创建时快照反映初值', () => {
    const store = createHudStore({ score: 42, best: 100 });
    expect(store.getSnapshot().score).toBe(42);
    expect(store.getSnapshot().best).toBe(100);
  });
});

describe('连击标签', () => {
  it('非 FEVER 时是 COMBO', () => {
    expect(comboLabelOf(false, 0)).toBe('COMBO');
    expect(comboLabelOf(false, 5)).toBe('COMBO');
  });

  it('FEVER 时带剩余秒数', () => {
    expect(comboLabelOf(true, 3)).toBe('FEVER 3s');
  });

  it('燃魂时标签是 燃魂 ×2', () => {
    expect(comboLabelOf(false, 0, true)).toBe('燃魂 ×2');
  });

  it('燃魂 + FEVER 同时显示', () => {
    expect(comboLabelOf(true, 3, true)).toBe('燃魂 ×2 · FEVER 3s');
  });
});
