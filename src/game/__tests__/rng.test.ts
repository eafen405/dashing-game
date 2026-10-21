import { describe, expect, it } from 'vitest';

import { createRng } from '../rng';

describe('种子 PRNG', () => {
  it('同一个种子产出同一串随机数（整局可复现的前提）', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());

    expect(seqA).toEqual(seqB);
  });

  it('不同种子产出不同随机数', () => {
    const a = createRng(1);
    const b = createRng(2);

    expect(a.next()).not.toBe(b.next());
  });

  it('next() 落在 [0, 1) 区间内', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range(min, max) 等价于旧实现的 rand(a, b) = a + u * (b - a)', () => {
    const viaRange = createRng(99);
    const viaNext = createRng(99);
    const u = viaNext.next();

    // 「先乘后加」：同一个 u 必须给出同一个结果
    expect(viaRange.range(10, 20)).toBe(10 + u * (20 - 10));
  });

  it('range(min, max) 只消耗一次随机数', () => {
    const viaRange = createRng(99);
    const viaNext = createRng(99);

    expect(viaRange.range(10, 20)).toBe(10 + viaNext.next() * (20 - 10));
    // 之后的抽样序列必须完全一致 —— 证明 range 没有多消耗也没有少消耗
    expect(viaRange.next()).toBe(viaNext.next());
    expect(viaRange.next()).toBe(viaNext.next());
  });

  it('range(min, max) 落在 [min, max) 区间内', () => {
    const rng = createRng(2024);
    for (let i = 0; i < 500; i++) {
      const v = rng.range(-6, 6);
      expect(v).toBeGreaterThanOrEqual(-6);
      expect(v).toBeLessThan(6);
    }
  });
});
