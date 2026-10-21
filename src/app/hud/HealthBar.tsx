/**
 * 血条 —— 旧 HUD 的 `.hp-wrap`（`source.html:294-298`）。
 *
 * 数值来自 HUD 快照（`useHudSnapshot`），**不进 React state**：
 * 快照没变就不重渲染（ADR-0003：React 只订阅规则层派生出的 HUD 快照）。
 */

import type { ReactElement } from 'react';

import { MAX_HP } from '../../game/constants';

/** 血条属性。 */
export interface HealthBarProps {
  /** 剩余生命值。 */
  hp: number;
  /** 生命值上限。 */
  maxHp?: number;
}

/** 血条。 */
export function HealthBar({ hp, maxHp = MAX_HP }: HealthBarProps): ReactElement {
  const ratio = maxHp > 0 ? Math.max(0, hp) / maxHp : 0;
  const low = ratio <= 0.3;

  return (
    <div className="hp-wrap">
      <span className="hp-icon" aria-hidden="true">
        ❤
      </span>
      <div className="hp-bar">
        <div
          className={low ? 'hp-fill low' : 'hp-fill'}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
      <div className="hp-text">{Math.max(0, hp)} / {maxHp}</div>
    </div>
  );
}
