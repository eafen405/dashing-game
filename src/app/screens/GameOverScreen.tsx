/**
 * 结算界面 —— SCORE / MAX COMBO / KILLS / BEST（旧 `#gameOver`）。
 */

import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import type { HudSnapshot } from '../../presentation/hudStore';

export interface GameOverScreenProps {
  snapshot: HudSnapshot;
  onRestart(): void;
  onHome(): void;
}

const stop = (event: ReactPointerEvent): void => {
  event.stopPropagation();
};

/** 结算界面。 */
export function GameOverScreen(props: GameOverScreenProps): JSX.Element {
  const { snapshot } = props;
  return (
    <div className="overlay" onPointerDown={stop}>
      <div className="big">GAME OVER</div>
      <div className="score-row">
        <div>
          <div className="k">SCORE</div>
          <div className="v">{snapshot.score}</div>
        </div>
        <div>
          <div className="k">MAX COMBO</div>
          <div className="v">{snapshot.maxCombo}</div>
        </div>
        <div>
          <div className="k">KILLS</div>
          <div className="v">{snapshot.kills}</div>
        </div>
      </div>
      <div className="sub">历史最高分 {snapshot.best}</div>
      <div className="go-actions">
        <button type="button" className="restart-btn" onClick={props.onRestart}>
          再来一局
        </button>
        <button type="button" className="diff-btn" onClick={props.onHome}>
          选择难度
        </button>
      </div>
    </div>
  );
}
