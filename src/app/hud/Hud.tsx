/**
 * 顶部 HUD —— 只读 `HudStore` 快照。
 *
 * 所有数值都来自外部 store（脏检查后才会通知），所以这个组件不会每帧重渲染。
 */

import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import type { HudSnapshot } from '../../presentation/hudStore';

export interface HudProps {
  snapshot: HudSnapshot;
  canFullscreen: boolean;
  onFullscreen(): void;
  onPause(): void;
}

/** 单个统计块。 */
function Stat(props: { value: number | string; label: string; hot?: boolean }): JSX.Element {
  return (
    <div className="stat">
      <b className={props.hot ? 'frenzy' : undefined}>{props.value}</b>
      <span>{props.label}</span>
    </div>
  );
}

/** 顶部 HUD。 */
export function Hud(props: HudProps): JSX.Element {
  const { snapshot } = props;
  const ratio = Math.max(0, Math.min(1, snapshot.hp / Math.max(snapshot.maxHp, 1)));
  const comboLabel = snapshot.feverActive ? `FEVER ${snapshot.feverSeconds}s` : 'COMBO';

  const stop = (event: ReactPointerEvent): void => {
    event.stopPropagation();
  };

  return (
    <div className="hud">
      <div className="hp-wrap">
        <span className="hp-icon">❤</span>
        <div className="hp-bar">
          <div
            className={ratio <= 0.3 ? 'hp-fill low' : 'hp-fill'}
            style={{ transform: `scaleX(${ratio})` }}
          />
        </div>
        <div className="hp-text">
          {Math.max(0, snapshot.hp)} / {snapshot.maxHp}
        </div>
      </div>

      <div className="hud-right">
        <Stat value={snapshot.score} label="SCORE" hot={snapshot.feverActive} />
        <div className="stat">
          <b className={snapshot.feverActive ? 'frenzy' : undefined}>{snapshot.combo}</b>
          <span className={snapshot.feverActive ? 'fever combo-label' : 'combo-label'}>
            {comboLabel}
          </span>
        </div>
        <div className="stat">
          <b className="crit-text">
            {snapshot.critCount} / {snapshot.normalCount}
          </b>
          <span>暴击 / 普攻</span>
        </div>
        <Stat value={snapshot.best} label="BEST" />

        {props.canFullscreen && (
          <button
            type="button"
            className="icon-btn"
            aria-label="全屏"
            onPointerDown={stop}
            onClick={props.onFullscreen}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label="暂停"
          onPointerDown={stop}
          onClick={props.onPause}
        >
          ❚❚
        </button>
      </div>
    </div>
  );
}
