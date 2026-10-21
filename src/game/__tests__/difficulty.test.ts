import { describe, expect, it } from 'vitest';

import { difficultyAt, spawnInterval, speedNow } from '../rules/difficulty';
import { recordingRng } from './fixtures';

describe('刷新节奏', () => {
  it('难度系数由游戏时间推导，30 秒后封顶 10', () => {
    expect(difficultyAt(0)).toBe(0);
    expect(difficultyAt(100)).toBe(7.5);
    expect(difficultyAt(1000)).toBe(10);
  });

  it('spawnInterval 落在钳制区间内，并按难度星级缩放', () => {
    const one = spawnInterval(0, 1, recordingRng([0.5]));
    const two = spawnInterval(0, 2, recordingRng([0.5]));

    // 1.28 + rand(-0.12, 0.16)，rand 取中值 0.02 → 1.30
    expect(one).toBeCloseTo(1.3, 10);
    // 2 星：刷新频率翻倍（间隔减半）
    expect(two).toBeCloseTo(0.65, 10);
  });

  it('spawnInterval 随难度上升而缩短', () => {
    const early = spawnInterval(0, 1, recordingRng([0.5]));
    const late = spawnInterval(10, 1, recordingRng([0.5]));

    expect(late).toBeLessThan(early);
    expect(late).toBeCloseTo(0.85, 10);
  });

  it('spawnInterval 只消耗一次随机数', () => {
    const rng = recordingRng([0.5]);

    spawnInterval(0, 1, rng);

    expect(rng.calls).toEqual(['range(-0.12,0.16)']);
  });

  it('speedNow 随时间平滑升速并收敛到上限', () => {
    expect(speedNow(0, 1)).toBeCloseTo(165, 10);
    expect(speedNow(37.5, 1)).toBeCloseTo(232.5, 10);
    expect(speedNow(75, 1)).toBeCloseTo(300, 10);
    // 到达上限后不再增加
    expect(speedNow(1000, 1)).toBeCloseTo(300, 10);
  });

  it('speedNow 按难度星级乘以移速倍率', () => {
    expect(speedNow(0, 2)).toBeCloseTo(247.5, 10);
    expect(speedNow(75, 2)).toBeCloseTo(450, 10);
  });

  it('speedNow 不消耗随机数', () => {
    const rng = recordingRng();

    speedNow(10, 1);

    expect(rng.calls).toEqual([]);
  });
});
