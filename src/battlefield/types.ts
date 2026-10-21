/**
 * 战场渲染层的公共契约。
 *
 * 这是**规则层 / 表现层 / 渲染层**之间唯一的接缝（`.scratch/refactor/spec.md` 的分层图）：
 *
 * ```
 * React DOM 层   HUD / 菜单 / 结算            低频，订阅 hudStore（脏检查）
 *      ▲ 只读快照
 * 规则层 game/   纯函数 tick(state,dt,rng)    60fps，无 DOM / 无 Pixi
 *      ▲ 事件
 * 表现层         particles / slashes / rings / floaters / shake    60fps，可变
 *      ▲ FrameView
 * 战场层         BattlefieldRenderer 接口，canvas2d/ 与 pixi/ 两套实现   60fps
 * ```
 *
 * 规则层的类型（`Layout` / `Monster` / `Phase` / `Lane`）从 `../../game` 引入 ——
 * 战场层依赖规则层的**类型**，但**不依赖规则层的实现**（不 import 任何规则函数）。
 * 这条边界保证「渲染层改动不应影响规则层」，由票 03 的 golden trace 门禁兜底。
 */

import type { Lane, Layout, Monster, Phase } from '../game/types';

/**
 * 表现层的可变状态快照。
 *
 * 这里的对象由**表现层拥有**（可变、可池化），渲染层只读。
 * 渲染层**不得**修改这些对象，也不得持有它们跨帧（`render()` 返回后即可释放）。
 */
export interface Effects {
  /** 粒子（旧 `particles`）。上限 260。 */
  readonly particles: readonly Particle[];
  /** 刀光（旧 `slashes`）。 */
  readonly slashes: readonly Slash[];
  /** 冲击环（旧 `rings`）。 */
  readonly rings: readonly Ring[];
  /** 飘分文字（旧 `floaters`）。 */
  readonly floaters: readonly Floater[];
}

/** 单个粒子（旧 `particles.push({...})`）。 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** 已存活时间（秒）。 */
  t: number;
  /** 总寿命（秒）。 */
  life: number;
  color: string;
}

/** 一道刀光（旧 `slashes.push({...})`）。 */
export interface Slash {
  /** 打击点 x。 */
  x: number;
  /** 起点 x（角色身前）。 */
  x0: number;
  y: number;
  /** 已存活时间（秒）。 */
  t: number;
  /** 总寿命（秒）。 */
  life: number;
  lane: Lane;
}

/** 一个冲击环（旧 `rings.push({...})`）。 */
export interface Ring {
  x: number;
  y: number;
  /** 已存活时间（秒）。 */
  t: number;
  /** 总寿命（秒）。 */
  life: number;
  /** 起始半径。 */
  r0: number;
  /** 结束半径。 */
  r1: number;
  color: string;
}

/** 一条飘分文字（旧 `addFloater(x, y, text, color)`）。 */
export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  /** 已存活时间（秒）。 */
  t: number;
  /** 总寿命（秒）。 */
  life: number;
  /** 上升速度（px/s）。 */
  vy: number;
}

/**
 * 一帧的完整画面描述 —— 规则层只读快照 + 表现层状态。
 *
 * **所有长度单位都是 CSS 像素**（与 `Layout` 同一坐标系；设备像素比由 `Layout.dpr` 提供）。
 */
export interface FrameView {
  // ---- 规则层只读快照 ----

  /** 战场几何。渲染层**不得**自己重算 —— 旧实现的 `hitX` 顺序 bug 已由 `computeLayout` 修好。 */
  readonly layout: Layout;
  /** 局面阶段。 */
  readonly phase: Phase;
  /** 剩余生命值。 */
  readonly hp: number;
  /** 当前分数。 */
  readonly score: number;
  /** 当前连击。 */
  readonly combo: number;
  /** 最高连击。 */
  readonly maxCombo: number;
  /** 击杀数。 */
  readonly kills: number;
  /** 暴击数。 */
  readonly critCount: number;
  /** 普攻数。 */
  readonly normalCount: number;
  /** FEVER 是否生效。 */
  readonly frenzyActive: boolean;
  /** FEVER 剩余秒数。 */
  readonly feverT: number;
  /** 游戏时间（秒）—— 只在 running 阶段推进。 */
  readonly now: number;
  /**
   * 世界前进速度（px/s）—— 与怪物移速一致。
   *
   * 地面 / 轨道刻度的滚动用它，让画面读成「角色向前走」而不是「怪物冲过来」。
   */
  readonly scrollSpeed: number;

  /**
   * 视觉时钟（秒）—— 旧实现的 `vt`。
   *
   * **在所有阶段都推进**（idle / paused / over 也走），只有 `now` 在 running 时推进。
   * 背景星空流动、轨道刻度、角色呼吸等装饰动画都读它。
   * 它**不属于规则层**（与胜负无关），由表现层 / 会话层维护。
   */
  readonly visualTime: number;

  /** 在场怪物。已离场的（`removed === true`）**不应**出现在这里。 */
  readonly monsters: readonly Monster[];

  /** 出招动作剩余时间（秒）；`> 0` 表示正在挥击。 */
  readonly attackT: number;
  /** 出招轨道。 */
  readonly attackLane: Lane | null;
  /** 角色驻守的轨道；默认 `'bottom'`（下轨地面），上跳打上轨时为 `'top'`。 */
  readonly playerLane: Lane | null;
  /** 上跳滞空剩余秒数（0 = 已落地）。 */
  readonly playerAirT: number;

  // ---- 表现层可变状态 ----

  /** 粒子 / 刀光 / 冲击环 / 飘字。 */
  readonly effects: Effects;
  /** 当前屏幕震动强度（0 = 无震动）。 */
  readonly shake: number;
  /** 角色受击红闪强度（0 = 正常）。 */
  readonly playerFlash: number;
  /** 双生击破下砸动画进度（0 = 未播放，1 = 刚触发）。 */
  readonly pairSmash: number;
}

/**
 * 战场渲染器。
 *
 * 实现方：Canvas 2D（`src/battlefield/canvas2d/`）与 PixiJS v8（`src/battlefield/pixi/`）。
 * 接口保留是有意的 —— 它是有效的抽象边界，未来换渲染器不必改规则层与表现层。
 */
export interface BattlefieldRenderer {
  /** 把渲染目标挂到宿主元素上。可能是异步的（Pixi 需要 `await app.init()`）。 */
  mount(host: HTMLElement): void | Promise<void>;
  /** 彻底释放资源（WebGL 上下文、事件监听、对象池）。 */
  unmount(): void;
  /** 尺寸 / DPR 变化时调用。 */
  resize(layout: Layout): void;
  /** 画一帧。 */
  render(frame: FrameView): void;
}
