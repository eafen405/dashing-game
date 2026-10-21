/**
 * 随机数消费顺序 —— 保真的命门（`legacy-semantics.md` §9）。
 *
 * 规则层所有随机性都走注入的 PRNG。**消费顺序**必须与旧实现逐字一致：
 * 少一次、多一次、换个位置，整条 golden trace 就废了。
 *
 * 本文件从两个角度锁住它：
 *   1. `recordingRng` 记录每次消耗点，断言**顺序**（哪些函数先抽、抽几次）
 *   2. 旧实现原样摘录作为**对照基准**（characterization oracle），
 *      在整个输入空间上逐点比对 —— 采样点的断言之外，漂移也会被抓到
 */

import { describe, expect, it } from 'vitest';

import { DIFFS } from '../constants';
import { computeLayout } from '../layout';
import { createRng, type Rng } from '../rng';
import { spawnInterval, speedNow } from '../rules/difficulty';
import { tick } from '../rules/tick';
import { makeState, recordingRng } from './fixtures';

/* ------------------------------------------------------------------ *
 * 旧实现原样摘录 —— 对照基准
 * ------------------------------------------------------------------ */

/** `source.html:493` —— `function rand(a,b){ return a + Math.random()*(b-a); }` */
function legacyRand(a: number, b: number, rng: Rng): number {
  return a + rng.next() * (b - a);
}

/** `source.html:494` */
function legacyClamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** `source.html:733-738` */
function legacySpawnInterval(difficulty: number, diffLevel: 1 | 2, rng: Rng): number {
  const base = 1.28 - difficulty * 0.045;
  const raw = legacyClamp(base + legacyRand(-0.12, 0.16, rng), 0.62, 1.45);
  return raw / DIFFS[diffLevel].spawnMul;
}

/** `source.html:740-746` */
function legacySpeedNow(now: number, diffLevel: 1 | 2): number {
  const t = legacyClamp(now / 75, 0, 1);
  const k = t * t * (3 - 2 * t);
  const mul = DIFFS[diffLevel].speedMul;
  return (165 + (300 - 165) * k) * mul;
}

/** `source.html:551-560` —— 几何计算（已按 D2 修正顺序：playerX 先算）。 */
function legacyLayout(width: number, height: number) {
  const laneY = { top: height * 0.28, bottom: height * 0.72 };
  const playerR = legacyClamp(height * 0.115, 22, 46);
  const playerX = Math.max(legacyClamp(width * 0.085, 48, 120), playerR * 2.05 + 12);
  const hitW = legacyClamp(width * 0.07, 58, 100);
  const zoneHalf = hitW * 0.5 + legacyClamp(width * 0.03, 16, 44);
  const critHalf = zoneHalf * 0.5;
  return { laneY, playerR, playerX, hitW, zoneHalf, critHalf };
}

/* ------------------------------------------------------------------ *
 * 对照测试
 * ------------------------------------------------------------------ */

describe('与旧实现逐点对照', () => {
  it('spawnInterval 在整个输入空间上与旧实现一致', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const difficulty of [0, 1.5, 7.5, 10]) {
        for (const diffLevel of [1, 2] as const) {
          const actual = spawnInterval(difficulty, diffLevel, createRng(seed));
          const expected = legacySpawnInterval(difficulty, diffLevel, createRng(seed));

          expect(actual).toBe(expected);
        }
      }
    }
  });

  it('speedNow 在整个输入空间上与旧实现一致', () => {
    for (let now = 0; now <= 200; now += 0.5) {
      for (const diffLevel of [1, 2] as const) {
        expect(speedNow(now, diffLevel)).toBe(legacySpeedNow(now, diffLevel));
      }
    }
  });

  it('布局中未改动的几何（轨道 / 角色 / 判定框宽度）与旧实现一致', () => {
    for (const [width, height] of [
      [320, 200],
      [900, 500],
      [1280, 720],
      [2560, 1440],
    ] as const) {
      const actual = computeLayout(width, height, 1);
      const expected = legacyLayout(width, height);

      expect(actual.laneY.top).toBe(expected.laneY.top);
      expect(actual.laneY.bottom).toBe(expected.laneY.bottom);
      expect(actual.playerR).toBe(expected.playerR);
      expect(actual.playerX).toBe(expected.playerX);
      expect(actual.hitW).toBe(expected.hitW);
      expect(actual.zoneHalf).toBe(expected.zoneHalf);
      expect(actual.critHalf).toBe(expected.critHalf);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 消费顺序
 * ------------------------------------------------------------------ */

describe('PRNG 消费顺序', () => {
  it('生成一只普通怪消耗 5 次，顺序固定', () => {
    const rng = recordingRng([0.1, 0.5, 0.5, 0.5, 0.5]);

    tick(makeState({ spawnTimer: 0.01, now: 0 }), 1 / 60, rng);

    // 首个消耗来自生成：选轨 → 速度系数 → y 抖动 → 相位 → 浮动
    expect(rng.calls[0]).toBe('next');
    expect(rng.calls[1]).toBe('range(0.97,1.03)');
    expect(rng.calls[2]).toBe('range(-6,6)');
    expect(rng.calls[3]).toMatch(/^range\(0,/);
    expect(rng.calls[4]).toBe('range(0.8,1.6)');
    // 然后才是刷新间隔
    expect(rng.calls[5]).toBe('range(-0.12,0.16)');
    expect(rng.calls).toHaveLength(6);
  });

  it('生成一只长按怪消耗 5 次：clearLane 选轨 → 28% 判定 → 相位 → 冷却 → 刷新间隔', () => {
    const rng = recordingRng([0.1, 0.1, 0.5, 0.5, 0.5]);

    tick(makeState({ spawnTimer: 0.01, now: 9, longCooldown: 0 }), 1 / 60, rng);

    expect(rng.calls[0]).toBe('next');
    expect(rng.calls[1]).toBe('next');
    expect(rng.calls[2]).toMatch(/^range\(0,/);
    expect(rng.calls[3]).toBe('range(14,18)');
    expect(rng.calls[4]).toBe('range(-0.12,0.16)');
    expect(rng.calls).toHaveLength(5);
  });

  it('没有触发生成时一帧不消耗随机数', () => {
    const rng = recordingRng();

    tick(makeState({ spawnTimer: 10 }), 1 / 60, rng);

    expect(rng.calls).toEqual([]);
  });

  it('同一种子跑出同一串随机数，整局可复现', () => {
    const run = (): string[] => {
      const rng = recordingRng();
      tick(makeState({ spawnTimer: 0.01, now: 0 }), 1 / 60, rng);
      return rng.calls;
    };

    expect(run()).toEqual(run());
  });
});
