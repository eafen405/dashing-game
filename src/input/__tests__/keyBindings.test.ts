/**
 * 电脑端按键绑定 —— 纯函数单测。
 *
 * 重点守住三件事：
 *   1. 默认值仍然是旧版的 ↑/W、↓/S；
 *   2. 脏存储（重复 / 保留键 / 超过 3 个 / 空轨）不会把游戏搞成「按什么都没反应」；
 *   3. 键名标签可读（界面与端到端测试都靠它）。
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_KEY_BINDINGS,
  MAX_KEYS_PER_LANE,
  defaultKeyBindings,
  isBindableKeyCode,
  keyLabel,
  laneForKeyCode,
  sanitizeKeyBindings,
} from '../keyBindings';

describe('按键绑定：默认值', () => {
  it('默认是 ↑ / W 打上轨、↓ / S 打下轨', () => {
    expect(sanitizeKeyBindings(null)).toEqual({
      top: ['ArrowUp', 'KeyW'],
      bottom: ['ArrowDown', 'KeyS'],
    });
    expect(DEFAULT_KEY_BINDINGS).toEqual(sanitizeKeyBindings(undefined));
  });

  it('恢复默认返回的是新数组，不与常量共享引用', () => {
    const fresh = defaultKeyBindings();
    fresh.top.push('KeyQ');
    expect(DEFAULT_KEY_BINDINGS.top).toEqual(['ArrowUp', 'KeyW']);
  });
});

describe('按键绑定：清理脏数据', () => {
  it('过滤保留键、去重、每轨最多 3 个', () => {
    const result = sanitizeKeyBindings({
      top: ['KeyQ', 'KeyQ', 'KeyP', 'KeyE', 'KeyR', 'KeyT'],
      bottom: ['KeyQ', 'KeyZ'],
    });
    expect(result.top).toEqual(['KeyQ', 'KeyE', 'KeyR']);
    expect(result.bottom).toEqual(['KeyZ']);
    expect(result.top).toHaveLength(MAX_KEYS_PER_LANE);
  });

  it('上下轨之间不允许重复：先出现的那条轨拿到键', () => {
    const result = sanitizeKeyBindings({
      top: ['KeyQ'],
      bottom: ['KeyQ', 'KeyZ'],
    });
    expect(result.top).toEqual(['KeyQ']);
    expect(result.bottom).toEqual(['KeyZ']);
  });

  it('空轨会用默认值补一个，避免这一轨完全没键', () => {
    expect(sanitizeKeyBindings({ top: [], bottom: [] })).toEqual({
      top: ['ArrowUp'],
      bottom: ['ArrowDown'],
    });
  });

  it('默认键被另一条轨占用时，空轨换一个空闲键兜底', () => {
    const result = sanitizeKeyBindings({ top: [], bottom: ['ArrowUp', 'ArrowDown', 'KeyW'] });
    expect(result.top).toEqual(['KeyQ']);
    expect(result.bottom).toEqual(['ArrowUp', 'ArrowDown', 'KeyW']);
  });

  it('不是数组 / 不是字符串的项直接忽略', () => {
    const result = sanitizeKeyBindings({
      top: ['KeyQ', 42, null, 'KeyE'],
      bottom: 'KeyZ',
    });
    expect(result.top).toEqual(['KeyQ', 'KeyE']);
    expect(result.bottom).toEqual(['ArrowDown']);
  });
});

describe('按键绑定：查键与标签', () => {
  const bindings = { top: ['KeyQ', 'ArrowUp'], bottom: ['KeyZ'] };

  it('按 code 找到轨道', () => {
    expect(laneForKeyCode('KeyQ', bindings)).toBe('top');
    expect(laneForKeyCode('ArrowUp', bindings)).toBe('top');
    expect(laneForKeyCode('KeyZ', bindings)).toBe('bottom');
    expect(laneForKeyCode('KeyP', bindings)).toBeNull();
  });

  it('保留键与修饰键不能绑定，普通键可以', () => {
    for (const code of ['KeyP', 'Enter', 'Space', 'Escape', 'Tab', 'Backspace']) {
      expect(isBindableKeyCode(code)).toBe(false);
    }
    for (const code of ['ShiftLeft', 'ControlRight', 'CapsLock']) {
      expect(isBindableKeyCode(code)).toBe(false);
    }
    for (const code of ['KeyQ', 'ArrowUp', 'Digit1', 'Numpad5', 'Semicolon']) {
      expect(isBindableKeyCode(code)).toBe(true);
    }
  });

  it('键名标签适合直接显示', () => {
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('ArrowDown')).toBe('↓');
    expect(keyLabel('KeyQ')).toBe('Q');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('Numpad5')).toBe('小键盘 5');
    expect(keyLabel('Semicolon')).toBe(';');
  });
});
