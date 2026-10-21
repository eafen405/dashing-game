/**
 * 每帧的渲染上下文 —— 12 个 view 共享的一份**可复用**快照。
 *
 * 为什么要「可复用」而不是每帧 new 一个：ADR-0004 要求 `render()` 内不得分配
 * （票 04 的硬性约束之一）。这个对象在渲染器构造时建一次，每帧只**改字段**。
 *
 * 里面的 `twinLinks` 同理：双生锁链每帧最多两组，链接对象**复用**，
 * 只有 `twinLinkCount` 变。
 */

import type { HoldMonster, Lane, Layout, Monster, TwinMonster } from '../../game/types';
import type { Effects } from '../types';

/** 空效果集（没有效果时的占位）。 */
export const EMPTY_EFFECTS: Effects = {
  particles: [],
  slashes: [],
  rings: [],
  floaters: [],
};

/** 一组双生怪的锁链。 */
export interface TwinLink {
  /** 链主 —— **上轨**那只（旧代码里就是从它出发画锁链，见 draw-port-map-b §5.1）。 */
  a: TwinMonster;
  /** 伙伴 —— 下轨那只。 */
  b: TwinMonster;
}

/** 每帧渲染上下文（复用，零分配）。 */
export class FrameContext {
  /** 画布上下文。 */
  ctx!: CanvasRenderingContext2D;
  /** 战场几何（渲染层不重算，只读规则层算好的）。 */
  layout!: Layout;
  /** 视觉时钟（旧 `vt`）—— 所有阶段都推进。 */
  vt = 0;
  /** FEVER 是否生效。 */
  frenzyActive = false;
  /** 剩余生命值。 */
  hp = 0;
  /** 角色受击红闪强度。 */
  playerFlash = 0;
  /** 出招动作剩余时间（> 0 表示正在挥击）。 */
  attackT = 0;
  /** 出招轨道。 */
  attackLane: Lane | null = null;
  /** 角色驻守的轨道；`null` = 站在两轨之间。 */
  playerLane: Lane | null = null;
  /** 双生击破下砸动画进度（0 = 未播放，1 = 刚触发）。 */
  pairSmash = 0;
  /** 正在被长按的那只长按怪（没有则为 `null`）。 */
  holdMonster: HoldMonster | null = null;
  /** 在场怪物（渲染层只读）。 */
  monsters: readonly Monster[] = [];
  /** 粒子 / 刀光 / 冲击环 / 飘字。 */
  effects: Effects = EMPTY_EFFECTS;
  /** 该轨上是否有**未完成的长按怪**（旧 `source.html:1633` 的 `monsters.some`）。 */
  readonly longInLane: { top: boolean; bottom: boolean } = { top: false, bottom: false };
  /** 双生锁链（对象复用，数量看 `twinLinkCount`）。 */
  readonly twinLinks: TwinLink[] = [];
  /** 本帧有效的锁链数量。 */
  twinLinkCount = 0;
}
