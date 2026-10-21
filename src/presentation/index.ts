/**
 * 表现层（`src/presentation/`）公共出口。
 *
 * 表现层持有**可变**状态：粒子 / 刀光 / 冲击环 / 飘字 / 屏幕震动 / 角色红闪 /
 * 全屏特效（色散 / 冲击波）。规则层只发效果事件（`src/game/effects.ts`），
 * 表现层决定怎么画；战场层（`src/battlefield/`）只读表现层产出的快照
 * （`FrameView` 的四个表现层字段）。
 *
 * 分层依据 ADR-0003。
 */

export { EffectsPool, FORM_SPECS, MAX_PARTICLES } from './effects';
export {
  classifyBatch,
  EFFECT_INTENSITY,
  intensityOf,
  particleFormOf,
  ringTierOf,
  SHAKE_CAPS,
  SHAKE_TIERS,
  shakeTierOf,
  type BatchSignature,
  type EffectIntensity,
  type ShakeTier,
  type WaveLevel,
} from './fx';
export { ShakeState } from './shake';
export { PresentationState, PAIR_SMASH_DUR, type EffectSink } from './state';
