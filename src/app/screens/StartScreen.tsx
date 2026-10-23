/**
 * 主页面（开始界面）—— 旧实现的 `#startScreen`（`source.html:321-337`）。
 *
 * **这一版把两样东西搬走了**：
 *   - 难度选择 → 独立的「难度」界面（`DifficultyScreen.tsx`）
 *   - 规则墙   → 独立的「玩法说明」界面（`HelpScreen.tsx`）
 *
 * 主页面现在只回答两件事：**这一局打哪一档**、**用哪种点击手法**。
 * 深度来自「屏数」而不是「排布技巧」—— 4 档难度不再和 6 行规则墙挤在同一屏。
 *
 * 难度星级仍是**全局选择**（旧代码的 `diffLevel` 是模块级变量，
 * `resetGame()` 不重置它 —— `legacy-semantics.md` §0），
 * 改动只发生在**什么时候能选**，不影响它跨局保留的性质。
 *
 * 「点击屏幕开始」由**指针输入层**处理（点击舞台 → 开始游戏），
 * 所以这个遮罩**不能**整体标 `data-no-strike`；
 * 但难度 / 玩法说明 / 手法切换都要标 —— 否则点它们会直接开打。
 */

import type { MouseEvent, ReactElement } from 'react';

import type { Difficulty } from '../../game/types';
import type { ControlMode } from '../../input/mapping';
import { difficultyMeta } from '../difficultyMeta';

/** 开始界面属性。 */
export interface StartScreenProps {
  /** 当前难度星级。 */
  diffLevel: Difficulty;
  /** 进「难度」界面。 */
  onOpenDifficulty: () => void;
  /** 进「玩法说明」界面。 */
  onOpenHelp: () => void;
  /** 进「按键设置」界面（电脑端）。 */
  onOpenKeys: () => void;
  /** 当前操作手法（上下 / 左右半屏）。 */
  controlMode: ControlMode;
  /** 切换操作手法。 */
  onControlModeChange: (mode: ControlMode) => void;
}

/** 开始界面。 */
export function StartScreen({
  diffLevel,
  onOpenDifficulty,
  onOpenHelp,
  onOpenKeys,
  controlMode,
  onControlModeChange,
}: StartScreenProps): ReactElement {
  const meta = difficultyMeta(diffLevel);
  const horizontal = controlMode === 'horizontal';

  /**
   * 选好手法后把焦点还给页面 —— 紧接着按 Enter / Space 应当是「开始游戏」，
   * 而不是再次激活这个按钮（想换手法可以再 Tab 回来）。
   */
  const pickControl = (mode: ControlMode): ((event: MouseEvent<HTMLButtonElement>) => void) => {
    return (event) => {
      onControlModeChange(mode);
      event.currentTarget.blur();
    };
  };

  return (
    <div id="startScreen" className="overlay">
      <h2>双轨打怪</h2>

      <div
        id="controlPick"
        className="control-pick"
        data-no-strike=""
        role="group"
        aria-label="操作手法"
      >
        <span className="control-label">手法</span>
        <button
          type="button"
          className={horizontal ? 'control-btn' : 'control-btn active'}
          data-control="vertical"
          aria-pressed={!horizontal}
          aria-label="上下点击：上半屏打上轨，下半屏打下轨"
          title="点击上半屏 → 上轨，下半屏 → 下轨"
          onClick={pickControl('vertical')}
        >
          上下
        </button>
        <button
          type="button"
          className={horizontal ? 'control-btn active' : 'control-btn'}
          data-control="horizontal"
          aria-pressed={horizontal}
          aria-label="左右点击：左半屏打上轨，右半屏打下轨"
          title="点击左半屏 → 上轨，右半屏 → 下轨"
          onClick={pickControl('horizontal')}
        >
          左右
        </button>
      </div>

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

      <button
        id="btnKeys"
        type="button"
        className="home-link"
        data-no-strike=""
        aria-label="按键设置（电脑端）"
        onClick={onOpenKeys}
      >
        按键设置 ›
      </button>

      <div className="tap-hint">点击屏幕开始</div>
    </div>
  );
}
