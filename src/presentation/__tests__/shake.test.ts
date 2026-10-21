/**
 * 屏幕震动的契约测试。
 *
 * 衰减公式来自旧实现（`source.html:1389-1390` / `1410-1411`），逐字对齐。
 *
 * 票 07 把「全压在一个上限 17 的值上」改成**三档强度**
 * （普攻 / 暴击 / 双生同破）—— 这里断言三档递增、档位映射与封顶语义。
 */

import { describe, expect, it } from 'vitest';

import { SHAKE_CAPS, SHAKE_TIERS, shakeTierOf, type ShakeTier } from '../fx';
import { ShakeState } from '../shake';

describe('屏幕震动 · 三档强度', () => {
  it('三档严格递增，且间隔明确', () => {
    expect(SHAKE_TIERS.normal).toBeLessThan(SHAKE_TIERS.crit);
    expect(SHAKE_TIERS.crit).toBeLessThan(SHAKE_TIERS.twin);
    // 等间隔（6 → 12 → 18）—— 视觉上「轻 / 中 / 重」分得开
    expect(SHAKE_TIERS.crit - SHAKE_TIERS.normal).toBe(6);
    expect(SHAKE_TIERS.twin - SHAKE_TIERS.crit).toBe(6);
  });

  it('规则层的震动幅度映射到三档', () => {
    // 普攻（5 / FEVER 7 / 长按失败 8）
    expect(shakeTierOf(5)).toBe('normal');
    expect(shakeTierOf(7)).toBe('normal');
    expect(shakeTierOf(8)).toBe('normal');
    // 暴击（11）/ 长按完成（12）
    expect(shakeTierOf(11)).toBe('crit');
    expect(shakeTierOf(12)).toBe('crit');
    // 双生同破（13 / 16）/ 单破自爆（13）/ 角色受击（14）
    expect(shakeTierOf(13)).toBe('twin');
    expect(shakeTierOf(14)).toBe('twin');
    expect(shakeTierOf(16)).toBe('twin');
  });

  it('映射是单调的：幅度越大档位越高', () => {
    const order: ShakeTier[] = ['normal', 'crit', 'twin'];
    let last = -1;
    for (const amount of [1, 5, 8, 11, 12, 13, 16, 99]) {
      const rank = order.indexOf(shakeTierOf(amount));
      expect(rank).toBeGreaterThanOrEqual(last);
      last = rank;
    }
  });
});

describe('屏幕震动 · 状态', () => {
  it('shake-add 是「加上去并封顶」', () => {
    const shake = new ShakeState();

    shake.add('normal');

    expect(shake.value).toBe(SHAKE_TIERS.normal);
  });

  it('shake-add 不会突破本档上限', () => {
    const shake = new ShakeState();

    shake.add('normal');
    shake.add('normal');
    shake.add('normal');

    expect(shake.value).toBe(SHAKE_CAPS.normal);
  });

  it('强档落下后弱档不会把画面拉回更轻的抖动', () => {
    const shake = new ShakeState();

    shake.add('twin');
    expect(shake.value).toBe(SHAKE_TIERS.twin);

    shake.add('normal');

    expect(shake.value).toBe(SHAKE_TIERS.twin);
  });

  it('shake-max 只在更大时才抬升', () => {
    const shake = new ShakeState();

    shake.raiseTo('crit');
    expect(shake.value).toBe(SHAKE_TIERS.crit);

    shake.raiseTo('normal');
    expect(shake.value).toBe(SHAKE_TIERS.crit);

    shake.raiseTo('twin');
    expect(shake.value).toBe(SHAKE_TIERS.twin);
  });

  it('shake-set 是直接赋值', () => {
    const shake = new ShakeState();

    shake.set('crit');

    expect(shake.value).toBe(SHAKE_TIERS.crit);
  });

  it('衰减公式逐字照抄旧实现：shake *= 0.001^dt，低于 0.2 归零', () => {
    const shake = new ShakeState();
    shake.add('twin');

    const before = shake.value;
    shake.decay(0.5);

    // before * 0.001^0.5 —— 仍高于 0.2，不归零
    expect(shake.value).toBeCloseTo(before * Math.pow(0.001, 0.5), 10);
    expect(shake.value).toBeGreaterThan(0.2);
  });

  it('低于 0.2 的震动直接归零', () => {
    const shake = new ShakeState();
    shake.add('normal');
    // 手动压到阈值以下
    shake.value = 0.19;

    shake.decay(0.016);

    expect(shake.value).toBe(0);
  });

  it('一秒之内的震动被衰减到阈值以下并归零', () => {
    const shake = new ShakeState();
    shake.set('twin');

    shake.decay(1);

    expect(shake.value).toBe(0);
  });
});
