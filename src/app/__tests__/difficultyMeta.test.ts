/**
 * 难度星级的显示元数据 —— 单测。
 *
 * 重点守住两件事：
 *   1. **两条轴的归一化**：最满的那条 = 天花板（密度 ×3 / 移速 ×2）。
 *   2. **非单调关系**：3★ 的密度比 4★ 高，但移速比 4★ 低 ——
 *      这正是要用两条轴画出来的原因，测出来钉死，免得以后调 `DIFFS` 时静默失真。
 */

import { describe, expect, it } from 'vitest';

import { DIFFS } from '../../game/constants';
import type { Difficulty } from '../../game/types';
import { DIFFICULTIES, difficultyMeta, stepDifficulty } from '../difficultyMeta';

describe('难度显示元数据', () => {
  it('四档齐全，且按星级升序', () => {
    expect(DIFFICULTIES).toEqual([1, 2, 3, 4]);
  });

  it('密度轴：最密的一档是满格', () => {
    const densities = DIFFICULTIES.map((d) => difficultyMeta(d).density);
    expect(Math.max(...densities)).toBe(1);
    expect(difficultyMeta(3).density).toBe(1); // 3★ 密度 ×3 = 天花板
    expect(difficultyMeta(1).density).toBeCloseTo(1 / 3);
    expect(difficultyMeta(2).density).toBeCloseTo(2 / 3);
    expect(difficultyMeta(4).density).toBeCloseTo(2.5 / 3);
  });

  it('移速轴：最快的一档是满格', () => {
    const speeds = DIFFICULTIES.map((d) => difficultyMeta(d).speed);
    expect(Math.max(...speeds)).toBe(1);
    expect(difficultyMeta(4).speed).toBe(1); // 4★ 移速 ×2 = 天花板
    expect(difficultyMeta(1).speed).toBeCloseTo(0.5);
    expect(difficultyMeta(2).speed).toBeCloseTo(0.75);
    expect(difficultyMeta(3).speed).toBeCloseTo(0.5);
  });

  it('两条轴如实反映 DIFFS（不是手抄的常量）', () => {
    for (const d of DIFFICULTIES) {
      const meta = difficultyMeta(d);
      expect(meta.density).toBeCloseTo(DIFFS[d].spawnMul / 3);
      expect(meta.speed).toBeCloseTo(DIFFS[d].speedMul / 2);
    }
  });

  it('非单调：3★ 比 4★ 密，但比 4★ 慢', () => {
    const three = difficultyMeta(3);
    const four = difficultyMeta(4);
    expect(three.density).toBeGreaterThan(four.density);
    expect(three.speed).toBeLessThan(four.speed);
  });

  it('星级字样与档位一致', () => {
    for (const d of DIFFICULTIES) {
      expect(difficultyMeta(d).stars).toBe('★'.repeat(d));
    }
  });

  it('每档都有名字和说明', () => {
    for (const d of DIFFICULTIES) {
      const meta = difficultyMeta(d);
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.note.length).toBeGreaterThan(0);
    }
  });
});

describe('上下移动一档（环形）', () => {
  it('往下走', () => {
    expect(stepDifficulty(1, 1)).toBe(2);
    expect(stepDifficulty(3, 1)).toBe(4);
  });

  it('往上走', () => {
    expect(stepDifficulty(4, -1)).toBe(3);
    expect(stepDifficulty(2, -1)).toBe(1);
  });

  it('到头回绕', () => {
    expect(stepDifficulty(4, 1)).toBe(1);
    expect(stepDifficulty(1, -1)).toBe(4);
  });

  it('不动就是不动', () => {
    const d: Difficulty = 2;
    expect(stepDifficulty(d, 0 as -1 | 1)).toBe(2);
  });
});
