/**
 * 开始界面 —— 旧实现的 `#startScreen`（`source.html:321-337`）。
 *
 * **这一版把两样东西搬走了**：
 *   - 难度选择 → 独立的「难度」界面（`DifficultyScreen.tsx`）
 *   - 规则墙   → 独立的「玩法说明」界面（`HelpScreen.tsx`）
 *
 * 开始界面现在只回答一件事：**这一局打哪一档**。
 * 深度来自「屏数」而不是「排布技巧」—— 4 档难度不再和 6 行规则墙挤在同一屏。
 *
 * 难度星级仍是**全局选择**（旧代码的 `diffLevel` 是模块级变量，
 * `resetGame()` 不重置它 —— `legacy-semantics.md` §0），
 * 改动只发生在**什么时候能选**，不影响它跨局保留的性质。
 *
 * 「点击屏幕开始」由**指针输入层**处理（点击舞台 → 开始游戏），
 * 所以这个遮罩**不能**整体标 `data-no-strike`；
 * 但两个入口按钮要标 —— 否则点它们会直接开打。
 */

import type { ReactElement } from 'react';

import type { Difficulty } from '../../game/types';
import { difficultyMeta } from '../difficultyMeta';

/** 开始界面属性。 */
export interface StartScreenProps {
  /** 当前难度星级。 */
  diffLevel: Difficulty;
  /** 进「难度」界面。 */
  onOpenDifficulty: () => void;
  /** 进「玩法说明」界面。 */
  onOpenHelp: () => void;
}

/** 开始界面。 */
export function StartScreen({
  diffLevel,
  onOpenDifficulty,
  onOpenHelp,
}: StartScreenProps): ReactElement {
  const meta = difficultyMeta(diffLevel);

  return (
    <div id="startScreen" className="overlay">
      <h2>双轨打怪</h2>

      <button
        id="btnDifficulty"
        type="button"
        className="home-summary"
        data-no-strike=""
        onClick={onOpenDifficulty}
      >
        <span className="home-summary-k">难度</span>
        <span className="home-summary-stars">{meta.stars}</span>
        <span className="home-summary-name">{meta.name}</span>
        <span className="home-summary-more">调整 ›</span>
      </button>

      <button
        id="btnHelp"
        type="button"
        className="home-link"
        data-no-strike=""
        onClick={onOpenHelp}
      >
        玩法说明 ›
      </button>

      <div className="tap-hint">点击屏幕开始</div>
    </div>
  );
}
