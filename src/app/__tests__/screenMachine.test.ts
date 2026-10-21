/**
 * 屏幕状态机 —— 主 seam 的单测。
 *
 * 这个状态机描述的是**屏幕**（用户看到的界面）能怎么走：
 *
 * ```
 *        start                pause
 *   idle ──────► running ◄──────── paused
 *    ▲             │  ▲             │
 *    │             │  │ resume      │ restart
 *    │             │  └─────────────┘
 *    │        gameOver
 *    │             ▼
 *    │           over ──restart──► running
 *    │             │
 *    └── chooseDifficulty ────────┘
 * ```
 *
 * 与规则层 `GameState.phase` 同名同义（`idle | running | paused | over`），
 * 但**多两条规则层没有的边**：
 *   - `over → idle`（结算界面的「选择难度」）
 *   - `paused → idle`（暂停界面的「回主页面」）
 *
 * 旧实现的对应位置：`source.html:671`（`startGame`）、`683`（`pauseGame`）、
 * `690`（`resumeGame`）、`700`（`quitToHome`）、`715`（`gameOverNow`）、
 * `2643`（`#btnDiff` → 回难度选择）。
 */

import { describe, expect, it } from 'vitest';

import { canTransition, transition, type ScreenAction } from '../screenMachine';
import type { Phase } from '../../game/types';

describe('屏幕状态机', () => {
  it('idle → running：开始一局', () => {
    expect(canTransition('idle', 'start')).toBe(true);
    expect(transition('idle', 'start')).toBe('running');
  });

  it('running → paused：暂停', () => {
    expect(canTransition('running', 'pause')).toBe(true);
    expect(transition('running', 'pause')).toBe('paused');
  });

  it('paused → running：继续', () => {
    expect(canTransition('paused', 'resume')).toBe(true);
    expect(transition('paused', 'resume')).toBe('running');
  });

  it('running → over：结算', () => {
    expect(canTransition('running', 'gameOver')).toBe(true);
    expect(transition('running', 'gameOver')).toBe('over');
  });

  it('over → running：再来一局', () => {
    expect(canTransition('over', 'restart')).toBe(true);
    expect(transition('over', 'restart')).toBe('running');
  });

  it('paused → running：暂停界面的「重开」', () => {
    expect(canTransition('paused', 'restart')).toBe(true);
    expect(transition('paused', 'restart')).toBe('running');
  });

  it('over → idle：结算界面的「选择难度」', () => {
    expect(canTransition('over', 'chooseDifficulty')).toBe(true);
    expect(transition('over', 'chooseDifficulty')).toBe('idle');
  });

  it('paused → idle：暂停界面的「回主页面」', () => {
    expect(canTransition('paused', 'quitToHome')).toBe(true);
    expect(transition('paused', 'quitToHome')).toBe('idle');
  });

  describe('非法转换被拒（状态保持不变）', () => {
    const illegal: readonly (readonly [Phase, ScreenAction])[] = [
      ['idle', 'pause'],
      ['idle', 'resume'],
      ['idle', 'gameOver'],
      ['idle', 'restart'],
      ['idle', 'chooseDifficulty'],
      ['idle', 'quitToHome'],
      ['running', 'start'],
      ['running', 'resume'],
      ['running', 'restart'],
      ['running', 'chooseDifficulty'],
      ['running', 'quitToHome'],
      ['paused', 'start'],
      ['paused', 'pause'],
      ['paused', 'gameOver'],
      ['paused', 'chooseDifficulty'],
      ['over', 'start'],
      ['over', 'pause'],
      ['over', 'resume'],
      ['over', 'gameOver'],
      ['over', 'quitToHome'],
    ];

    for (const [from, action] of illegal) {
      it(`${from} --${action}--> 保持 ${from}`, () => {
        expect(canTransition(from, action)).toBe(false);
        expect(transition(from, action)).toBe(from);
      });
    }
  });

  it('从任意状态都到不了自己之外的地方（无隐藏边）', () => {
    const all: readonly Phase[] = ['idle', 'running', 'paused', 'over'];
    const actions: readonly ScreenAction[] = [
      'start',
      'pause',
      'resume',
      'gameOver',
      'restart',
      'chooseDifficulty',
      'quitToHome',
    ];
    for (const from of all) {
      for (const action of actions) {
        const next = transition(from, action);
        expect(all).toContain(next);
        if (!canTransition(from, action)) expect(next).toBe(from);
      }
    }
  });
});
