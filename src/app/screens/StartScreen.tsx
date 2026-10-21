/**
 * 开始界面 —— 含难度星级选择（旧 `#startScreen`）。
 *
 * 整屏按下即开始（旧 `source.html:2536-2552`）；难度按钮单独拦截，
 * 避免选难度时误开局。
 */

import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import type { Difficulty } from '../../game/types';

export interface StartScreenProps {
  difficulty: Difficulty;
  onSelectDifficulty(diff: Difficulty): void;
  onStart(): void;
}

const stop = (event: ReactPointerEvent): void => {
  event.stopPropagation();
};

/** 开始界面。 */
export function StartScreen(props: StartScreenProps): JSX.Element {
  return (
    <div
      className="overlay"
      onPointerDown={(event) => {
        event.stopPropagation();
        props.onStart();
      }}
    >
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
          每次命中 200 分，命中中心暴击区 300 分；每累计 50 连击进入 FEVER 10 秒，期间得分
          ×1.5。
        </span>
        <br />
        <span style={{ color: '#ff5ecb' }}>
          双生：锁链相连，同击 700（双暴 1000）；单破另一只自爆 -20。
        </span>
        <br />
        <span style={{ color: '#a6ff5e' }}>
          长按：等头部进判定框时点击起手，按住 2 秒贯穿，头 / 1s / 尾各 +200。
          <br />
          错过时机或中途松手：COMBO 清零，不扣血。
        </span>
      </div>

      <div className="diff-pick">
        <button
          type="button"
          className={props.difficulty === 1 ? 'diff-btn active' : 'diff-btn'}
          onPointerDown={stop}
          onClick={() => props.onSelectDifficulty(1)}
        >
          <span className="stars">★</span>
          <span className="dname">1 星 · 标准节奏</span>
        </button>
        <button
          type="button"
          className={props.difficulty === 2 ? 'diff-btn active' : 'diff-btn'}
          onPointerDown={stop}
          onClick={() => props.onSelectDifficulty(2)}
        >
          <span className="stars">★★</span>
          <span className="dname">2 星 · 刷新 ×2 · 移速 ×1.5</span>
        </button>
      </div>

      <div className="tap-hint">点击屏幕开始</div>
    </div>
  );
}
