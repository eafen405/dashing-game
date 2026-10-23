/**
 * 难度选择界面 —— 旧实现开始界面里那排平铺的 `#diffPick` 按钮。
 *
 * **为什么要单独一屏**：4 档难度原来是 `.diff-pick` 里**并排**的 4 个 chip
 * （`styles.css` 的 `display:flex; flex-wrap:wrap`）—— 4 个必然换行成 2×2，
 * 把开始界面顶出横屏手机（`@media (max-height: 410px)` 压扁了也塞不下）。
 * 拆成独立一屏之后，每屏只讲一件事：「这一局打哪一档」。
 *
 * **每档为什么画两条轴**：难度星级不是单调阶梯 —— 3★ 怪最多但最慢，
 * 4★ 最快但怪比 3★ 少。两条轴（密度 / 移速）让这件事一眼可见，
 * 不用读两遍文字（详见 `src/app/difficultyMeta.ts` 的说明）。
 */

import type { ReactElement } from 'react';

import type { Difficulty } from '../../game/types';
import { DIFFICULTIES, difficultyMeta } from '../difficultyMeta';

/** 难度选择界面属性。 */
export interface DifficultyScreenProps {
  /** 当前难度星级。 */
  diffLevel: Difficulty;
  /** 选定某一档（选定后回主页面）。 */
  onPick: (diffLevel: Difficulty) => void;
  /** 返回主页面。 */
  onBack: () => void;
}
/** 难度选择界面。 */
export function DifficultyScreen({
  diffLevel,
  onPick,
  onBack,
}: DifficultyScreenProps): ReactElement {
  return (
    <div id="difficultyScreen" className="overlay" data-no-strike="">
      <h2>难度</h2>

      <div className="diff-list" role="radiogroup" aria-label="难度星级">
        {DIFFICULTIES.map((d) => {
          const meta = difficultyMeta(d);
          const active = d === diffLevel;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={active}
              className={active ? 'diff-row active' : 'diff-row'}
              data-diff={d}
              onClick={() => onPick(d)}
            >
              <span className="diff-stars">{meta.stars}</span>

              <span className="diff-text">
                <span className="diff-name">{meta.name}</span>
                <span className="diff-note">{meta.note}</span>
              </span>

              <span className="diff-axes">
                <span className="axis">
                  <span className="axis-name">密度</span>
                  <span className="axis-bar">
                    <span
                      className="axis-fill axis-density"
                      style={{ width: `${meta.density * 100}%` }}
                    />
                  </span>
                </span>
                <span className="axis">
                  <span className="axis-name">移速</span>
                  <span className="axis-bar">
                    <span
                      className="axis-fill axis-speed"
                      style={{ width: `${meta.speed * 100}%` }}
                    />
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <button id="btnDiffBack" type="button" className="back-button" onClick={onBack}>
        ‹ 返回
      </button>
    </div>
  );
}
