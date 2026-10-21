/**
 * 轨道配色 —— 逐字搬自 `source.html:1507-1509`。
 *
 * FEVER 时两轨仍保留区分度：上轨亮金 `#ffd24a`、下轨琥珀金 `#ff9a2e`
 * （`FRENZY_LANE`，`source.html:397`）。
 */

import { FRENZY_LANE, LANE } from '../../game/constants';
import type { Lane } from '../../game/types';

/** 取某条轨道当前的配色。 */
export function laneColorOf(lane: Lane, frenzyActive: boolean): string {
  return frenzyActive ? FRENZY_LANE[lane] : LANE[lane].color;
}
