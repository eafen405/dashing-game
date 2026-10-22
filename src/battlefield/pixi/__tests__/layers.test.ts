/**
 * 图层顺序的契约测试 —— **次 seam**（brief-06 §「已约定的测试 seam」第 3 条）。
 *
 * 图层顺序承担旧 Canvas 2D 版 `draw()` 的绘制顺序（`source.html:1466-1477`），
 * 顺序变了 = 遮挡关系变了 = 视觉回归。
 */

import { describe, expect, it } from 'vitest';

import { LAYER_COUNT, LAYER_ORDER } from '../layers';

describe('战场图层顺序', () => {
  it('自底向上是 background → ground → rails → defense → entities → glow → floaters', () => {
    expect(LAYER_ORDER).toEqual([
      'background',
      'ground',
      'rails',
      'defense',
      'entities',
      'glow',
      'floaters',
    ]);
  });

  it('图层数量与顺序表一致', () => {
    expect(LAYER_COUNT).toBe(LAYER_ORDER.length);
  });

  it('glow 层在 entities 之上、floaters 之下（票 07 在这层挂 bloom）', () => {
    expect(LAYER_ORDER.indexOf('glow')).toBeGreaterThan(LAYER_ORDER.indexOf('entities'));
    expect(LAYER_ORDER.indexOf('glow')).toBeLessThan(LAYER_ORDER.indexOf('floaters'));
  });
});
