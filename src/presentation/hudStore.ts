/**
 * HUD 外部状态 —— React 通过 `useSyncExternalStore` 订阅的只读快照。
 *
 * 关键约束（票 05）：
 *
 * - **HUD 不许 60fps 重渲染**。会话层每帧调用 `update()`，但只有快照里
 *   真正可见的字段变化时才通知订阅者。
 * - 快照对象只在变化时替换 —— `useSyncExternalStore` 用 `Object.is` 比较，
 *   每帧新建对象会让整棵 HUD 每帧重渲染。
 * - `feverT` 不直接进快照：HUD 只显示整秒，所以这里存 `Math.ceil(feverT)`，
 *   把「每帧变化」压成「每秒变化」。
 */

import { MAX_HP } from '../game/constants';
import type { GameState, Phase } from '../game/types';

/** HUD 需要的最小状态集。 */
export interface HudSnapshot {
  readonly phase: Phase;
  readonly hp: number;
  readonly maxHp: number;
  readonly score: number;
  readonly combo: number;
  readonly critCount: number;
  readonly normalCount: number;
  /** 显示用最高分：`max(历史最高, 当前分数)`（旧实现同理）。 */
  readonly best: number;
  readonly feverActive: boolean;
  /** FEVER 剩余整秒数（非 FEVER 时为 0）。 */
  readonly feverSeconds: number;
  readonly maxCombo: number;
  readonly kills: number;
}

/** 初始快照（开始界面的数值）。 */
export function createHudSnapshot(): HudSnapshot {
  return {
    phase: 'idle',
    hp: MAX_HP,
    maxHp: MAX_HP,
    score: 0,
    combo: 0,
    critCount: 0,
    normalCount: 0,
    best: 0,
    feverActive: false,
    feverSeconds: 0,
    maxCombo: 0,
    kills: 0,
  };
}

/** 两个快照在「HUD 可见字段」上是否完全一致。 */
function sameSnapshot(a: HudSnapshot, b: HudSnapshot): boolean {
  return (
    a.phase === b.phase &&
    a.hp === b.hp &&
    a.score === b.score &&
    a.combo === b.combo &&
    a.critCount === b.critCount &&
    a.normalCount === b.normalCount &&
    a.best === b.best &&
    a.feverActive === b.feverActive &&
    a.feverSeconds === b.feverSeconds &&
    a.maxCombo === b.maxCombo &&
    a.kills === b.kills
  );
}

/**
 * HUD 状态仓库。
 *
 * 会话层每帧调用 `update(state, best)`；值没变就直接返回，不触发任何 React 工作。
 */
export class HudStore {
  private snapshot: HudSnapshot = createHudSnapshot();
  private readonly listeners = new Set<() => void>();

  /** `useSyncExternalStore` 的 getSnapshot：必须是稳定引用，所以用箭头函数字段。 */
  readonly getSnapshot = (): HudSnapshot => this.snapshot;

  /** `useSyncExternalStore` 的 subscribe。 */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * 用规则层状态刷新快照。
   *
   * @param state 当前规则层状态。
   * @param best 历史最高分（未与当前分数取 max）。
   */
  update(state: GameState, best: number): void {
    const next: HudSnapshot = {
      phase: state.phase,
      hp: state.hp,
      maxHp: MAX_HP,
      score: state.score,
      combo: state.combo,
      critCount: state.critCount,
      normalCount: state.normalCount,
      best: Math.max(best, state.score),
      feverActive: state.frenzyActive,
      feverSeconds: state.frenzyActive ? Math.ceil(state.feverT) : 0,
      maxCombo: state.maxCombo,
      kills: state.kills,
    };

    if (sameSnapshot(this.snapshot, next)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  /** 直接重置到开始界面快照（主要给测试与「回主页」用）。 */
  reset(best = 0): void {
    const next: HudSnapshot = { ...createHudSnapshot(), best };
    if (sameSnapshot(this.snapshot, next)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

/** 应用级单例：会话层与 React 共用同一个仓库。 */
export const hudStore = new HudStore();
