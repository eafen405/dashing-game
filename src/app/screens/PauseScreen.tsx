/**
 * 暂停界面 —— 继续 / 重开 / 回主页面（旧 `#pause`）。
 */

import type { JSX, PointerEvent as ReactPointerEvent } from 'react';

export interface PauseScreenProps {
  onResume(): void;
  onRestart(): void;
  onHome(): void;
}

const stop = (event: ReactPointerEvent): void => {
  event.stopPropagation();
};

/** 暂停界面。 */
export function PauseScreen(props: PauseScreenProps): JSX.Element {
  return (
    <div className="overlay" onPointerDown={stop}>
      <div className="card">
        <h2>已暂停</h2>
        <div className="row">
          <button type="button" className="primary" onClick={props.onResume}>
            继续
          </button>
          <button type="button" onClick={props.onRestart}>
            重开
          </button>
          <button type="button" onClick={props.onHome}>
            回主页面
          </button>
        </div>
      </div>
    </div>
  );
}
