import { describe, expect, it } from 'vitest';

import { computeLayout, refitMonsters } from '../layout';
import { holdMonster, normalMonster } from './fixtures';

describe('战场布局', () => {
  it('按 900 × 500 的基准算出判定区几何', () => {
    const layout = computeLayout(900, 500, 1);

    expect(layout.laneY.top).toBeCloseTo(140, 10);
    expect(layout.laneY.bottom).toBeCloseTo(360, 10);
    expect(layout.playerR).toBeCloseTo(46, 10);
    expect(layout.playerX).toBeCloseTo(106.3, 10);
    expect(layout.hitX).toBeCloseTo(345.9, 10);
    expect(layout.hitW).toBeCloseTo(63, 10);
    expect(layout.zoneHalf).toBeCloseTo(58.5, 10);
    expect(layout.critHalf).toBeCloseTo(29.25, 10);
  });

  it('暴击区是判定区中央的一半（判定落在中心区间的概率约 50%）', () => {
    const layout = computeLayout(900, 500, 1);

    expect(layout.critHalf).toBeCloseTo(layout.zoneHalf * 0.5, 10);
  });

  it('修 Bug D2：hitX 由同一个布局里的 playerX 算出，不依赖上一次 resize', () => {
    const first = computeLayout(900, 500, 1);
    const second = computeLayout(900, 500, 1);

    // 旧实现里首次 resize 的 hitX 用的是 playerX = 0，所以两次算出的 hitX 不同。
    // 纯函数化后必须完全一致。
    expect(first.hitX).toBe(second.hitX);
    expect(first.hitX).toBeCloseTo(first.playerX + first.playerR * 2.6 + 120, 10);
  });

  it('窄屏下 hitX 由 playerX 推导（clamp 的下限 150 不会生效）', () => {
    const layout = computeLayout(320, 200, 1);

    // playerR = 23、playerX = 59.15 → 59.15 + 23 * 2.6 + 120 = 238.95
    expect(layout.hitX).toBeCloseTo(238.95, 10);
  });

  it('宽屏下 hitX 退回到 clamp(W * 0.34, 150, 430) 的上限', () => {
    const layout = computeLayout(2560, 1440, 1);

    expect(layout.hitX).toBe(430);
  });

  it('尺寸变化后长按怪重新贴合轨道并改长度', () => {
    const layout = computeLayout(900, 500, 1);
    const long = holdMonster({ x: 100, y: 999, len: 100, w: 100, h: 10 });

    const [refit] = refitMonsters([long], layout);

    if (refit?.kind !== 'hold') throw new Error('应当是长按怪');
    expect(refit.y).toBe(140);
    expect(refit.len).toBe(234);
    expect(refit.w).toBe(234);
    expect(refit.h).toBe(44);
  });

  it('尺寸变化后普通怪重新贴合轨道并改宽高', () => {
    const layout = computeLayout(900, 500, 1);
    const normal = normalMonster({ y: 999, w: 1, h: 1 });

    const [refit] = refitMonsters([normal], layout);

    expect(refit?.y).toBe(140);
    expect(refit?.w).toBe(49.5);
    expect(refit?.h).toBe(78);
  });

  it('refitMonsters 不改传入的数组与怪物', () => {
    const layout = computeLayout(900, 500, 1);
    const normal = normalMonster({ y: 999 });
    const monsters = [normal];

    refitMonsters(monsters, layout);

    expect(monsters[0]?.y).toBe(999);
  });
});
