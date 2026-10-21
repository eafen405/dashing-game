/**
 * 表现层（`src/presentation/`）公共出口。
 *
 * 表现层持有**可变**状态：粒子 / 刀光 / 冲击环 / 飘字 / 屏幕震动 / 角色红闪。
 * 规则层只发效果事件（`src/game/effects.ts`），表现层决定怎么画；
 * 战场层（`src/battlefield/`）只读表现层产出的快照（`FrameView` 的三个表现层字段）。
 *
 * 分层依据 ADR-0003。
 */

export { EffectsPool, MAX_PARTICLES } from './effects';
export { HudStore, hudStore, type HudSnapshot } from './hudStore';
export { ShakeState } from './shake';
export { PresentationState, type EffectSink } from './state';
