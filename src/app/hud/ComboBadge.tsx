/**
 * 连击徽标 —— 旧 HUD 的 `#comboText` / `#comboLabel` / `#critText`（`source.html:301-302`）。
 *
 * 标签逻辑照抄 `source.html:628-632`：
 *   `label = hot ? ("FEVER " + Math.ceil(feverT) + "s") : "COMBO"`
 * 标签由 HUD 快照派生（`hudStore` 的 `comboLabel`），FEVER 期间**每秒**变一次，
 * 不会带着 HUD 一起 60fps 重渲染。
 *
 * ## 票 07：FEVER 徽章脉冲
 *
 * 旧版靠 CSS 的 `@keyframes frenzyPulse`（`styles.css` 的 `.combo-value.frenzy`）——
 * 票 07 改由 **Motion** 驱动（`motion.b` 的 `animate`）：
 * 脉冲节奏跟旧版一致（0.8 秒，`scale 1 → 1.16 → 1`，`ease-in-out` 无限循环），
 * 但**颜色仍由 CSS 管**（`.frenzy` 的金色 + 辉光），Motion 只管 `transform`。
 *
 * CSS 里那条 `animation: frenzyPulse` 已经删掉 —— CSS 动画与 Motion 的内联
 * `transform` 会打架（CSS 动画的优先级高于内联样式），必须只留一个来源。
 */

import type { ReactElement } from 'react';
import { motion } from 'motion/react';

/** 连击徽标属性。 */
export interface ComboBadgeProps {
  /** 当前连击。 */
  combo: number;
  /** 连击标签（`COMBO` / `FEVER 3s`）。 */
  comboLabel: string;
  /** 暴击数。 */
  critCount: number;
  /** 普攻数。 */
  normalCount: number;
  /** FEVER 是否生效。 */
  frenzyActive: boolean;
}

/** 脉冲时长（秒）—— 与旧 CSS 的 `frenzyPulse 0.8s` 一致。 */
const PULSE_DURATION = 0.8;
/** 脉冲的峰值缩放 —— 与旧 CSS 的 `scale(1.16)` 一致。 */
const PULSE_SCALE = 1.16;

/** 连击 + 暴击 / 普攻。 */
export function ComboBadge({
  combo,
  comboLabel,
  critCount,
  normalCount,
  frenzyActive,
}: ComboBadgeProps): ReactElement {
  return (
    <>
      <div className="stat">
        <motion.b
          id="comboText"
          data-motion="combo-pulse"
          className={frenzyActive ? 'combo-value frenzy' : 'combo-value'}
          animate={frenzyActive ? { scale: [1, PULSE_SCALE, 1] } : { scale: 1 }}
          transition={
            frenzyActive
              ? { duration: PULSE_DURATION, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.25, ease: 'easeOut' }
          }
        >
          {combo}
        </motion.b>
        <span id="comboLabel" className={frenzyActive ? 'combo-label fever' : 'combo-label'}>
          {comboLabel}
        </span>
      </div>
      <div className="stat">
        <b id="critText" className="crit-text">
          {critCount} / {normalCount}
        </b>
        <span>暴击 / 普攻</span>
      </div>
    </>
  );
}
