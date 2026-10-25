/**
 * 结算界面 —— 旧实现的 `#gameOver`（`source.html:339-351`）。
 *
 * 四个数（`source.html:720-729`）：
 *   - `goScore` = score
 *   - `goCombo` = maxCombo
 *   - `goKills` = kills
 *   - `goBest`  = "历史最高分 " + best
 *
 * 旧代码在 `score > best` 时才写 localStorage（`source.html:724`）——
 * 写盘的动作在会话层（`src/app/best.ts`），这里只负责显示。
 *
 * ## 票 07：入场动效
 *
 * 面板入场用 **Motion** 驱动（淡入 + 上浮）——
 * CSS 里给 `#gameOver` 关掉了 `opacity` 过渡（`styles.css` 的 `.gameover-enter`），
 * 否则 CSS 过渡会和 Motion 的内联 `opacity` 打架（两套动画同时改一个属性）。
 */

import type { ReactElement } from 'react';
import * as motion from 'motion/react-m';

/** 结算界面属性。 */
export interface GameOverScreenProps {
  /** 本局分数。 */
  score: number;
  /** 本局最高连击。 */
  maxCombo: number;
  /** 本局击杀数。 */
  kills: number;
  /** 历史最高分。 */
  best: number;
  /** 再来一局。 */
  onRestart: () => void;
  /** 回难度选择。 */
  onChooseDifficulty: () => void;
}

/** 结算界面。 */
export function GameOverScreen({
  score,
  maxCombo,
  kills,
  best,
  onRestart,
  onChooseDifficulty,
}: GameOverScreenProps): ReactElement {
  return (
    <motion.div
      id="gameOver"
      className="overlay gameover-enter"
      data-no-strike=""
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="gameover-big">GAME OVER</div>
      <div className="score-row">
        <div>
          <div className="k">SCORE</div>
          <div id="goScore" className="v">
            {score}
          </div>
        </div>
        <div>
          <div className="k">MAX COMBO</div>
          <div id="goCombo" className="v">
            {maxCombo}
          </div>
        </div>
        <div>
          <div className="k">KILLS</div>
          <div id="goKills" className="v">
            {kills}
          </div>
        </div>
      </div>
      <div id="goBest" className="sub">
        历史最高分 {best}
      </div>
      <div className="go-actions">
        <button id="btnRestart" type="button" className="primary-button" onClick={onRestart}>
          再来一局
        </button>
        <button id="btnDiff" type="button" className="ghost-button" onClick={onChooseDifficulty}>
          选择难度
        </button>
      </div>
    </motion.div>
  );
}
