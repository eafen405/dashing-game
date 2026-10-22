/**
 * 开始界面 —— 旧实现的 `#startScreen`（`source.html:321-337`）。
 *
 * 难度星级选择是**全局选择**（旧代码的 `diffLevel` 是模块级变量，
 * `resetGame()` 不重置它 —— `legacy-semantics.md` §0）。
 *
 * 「点击屏幕开始」由**指针输入层**处理（点击舞台 → 开始游戏），
 * 所以这个遮罩**不能**整体标 `data-no-strike`；但难度选择区要标
 * —— 旧代码的排除列表里有 `#diffPick`（`source.html:2538`）。
 */

import type { ReactElement } from 'react';

import type { Difficulty } from '../../game/types';
import { LONG_HOLD_TIME } from '../../game/constants';

/** 开始界面属性。 */
export interface StartScreenProps {
  /** 当前难度星级。 */
  diffLevel: Difficulty;
  /** 切换难度。 */
  onDiffChange: (diffLevel: Difficulty) => void;
}

/** 开始界面。 */
export function StartScreen({ diffLevel, onDiffChange }: StartScreenProps): ReactElement {
  return (
    <div id="startScreen" className="overlay">
      <h2>双轨打怪</h2>
      <div className="legend">
        <div style={{ color: 'var(--p1)' }}>
          <i className="dot" />
          上半屏 → 上轨打击点
        </div>
        <div style={{ color: 'var(--p2)' }}>
          <i className="dot" />
          下半屏 → 下轨打击点
        </div>
      </div>
      <div className="sub">
        怪物从右侧沿上下轨袭来，进入左侧光门时点击对应半屏出刀。
        <br />
        漏掉一次，角色失去 20 点血量（初始 250）。
        <br />
        <span style={{ color: '#ffd24a' }}>
          每次命中 200 分，命中中心暴击区 300 分；每累计 50 连击进入 FEVER 10 秒，期间得分 ×1.5。
        </span>
        <br />
        <span style={{ color: '#ff5ecb' }}>
          双生：锁链相连，同击 700（双暴 1000）；单破另一只自爆 -20。
        </span>
        <br />
        <span style={{ color: '#a6ff5e' }}>
          长按：等头部进判定框时点击起手，按住 {LONG_HOLD_TIME} 秒贯穿，头 / 1s / 尾各 +200。
          <br />
          错过时机或中途松手：COMBO 清零，不扣血。
        </span>
      </div>

      <div id="diffPick" className="diff-pick" data-no-strike="">
        <button
          type="button"
          className={diffLevel === 1 ? 'diff-btn active' : 'diff-btn'}
          data-diff="1"
          onClick={() => onDiffChange(1)}
        >
          <span className="stars">★</span>
          <span className="dname">1 星 · 标准节奏</span>
        </button>
        <button
          type="button"
          className={diffLevel === 2 ? 'diff-btn active' : 'diff-btn'}
          data-diff="2"
          onClick={() => onDiffChange(2)}
        >
          <span className="stars">★★</span>
          <span className="dname">2 星 · 刷新 ×2 · 移速 ×1.5</span>
        </button>
      </div>

      <div className="tap-hint">点击屏幕开始</div>
    </div>
  );
}
