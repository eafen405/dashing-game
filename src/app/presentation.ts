/**
 * 表现层端口 —— 会话层与表现层之间的接缝。
 *
 * **为什么要有这个接口**：规则层只产出「发生了什么」的效果事件（`Effect`），
 * 「怎么画」是表现层的事（ADR-0003）。会话层需要三样东西：
 *
 * ```
 * GameSession ──apply(effects)──► 表现层 ──snapshot──► FrameView.effects
 *             ──advance(dt)─────►（衰减）
 * ```
 *
 * 表现层的实现是 `src/presentation/`（04a 交付：对象池 + swap-remove）。
 * 本文件只做一件事：把它的 API 收窄成会话层需要的**最小端口**，
 * 这样会话层不依赖表现层的具体形状（换实现只改这一处）。
 *
 * **DOM 副作用的分工**：表现层不碰 DOM —— toast / 受击红屏 / FEVER 闪屏 /
 * 轨道高亮 / 震动 / 结算 都通过 `EffectSink` 转交给上层（会话层 → React 层）。
 */

import type { Effects, ScreenFx } from '../battlefield/types';
import type { Effect } from '../game/effects';
import type { Layout } from '../game/types';
import { PresentationState, type EffectSink } from '../presentation';

/** 表现层端口。 */
export interface PresentationPort {
  /** 应用一批规则层效果（不关心的效果直接忽略）。 */
  apply(effects: readonly Effect[]): void;
  /** 推进表现层衰减 —— **所有阶段都调用**（暂停时粒子照常衰减）。 */
  advance(dt: number): void;
  /** 当前表现层状态（喂给 `FrameView.effects`）。 */
  readonly snapshot: Effects;
  /** 当前屏幕震动强度。 */
  readonly shake: number;
  /** 角色受击红闪强度。 */
  readonly playerFlash: number;
  /** 全屏特效（色散强度 / 冲击波计时与中心）。 */
  readonly screenFx: ScreenFx;
  /** 更新战场布局 —— FEVER 周身火花要知道角色在哪。 */
  setLayout(layout: Layout): void;
  /** 清空（开新局时）。 */
  reset(): void;
}

/**
 * 造一个表现层（适配 04a 的 `PresentationState`）。
 *
 * @param sink 上层钩子 —— 表现层不处理的 DOM 副作用通过它转交。
 *   传 `null` 表示这些效果被丢弃（单测里够用）。
 */
export function createPresentation(sink: EffectSink | null = null): PresentationPort {
  const state = new PresentationState(sink);
  return {
    apply: (effects) => state.applyEffects(effects),
    advance: (dt) => state.step(dt),
    get snapshot(): Effects {
      return state.effects;
    },
    get shake(): number {
      return state.shake.value;
    },
    get playerFlash(): number {
      return state.playerFlash;
    },
    get screenFx(): ScreenFx {
      return state.screenFx;
    },
    setLayout: (layout) => state.setLayout(layout),
    reset: () => state.reset(),
  };
}

/**
 * 把表现层的 `EffectSink` 回调翻译成规则层的效果事件词汇。
 *
 * 这样上层只需要认一种事件（`Effect`），不必再学一套表现层的回调签名。
 */
export function createEffectSink(emit: (effect: Effect) => void): EffectSink {
  return {
    toast: (text, color) => emit({ type: 'toast', text, color }),
    laneFlash: (lane) => emit({ type: 'lane-flash', lane }),
    vibrate: (pattern) => emit({ type: 'vibrate', pattern }),
    hurt: () => emit({ type: 'hurt' }),
    feverStart: () => emit({ type: 'fever-start' }),
    feverEnd: () => emit({ type: 'fever-end' }),
    gameOver: () => emit({ type: 'game-over' }),
  };
}
