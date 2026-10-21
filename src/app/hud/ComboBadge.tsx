/**
 * 连击徽标 —— 旧 HUD 的 `#comboText` / `#comboLabel` / `#critText`（`source.html:301-302`）。
 *
 * 标签逻辑照抄 `source.html:628-632`：
 *   `label = hot ? ("FEVER " + Math.ceil(feverT) + "s") : "COMBO"`
 * 标签由 HUD 快照派生（`hudStore` 的 `comboLabel`），FEVER 期间**每秒**变一次，
 * 不会带着 HUD 一起 60fps 重渲染。
 */

import type { ReactElement } from 'react';

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
        <b className={frenzyActive ? 'stat-value frenzy' : 'stat-value'}>{combo}</b>
        <span className={frenzyActive ? 'combo-label fever' : 'combo-label'}>{comboLabel}</span>
      </div>
      <div className="stat">
        <b className="crit-text">
          {critCount} / {normalCount}
        </b>
        <span>暴击 / 普攻</span>
      </div>
    </>
  );
}
