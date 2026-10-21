/**
 * 分数 / 最高分 —— 旧 HUD 的 `#scoreText` 与 `#bestText`（`source.html:300` / `303`）。
 *
 * FEVER 期间分数变金色（`.frenzy`），与旧实现一致（`source.html:623`）。
 */

import type { ReactElement } from 'react';

/** 分数面板属性。 */
export interface ScorePanelProps {
  /** 当前分数。 */
  score: number;
  /** 历史最高分（与当前分数取大 —— 旧实现 `source.html:610`）。 */
  best: number;
  /** FEVER 是否生效。 */
  frenzyActive: boolean;
}

/** 分数 + 最高分。 */
export function ScorePanel({ score, best, frenzyActive }: ScorePanelProps): ReactElement {
  return (
    <>
      <div className="stat">
        <b className={frenzyActive ? 'stat-value frenzy' : 'stat-value'}>{score}</b>
        <span>SCORE</span>
      </div>
      <div className="stat">
        <b className="stat-value">{best}</b>
        <span>BEST</span>
      </div>
    </>
  );
}
