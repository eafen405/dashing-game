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
 * 战场层         BattlefieldRenderer 接口，PixiJS v8 实现   60fps
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
  /** 灵魂分身（按住长条怪时点另一条轨）。 */
  readonly souls: readonly Soul[];
  /** 飘分文字（旧 `floaters`）。 */
  readonly floaters: readonly Floater[];
}

/**
 * 粒子形态 —— 表现层决定「怎么画」。
 *
 * 旧实现只有一种形态（圆点）；票 07 拆成三种，让普攻 / 暴击 / FEVER
 * **一眼可辨**（形状 / 速度 / 颜色 / 生命周期都不同）。
 *
 * - `spark` —— 普攻：圆点，轨道色，旧版速度与寿命。
 * - `shard` —— 暴击：细长碎片，金 / 白，更快更亮。
 * - `ember` —— FEVER：四角星芒，暖金，更慢更持久。
 */
export type ParticleForm = 'spark' | 'shard' | 'ember';

/** 刀光形态 —— 主刀光 / 暴击余晖（余晖是暴击时追加的一层淡金色拖尾）。 */
export type SlashKind = 'main' | 'afterglow';

/** 冲击环档位 —— 普攻 / 暴击 / 双生同破（决定环的粗细与颜色分档）。 */
export type RingTier = 'normal' | 'crit' | 'twin';

/**
 * 冲击波总时长（秒）—— **表现层与渲染层共享的口径**。
 *
 * 表现层用它计时（`PresentationState.screenFx.shockAge`），
 * 渲染层用它反推滤镜的最大半径（`radius = speed × SHOCK_LIFE`）——
 * 两者必须一致，否则波会在半路消失或拖尾。
 */
export const SHOCK_LIFE = 0.42;

/**
 * 全屏特效状态 —— 表现层 → 渲染层。
 *
 * **表现层拥有**这份状态（含插值与计时），渲染层只负责把它映射到滤镜参数上
 * （色散的分量偏移、冲击波的时间 / 半径 / 中心）。
 *
 * 滤镜实例本身**只创建一次**（见 `src/battlefield/pixi/filters.ts`），
 * 靠这里插值出来的数值过渡，不重建实例。
 */
export interface ScreenFx {
  /** FEVER 色散强度（0 = 关闭，1 = 全强度）。 */
  readonly rgbSplit: number;
  /** 冲击波已播放时间（秒）。`shockLevel === 0` 时无意义。 */
  readonly shockAge: number;
  /** 冲击波强度档（0 = 无 / 1 = 暴击 / 2 = 双生同破）。 */
  readonly shockLevel: number;
  /** 冲击波中心 x（CSS 像素）。 */
  readonly shockX: number;
  /** 冲击波中心 y（CSS 像素）。 */
  readonly shockY: number;
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
  /** 粒子形态（表现层决定）。 */
  form: ParticleForm;
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
  /** 刀光形态（主刀光 / 暴击余晖）。 */
  kind: SlashKind;
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
  /** 环的档位（表现层按批次签名打上，决定粗细与颜色分档）。 */
  tier: RingTier;
}

/**
 * 灵魂分身 —— 按住长条怪时点另一条轨，灵魂飞出去代打。
 *
 * 纯表现对象：伤害在规则层已经按本体判定点结算完了，
 * 这里只负责「从角色身上分离 → 飞到落点 → 挥棒 → 消散」的动画。
 */
export interface Soul {
  /** 起点（角色悬浮位置）。 */
  x0: number;
  y0: number;
  /** 落点（本体判定点 `layout.hitX`）。 */
  x: number;
  y: number;
  /** 已存活时间（秒）。 */
  t: number;
  /** 总寿命（秒）。 */
  life: number;
  from: Lane;
  lane: Lane;
  /** 这一击是否命中（未命中时落点不炸开）。 */
  hit: boolean;
  /** 是否暴击（金色灵魂）。 */
  crit: boolean;
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
  /** 当前滚屏速度（px/s）—— 背景 / 地面装饰的流动速度。 */
  readonly scrollSpeed: number;

  // ---- 表现层可变状态 ----

  /** 粒子 / 刀光 / 冲击环 / 飘字。 */
  readonly effects: Effects;
  /** 当前屏幕震动强度（0 = 无震动）。 */
  readonly shake: number;
  /** 角色受击红闪强度（0 = 正常）。 */
  readonly playerFlash: number;
  /** 双生击破下砸动画进度（0 = 未播放，1 = 刚触发）。 */
  readonly pairSmash: number;
  /** 全屏特效（色散 / 冲击波）—— 表现层插值好的数值，渲染层直接映射到滤镜。 */
  readonly screenFx: ScreenFx;
}

/**
 * 判定区操作提示的两种手法（只影响文案，不参与规则）。
 */
export type LaneHintMode = 'vertical' | 'horizontal';

/**
 * 战场渲染器。
 *
 * 当前实现：PixiJS v8（`src/battlefield/pixi/`）。
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
  /**
   * 更新判定区的操作提示文案（上下半屏 / 左右半屏）。
   *
   * 只影响表现文字，不参与规则；先于 `mount()` 调用也必须生效。
   */
  setControlMode?(mode: LaneHintMode): void;
}
