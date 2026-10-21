/**
 * 分数 —— 旧 HUD 的 `#scoreText`（`source.html:300`）。
 *
 * FEVER 期间分数变金色（`.frenzy`），与旧实现一致（`source.html:623`）。
 *
 * **注意**：旧版只有连击数会「脉动」（`#comboText.frenzy{animation:frenzyPulse}`），
 * 分数只变色不变形 —— 所以分数用 `.stat-value`，连击用 `.combo-value`。
 */

import type { ReactElement } from 'react';

/** 分数面板属性。 */
export interface ScorePanelProps {
  /** 当前分数。 */
  score: number;
  /** FEVER 是否生效。 */
  frenzyActive: boolean;
}

/** 分数。 */
export function ScorePanel({ score, frenzyActive }: ScorePanelProps): ReactElement {
  return (
    <div className="stat">
      <b id="scoreText" className={frenzyActive ? 'stat-value frenzy' : 'stat-value'}>
        {score}
      </b>
      <span>SCORE</span>
    </div>
  );
}
