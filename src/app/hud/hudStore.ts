/**
 * HUD 快照订阅 —— 事件驱动的脏检查。
 *
 * **为什么不是每帧 setState**：旧实现每帧调 `syncHUD()`（`source.html:1276`），
 * 靠 `hudHp` / `hudScore` 这类缓存值做脏检查（`source.html:461-462`）避免重复写 DOM。
 * React 版本把同一套思路搬到**外部 store**：
 *   - HUD 状态**不进 React state**（否则每帧 setState = 每帧协调）；
 *   - `publish()` 只做数值比较，**值没变就不通知订阅者**；
 *   - `useSyncExternalStore` 只在快照**引用变了**时才触发重渲染。
 *
 * 于是「React / DOM ≤ 1ms」的帧预算靠的是「值变了才渲染」，而不是「每帧都渲染但很便宜」。
 *
 * **FEVER 剩余秒数的坑**：旧代码的连击标签是
 * `label = hot ? ("FEVER " + Math.ceil(feverT) + "s") : "COMBO"`（`source.html:628-632`）——
 * 标签只在**整秒**变化。所以 `feverT` 在快照里存的是**向上取整后的整秒**，
 * 否则 FEVER 期间每帧都是「脏」的，HUD 会跟着 60fps 重渲染。
 * 用户在屏幕上看到的也正是这个整秒值。
 */

import { useSyncExternalStore } from 'react';

import { MAX_HP } from '../../game/constants';
import { hudStats } from './hudStats';

/** HUD 关心的数值（规则层派生 + 跨局最高分）。 */
export interface HudValues {
  /** 剩余生命值。 */
  hp: number;
  /** 生命值上限（角色被动不同）。 */
  maxHp: number;
  /** 凛的燃魂是否生效。 */
  burning: boolean;
  /** 当前分数。 */
  score: number;
  /** 当前连击。 */
  combo: number;
  /** 最高连击。 */
  maxCombo: number;
  /** 击杀数。 */
  kills: number;
  /** 暴击数。 */
  critCount: number;
  /** 普攻数。 */
  normalCount: number;
  /** FEVER 是否生效。 */
  frenzyActive: boolean;
  /** FEVER 剩余**整秒**（向上取整）。 */
  feverT: number;
  /** 历史最高分（与当前分数取大）。 */
  best: number;
}

/** HUD 的完整快照 —— 数值 + 派生出来的标签。 */
export interface HudSnapshot extends HudValues {
  /** 连击标签：`COMBO` / `FEVER 3s` / `燃魂 ×2`。 */
  comboLabel: string;
}

/** HUD 订阅端。 */
export interface HudStore {
  /** 取当前快照（引用稳定：没变化时返回同一个对象）。 */
  getSnapshot(): HudSnapshot;
  /** 订阅变化，返回解绑函数。 */
  subscribe(listener: () => void): () => void;
  /** 发布新值 —— **只有真的变了才通知订阅者**。 */
  publish(values: HudValues): void;
}

/** 默认值。 */
const INITIAL_VALUES: HudValues = {
  hp: MAX_HP,
  maxHp: MAX_HP,
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
};

/** 连击标签 —— 燃魂优先显示倍率，FEVER 可叠加在右边。 */
export function comboLabelOf(frenzyActive: boolean, feverSeconds: number, burning = false): string {
  if (burning) {
    return frenzyActive ? `燃魂 ×2 · FEVER ${feverSeconds}s` : '燃魂 ×2';
  }
  return frenzyActive ? `FEVER ${feverSeconds}s` : 'COMBO';
}

/** 两个数值集合是否相同。 */
function sameValues(a: HudValues, b: HudValues): boolean {
  return (
    a.hp === b.hp &&
    a.maxHp === b.maxHp &&
    a.burning === b.burning &&
    a.score === b.score &&
    a.combo === b.combo &&
    a.maxCombo === b.maxCombo &&
    a.kills === b.kills &&
    a.critCount === b.critCount &&
    a.normalCount === b.normalCount &&
    a.frenzyActive === b.frenzyActive &&
    a.feverT === b.feverT &&
    a.best === b.best
  );
}

/**
 * 造一个 HUD store。
 *
 * @param initial 初始值（缺省用默认值）。
 */
export function createHudStore(initial: Partial<HudValues> = {}): HudStore {
  const values: HudValues = { ...INITIAL_VALUES, ...initial };
  const listeners = new Set<() => void>();

  let snapshot: HudSnapshot = {
    ...values,
    comboLabel: comboLabelOf(values.frenzyActive, values.feverT, values.burning),
  };

  const getSnapshot = (): HudSnapshot => snapshot;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const publish = (next: HudValues): void => {
    // 统计：每次 publish ≈ 一帧（帧数就是「HUD 本该重渲染的次数」）。
    hudStats.publishes += 1;
    // FEVER 剩余秒数取整 —— 标签只在整秒变化（见文件头说明）。
    const normalized: HudValues = { ...next, feverT: Math.ceil(next.feverT) };
    if (sameValues(values, normalized)) return;

    Object.assign(values, normalized);
    snapshot = {
      ...values,
      comboLabel: comboLabelOf(values.frenzyActive, values.feverT, values.burning),
    };
    // 统计：值真的变了才通知 —— 这个计数是「HUD 真正需要重渲染的次数」。
    hudStats.notifications += 1;
    for (const listener of [...listeners]) listener();
  };

  return { getSnapshot, subscribe, publish };
}

/** 应用级 HUD store（单例）。 */
export const hudStore: HudStore = createHudStore();

/**
 * 订阅 HUD 快照。
 *
 * 只在快照**引用变化**时触发重渲染 —— 值没变就不重渲染。
 */
export function useHudSnapshot(): HudSnapshot {
  return useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot, hudStore.getSnapshot);
}
