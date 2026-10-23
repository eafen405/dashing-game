/**
 * 最高分 —— 旧 HUD 的 `#bestText`（`source.html:303`）。
 *
 * 显示的是「历史最高分与当前分数的较大者」（旧实现 `source.html:610`），
 * 写盘由 `src/app/best.ts` 负责，这里只负责显示。
 */

import type { ReactElement } from 'react';

/** 最高分属性。 */
export interface BestStatProps {
  /** 历史最高分（与当前分数取大）。 */
  best: number;
}

/** 最高分。 */
export function BestStat({ best }: BestStatProps): ReactElement {
  return (
    <div className="stat">
      <b id="bestText" className="stat-value">
        {best}
      </b>
      <span>BEST</span>
    </div>
  );
}
