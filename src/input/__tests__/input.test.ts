/**
 * 输入映射 —— 纯函数，不需要 DOM。
 */

import { describe, expect, it } from 'vitest';

import { keyActionFor, releaseInputFor } from '../keyboard';
import { isPrimaryPointer, laneFromClientY, pointerInputId } from '../pointer';

describe('pointer', () => {
  it('上半屏 → 上轨，下半屏 → 下轨，越界 → null', () => {
    const rect = { top: 100, height: 400 };
    expect(laneFromClientY(120, rect)).toBe('top');
    expect(laneFromClientY(299.9, rect)).toBe('top');
    expect(laneFromClientY(300, rect)).toBe('bottom');
    expect(laneFromClientY(499.9, rect)).toBe('bottom');
    expect(laneFromClientY(520, rect)).toBeNull();
    expect(laneFromClientY(50, rect)).toBeNull();
    expect(laneFromClientY(600, rect)).toBeNull();
    expect(laneFromClientY(120, { top: 0, height: 0 })).toBeNull();
  });

  it('inputId 与旧实现一致（"p" + pointerId）', () => {
    expect(pointerInputId({ clientY: 0, pointerId: 7 })).toBe('p7');
  });

  it('鼠标只认左键，触摸 / 笔始终可点', () => {
    expect(isPrimaryPointer({ clientY: 0, pointerId: 1, pointerType: 'mouse', button: 0 })).toBe(
      true,
    );
    expect(isPrimaryPointer({ clientY: 0, pointerId: 1, pointerType: 'mouse', button: 2 })).toBe(
      false,
    );
    expect(isPrimaryPointer({ clientY: 0, pointerId: 1, pointerType: 'touch' })).toBe(true);
  });
});

describe('keyboard', () => {
  it('上下键 / W S 映射到两条轨道与固定的 inputId', () => {
    expect(keyActionFor('ArrowUp')).toEqual({ type: 'press', lane: 'top', inputId: 'key-top' });
    expect(keyActionFor('KeyW')).toEqual({ type: 'press', lane: 'top', inputId: 'key-top' });
    expect(keyActionFor('ArrowDown')).toEqual({
      type: 'press',
      lane: 'bottom',
      inputId: 'key-bottom',
    });
    expect(keyActionFor('KeyS')).toEqual({ type: 'press', lane: 'bottom', inputId: 'key-bottom' });
  });

  it('P 切换暂停，Enter / Space 确认', () => {
    expect(keyActionFor('KeyP')).toEqual({ type: 'toggle-pause' });
    expect(keyActionFor('Enter')).toEqual({ type: 'confirm' });
    expect(keyActionFor('Space')).toEqual({ type: 'confirm' });
    expect(keyActionFor('KeyA')).toBeNull();
  });

  it('松开只释放对应轨道的长按', () => {
    expect(releaseInputFor('ArrowUp')).toBe('key-top');
    expect(releaseInputFor('KeyS')).toBe('key-bottom');
    expect(releaseInputFor('Enter')).toBeNull();
  });
});
