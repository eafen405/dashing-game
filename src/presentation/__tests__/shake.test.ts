/**
 * 屏幕震动的契约测试。
 *
 * 三种事件语义（`src/game/effects.ts`）与衰减公式都来自旧实现
 * （`source.html:1389-1390` / `1410-1411`），逐字对齐。
 */

import { describe, expect, it } from 'vitest';

import { ShakeState } from '../shake';

describe('屏幕震动', () => {
  it('shake-add 是「加上去并封顶」', () => {
    const shake = new ShakeState();

    shake.add(5, 17);

    expect(shake.value).toBe(5);
  });

  it('shake-add 不会突破上限', () => {
    const shake = new ShakeState();

    shake.add(5, 17);
    shake.add(5, 17);
    shake.add(5, 17);

    expect(shake.value).toBe(15);
    shake.add(50, 17);
    expect(shake.value).toBe(17);
  });

  it('shake-max 只在更大时才抬升', () => {
    const shake = new ShakeState();

    shake.raiseTo(9);
    expect(shake.value).toBe(9);

    shake.raiseTo(3);
    expect(shake.value).toBe(9);
  });

  it('shake-set 是直接赋值', () => {
    const shake = new ShakeState();

    shake.set(14);

    expect(shake.value).toBe(14);
  });

  it('衰减公式逐字照抄旧实现：shake *= 0.001^dt，低于 0.2 归零', () => {
    const shake = new ShakeState();
    shake.set(1000);

    shake.decay(0.5);

    // 1000 * 0.001^0.5 = 31.6 —— 仍高于 0.2，不归零
    expect(shake.value).toBeCloseTo(1000 * Math.pow(0.001, 0.5), 10);
    expect(shake.value).toBeGreaterThan(0.2);
  });

  it('低于 0.2 的震动直接归零', () => {
    const shake = new ShakeState();
    shake.set(0.19);

    shake.decay(0.016);

    expect(shake.value).toBe(0);
  });

  it('一秒之内的震动被衰减到阈值以下并归零', () => {
    const shake = new ShakeState();
    shake.set(14);

    shake.decay(1);

    expect(shake.value).toBe(0);
  });
});
