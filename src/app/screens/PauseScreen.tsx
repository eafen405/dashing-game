/**
 * 暂停界面 —— 旧实现的 `#pause`（`source.html:353-362`）。
 *
 * 整个遮罩都标了 `data-no-strike`：旧代码的排除列表里有 `#pause`
 * （`source.html:2538`）—— 在暂停界面上点击不该出刀。
 */

import type { ReactElement } from 'react';

/** 暂停界面属性。 */
export interface PauseScreenProps {
  /** 继续游戏。 */
  onResume: () => void;
  /** 重开一局。 */
  onRestart: () => void;
  /** 回主页面（开始界面）。 */
  onQuitToHome: () => void;
}

/** 暂停界面。 */
export function PauseScreen({ onResume, onRestart, onQuitToHome }: PauseScreenProps): ReactElement {
  return (
    <div id="pause" className="overlay" data-no-strike="">
      <div className="pause-card">
        <h2>已暂停</h2>
        <div className="pause-row">
          <button id="btnResume" type="button" className="primary" onClick={onResume}>
            继续
          </button>
          <button id="btnQuit" type="button" onClick={onRestart}>
            重开
          </button>
          <button id="btnHome" type="button" onClick={onQuitToHome}>
            回主页面
          </button>
        </div>
      </div>
    </div>
  );
}
