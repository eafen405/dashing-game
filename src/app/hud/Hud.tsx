/**
 * 顶部 HUD —— 旧实现的 `#hud`（`source.html:293-306`）。
 *
 * **重渲染频率由「值变化」驱动**，不由帧驱动：
 * 组件订阅 `hudStore`（`useSyncExternalStore`），
 * 快照引用没变就不重渲染（ADR-0003 / ADR-0004）。
 */

import type { ReactElement } from 'react';

import { ComboBadge } from './ComboBadge';
import { HealthBar } from './HealthBar';
import { ScorePanel } from './ScorePanel';
import { useHudSnapshot } from './hudStore';

/** HUD 属性。 */
export interface HudProps {
  /** 暂停按钮。 */
  onPause: () => void;
  /** 全屏按钮。 */
  onToggleFullscreen: () => void;
}

/** 顶部 HUD。 */
export function Hud({ onPause, onToggleFullscreen }: HudProps): ReactElement {
  const hud = useHudSnapshot();

  return (
    <div className="hud">
      <HealthBar hp={hud.hp} />

      <div className="hud-right">
        <ScorePanel score={hud.score} best={hud.best} frenzyActive={hud.frenzyActive} />
        <ComboBadge
          combo={hud.combo}
          comboLabel={hud.comboLabel}
          critCount={hud.critCount}
          normalCount={hud.normalCount}
          frenzyActive={hud.frenzyActive}
        />

        <button
          type="button"
          className="icon-button"
          aria-label="全屏"
          data-no-strike=""
          onClick={onToggleFullscreen}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
          </svg>
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="暂停"
          data-no-strike=""
          onClick={onPause}
        >
          ❚❚
        </button>
      </div>
    </div>
  );
}
