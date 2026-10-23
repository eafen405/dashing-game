/**
 * 屏幕状态机 —— 纯函数模块。
 *
 * **为什么单独抽一个模块**：React 组件里的 `useState` 没法直接单测（需要 DOM 环境），
 * 而「哪些状态转换是合法的」是本项目最容易出错、也最值得钉死的一条规则。
 * 所以规则写成纯函数，组件只负责把它渲染出来。
 *
 * 状态名直接复用规则层的 `Phase`（`idle | running | paused | over`）——
 * 规则层的 `GameState.phase` 与屏幕状态是**同一个概念**，不另造词汇
 * （见 `GLOSSARY.md` 与 ADR-0003）。
 *
 * 与规则层的差异：规则层只管 `running / paused / over` 三态（`idle` 不是玩法阶段），
 * 屏幕状态机多两条边：
 *   - `over → idle` —— 结算界面的「选择难度」（`source.html:2643`）
 *   - `paused → idle` —— 暂停界面的「回主页面」（`source.html:700`）
 */

import type { Phase } from '../game/types';

/** 屏幕能响应的动作。 */
export type ScreenAction =
  /** 开始一局（开始界面点击 / 回车 / 空格）。 */
  | 'start'
  /** 暂停（running → paused）。 */
  | 'pause'
  /** 继续（paused → running）。 */
  | 'resume'
  /** 结算（running → over）。 */
  | 'gameOver'
  /** 重开一局（paused / over → running）。 */
  | 'restart'
  /** 回难度选择（over → idle）。 */
  | 'chooseDifficulty'
  /** 回主页面（paused → idle）。 */
  | 'quitToHome';

/**
 * 合法转换表。
 *
 * 表里没有的组合就是**非法**转换 —— `transition()` 会原样返回当前状态，
 * 调用方据此判定「这次点击被拒绝了」。
 */
const TRANSITIONS: Record<Phase, Partial<Record<ScreenAction, Phase>>> = {
  idle: {
    start: 'running',
  },
  running: {
    pause: 'paused',
    gameOver: 'over',
  },
  paused: {
    resume: 'running',
    restart: 'running',
    quitToHome: 'idle',
  },
  over: {
    restart: 'running',
    chooseDifficulty: 'idle',
  },
};

/** 这个转换是否合法。 */
export function canTransition(from: Phase, action: ScreenAction): boolean {
  return TRANSITIONS[from][action] !== undefined;
}

/**
 * 执行一次转换。
 *
 * 非法转换**被拒**：返回原状态（不抛异常 —— 界面上的重复点击不该炸掉整个会话）。
 */
export function transition(from: Phase, action: ScreenAction): Phase {
  return TRANSITIONS[from][action] ?? from;
}
