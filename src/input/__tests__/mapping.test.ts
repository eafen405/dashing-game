/**
 * 输入映射的单测 —— 原始 DOM 事件 → 规则层事件的转换（输入层的主 seam）。
 *
 * 对照旧实现 `source.html:2536-2583`。
 */

import { describe, expect, it } from 'vitest';

import { KEY_INPUT_ID, laneForY, mapKeyDown, mapKeyUp, pointerInputId } from '../mapping';

describe('指针输入 id', () => {
  it('沿用旧代码的 "p" + pointerId', () => {
    expect(pointerInputId(0)).toBe('p0');
    expect(pointerInputId(7)).toBe('p7');
  });
});

describe('键盘输入 id', () => {
  it('沿用旧代码的 key-top / key-bottom', () => {
    expect(KEY_INPUT_ID.top).toBe('key-top');
    expect(KEY_INPUT_ID.bottom).toBe('key-bottom');
  });
});

describe('半屏 → 轨道', () => {
  const rect = { top: 100, height: 400 };

  it('上半屏走上轨', () => {
    expect(laneForY(100, rect)).toBe('top');
    expect(laneForY(299, rect)).toBe('top');
  });

  it('正中间算下半屏（严格小于才是上半）', () => {
    expect(laneForY(300, rect)).toBe('bottom');
  });

  it('下半屏走下轨', () => {
    expect(laneForY(301, rect)).toBe('bottom');
    expect(laneForY(499, rect)).toBe('bottom');
  });
});

describe('keydown 映射', () => {
  it('↑ / W 在游戏里出上轨刀', () => {
    for (const code of ['ArrowUp', 'KeyW']) {
      expect(mapKeyDown(code, { isStartScreen: false, isOver: false })).toEqual({
        type: 'press',
        lane: 'top',
      });
    }
  });

  it('↓ / S 在游戏里出下轨刀', () => {
    for (const code of ['ArrowDown', 'KeyS']) {
      expect(mapKeyDown(code, { isStartScreen: false, isOver: false })).toEqual({
        type: 'press',
        lane: 'bottom',
      });
    }
  });

  it('开始界面上按 ↑/W/↓/S 都是「开始游戏」', () => {
    for (const code of ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS']) {
      expect(mapKeyDown(code, { isStartScreen: true, isOver: false })).toEqual({
        type: 'startFromTap',
      });
    }
  });

  it('P 键切换暂停', () => {
    expect(mapKeyDown('KeyP', { isStartScreen: false, isOver: false })).toEqual({
      type: 'togglePause',
    });
    expect(mapKeyDown('KeyP', { isStartScreen: true, isOver: false })).toEqual({
      type: 'togglePause',
    });
  });

  it('Enter / Space 在开始界面上是「开始游戏」', () => {
    for (const code of ['Enter', 'Space']) {
      expect(mapKeyDown(code, { isStartScreen: true, isOver: false })).toEqual({
        type: 'startFromTap',
      });
    }
  });

  it('Enter / Space 在结算界面上是「再来一局」', () => {
    for (const code of ['Enter', 'Space']) {
      expect(mapKeyDown(code, { isStartScreen: false, isOver: true })).toEqual({
        type: 'restart',
      });
    }
  });

  it('Enter / Space 在游戏进行中什么也不做', () => {
    for (const code of ['Enter', 'Space']) {
      expect(mapKeyDown(code, { isStartScreen: false, isOver: false })).toEqual({ type: 'none' });
    }
  });

  it('其他键什么也不做', () => {
    expect(mapKeyDown('KeyQ', { isStartScreen: false, isOver: false })).toEqual({ type: 'none' });
  });
});

describe('keyup 映射', () => {
  it('↑ / W 松开上轨', () => {
    for (const code of ['ArrowUp', 'KeyW']) {
      expect(mapKeyUp(code)).toEqual({ type: 'release', lane: 'top' });
    }
  });

  it('↓ / S 松开下轨', () => {
    for (const code of ['ArrowDown', 'KeyS']) {
      expect(mapKeyUp(code)).toEqual({ type: 'release', lane: 'bottom' });
    }
  });

  it('其他键不产生 release', () => {
    expect(mapKeyUp('KeyP')).toEqual({ type: 'none' });
    expect(mapKeyUp('Enter')).toEqual({ type: 'none' });
  });
});
