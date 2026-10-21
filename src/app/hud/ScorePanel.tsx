/**
 * 分数 —— 旧 HUD 的 `#scoreText`（`source.html:300`）。
 *
 * FEVER 期间分数变金色（`.frenzy`），与旧实现一致（`source.html:623`）。
 *
 * **注意**：旧版只有连击数会「脉动」（`#comboText.frenzy{animation:frenzyPulse}`），
 * 分数只变色不变形 —— 所以分数用 `.stat-value`，连击用 `.combo-value`。
 *
 * ## 票 07：数字滚动
 *
 * 分数变化时**滚动**到新值（不是直接跳）。
 *
 * **关键约束：不许 60fps 重渲染 React**。
 * 所以这里用 `useMotionValue` + `useTransform`：
 * MotionValue 作为 `motion.*` 的 children 时，Motion **直接写 DOM 文本节点**
 * （`DOMVisualElement.handleChildMotionValue` → `textContent = ...`），
 * **不触发 React 重渲染** —— 分数滚动期间 React 的渲染次数是 0。
 *
 * （禁止 `useState` + `setInterval` 逐帧改数字 —— 那是 60fps 的 React 协调。）
 */

import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';

/** 分数面板属性。 */
export interface ScorePanelProps {
  /** 当前分数。 */
  score: number;
  /** FEVER 是否生效。 */
  frenzyActive: boolean;
}

/** 滚动时长（秒）。 */
const ROLL_DURATION = 0.45;

/** 分数。 */
export function ScorePanel({ score, frenzyActive }: ScorePanelProps): ReactElement {
  // 分数的「当前显示值」—— 动画直接写它，不经过 React state。
  const scoreValue = useMotionValue(score);
  // 显示文本：Motion 直接写进 DOM 文本节点（不触发 React 渲染）。
  const scoreText = useTransform(scoreValue, (v) => String(Math.round(v)));

  useEffect(() => {
    const controls = animate(scoreValue, score, { duration: ROLL_DURATION, ease: 'easeOut' });
    return () => controls.stop();
  }, [score, scoreValue]);

  return (
    <div className="stat">
      {/*
        `data-value` 是**目标分数**（React 只在分数变化时写它），
        `<motion.span>` 里是滚动中的显示值。
        端到端断言读 `data-value`，否则会撞上 0.45 秒滚动动画的中间帧。
      */}
      <b
        id="scoreText"
        className={frenzyActive ? 'stat-value frenzy' : 'stat-value'}
        data-value={score}
      >
        <motion.span data-motion="score-roll">{scoreText}</motion.span>
      </b>
      <span>SCORE</span>
    </div>
  );
}
