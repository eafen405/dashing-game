/**
 * 自适应分辨率的契约测试。
 *
 * 这里锁的是「手感优先」的策略本身：
 * - 连续掉帧 → 逐档降分辨率；
 * - 稳定满帧 → 逐档升回；
 * - 切后台的长间隔不能把画质永久降掉；
 * - 降到最低档后不再继续降；
 * - 降过档之后，升档需要更长的「连续好窗口」（防抖动）。
 */

import { describe, expect, it } from 'vitest';

import { AdaptiveResolution, resolutionSteps } from '../adaptive-resolution';

/** 采样一帧：返回 governor 给出的新分辨率（没变则是 null）。 */
function feed(
  governor: AdaptiveResolution,
  intervalMs: number,
  frames: number,
  canUpgrade = true,
): (number | null)[] {
  const changes: (number | null)[] = [];
  for (let i = 0; i < frames; i++) changes.push(governor.observe(intervalMs, canUpgrade));
  return changes;
}

/** 连续喂 `windows` 个完整窗口。 */
function windows(
  governor: AdaptiveResolution,
  intervalMs: number,
  count: number,
  canUpgrade = true,
): (number | null)[] {
  return feed(governor, intervalMs, Math.ceil(count) * 10, canUpgrade);
}

describe('resolutionSteps', () => {
  it('DPR 2 生成 2 / 1.75 / 1.5 / 1.25 四档', () => {
    expect(resolutionSteps(2)).toEqual([2, 1.75, 1.5, 1.25]);
  });

  it('DPR 1.5 最低只到 1.13，避免糊得看不清', () => {
    expect(resolutionSteps(1.5)).toEqual([1.5, 1.31, 1.13]);
  });

  it('DPR 1 不高清屏不降档（只有一个档位）', () => {
    expect(resolutionSteps(1)).toEqual([1]);
  });
});

describe('AdaptiveResolution', () => {
  const steps = [2, 1.75, 1.5, 1.25] as const;

  it('从最高档开始，第一帧不判定', () => {
    const g = new AdaptiveResolution(steps, { windowFrames: 10, settleFrames: 2 });
    expect(g.resolution).toBe(2);
    expect(g.observe(99)).toBeNull();
  });

  it('一个慢窗口降一档，最低档不再降', () => {
    const g = new AdaptiveResolution(steps, {
      windowFrames: 10,
      settleFrames: 0,
      upWindows: 2,
    });
    expect(windows(g, 25, 1).some((v) => v === 1.75)).toBe(true);
    expect(windows(g, 25, 1).some((v) => v === 1.5)).toBe(true);
    expect(windows(g, 25, 1).some((v) => v === 1.25)).toBe(true);
    const changes = windows(g, 25, 3);
    expect(changes.every((v) => v === null)).toBe(true);
    expect(g.resolution).toBe(1.25);
  });

  it('稳定满帧后升档，快窗口数够才升', () => {
    const g = new AdaptiveResolution(steps, {
      windowFrames: 10,
      settleFrames: 0,
      upWindows: 2,
    });
    windows(g, 25, 1); // 2 → 1.75
    expect(g.resolution).toBe(1.75);
    expect(g.requiredGoodWindows).toBe(2);

    const first = windows(g, 16.7, 1);
    expect(first.every((v) => v === null)).toBe(true);
    const second = windows(g, 16.7, 1);
    expect(second).toContain(2);
    expect(g.resolution).toBe(2);
  });

  it('升档后立刻掉帧 → 记为失败，下次升档门槛提高', () => {
    const g = new AdaptiveResolution(steps, {
      windowFrames: 10,
      settleFrames: 0,
      upWindows: 2,
    });
    windows(g, 25, 1); // 2 → 1.75
    windows(g, 16.7, 2); // 连续两个好窗口 → 升回 2
    expect(g.resolution).toBe(2);

    windows(g, 25, 1); // 升上去立刻掉帧 → 降回 1.75，记一次失败
    expect(g.resolution).toBe(1.75);
    expect(g.requiredGoodWindows).toBe(6); // 2 + 4

    expect(windows(g, 16.7, 5).every((v) => v === null)).toBe(true);
    expect(windows(g, 16.7, 1)).toContain(2);
  });

  it('中等帧率（53fps 左右）既不降也不累计升档', () => {
    const g = new AdaptiveResolution(steps, {
      windowFrames: 10,
      settleFrames: 0,
      upWindows: 1,
    });
    windows(g, 25, 1); // 降一档
    const changes = windows(g, 18.0, 10); // 18.0ms 落在 upMs..downMs 之间
    expect(changes.every((v) => v === null)).toBe(true);
    expect(g.resolution).toBe(1.75);
  });

  it('轻度慢窗口要连续两个才降档，单次卡顿不降', () => {
    const g = new AdaptiveResolution(steps, {
      windowFrames: 10,
      settleFrames: 0,
      upWindows: 2,
    });
    // 18.6ms ≈ 53.8fps：只慢一点点 → 第一个窗口不动分辨率。
    expect(windows(g, 18.6, 1).every((v) => v === null)).toBe(true);
    expect(g.resolution).toBe(2);

    // 中间恢复满帧 → 慢窗口计数清零，再来一次慢窗口仍然不降。
    expect(windows(g, 16.7, 1).every((v) => v === null)).toBe(true);
    expect(windows(g, 18.6, 1).every((v) => v === null)).toBe(true);
    expect(g.resolution).toBe(2);

    // 连续两个慢窗口 → 降一档。
    expect(windows(g, 18.6, 1)).toContain(1.75);
    expect(g.resolution).toBe(1.75);
  });

  it('严重掉帧（≤50fps）不等第二个窗口，立刻降档', () => {
    const g = new AdaptiveResolution(steps, {
      windowFrames: 10,
      settleFrames: 0,
    });
    // 20.0ms = 50fps，正好达到 severeMs。
    expect(windows(g, 20, 1)).toContain(1.75);
    expect(g.resolution).toBe(1.75);
  });

  it('切后台回来（超长间隔）作废当前窗口，不会误降档', () => {
    const g = new AdaptiveResolution(steps, { windowFrames: 10, settleFrames: 0 });
    // 先喂 9 个正常帧（差 1 帧就凑满一个窗口）。
    feed(g, 16.7, 9);
    // 切后台 5 秒再回来：这个间隔不能算进窗口。
    g.observe(5000);
    // 若窗口没被作废，这 9 帧 + 5000ms 会凑成一个「平均 500ms」的慢窗口 → 降档。
    expect(feed(g, 16.7, 9).every((v) => v === null)).toBe(true);
    expect(g.resolution).toBe(2);
    // 第 10 个正常帧才凑满新窗口，且平均帧率正常 → 仍然不降。
    expect(feed(g, 16.7, 1).every((v) => v === null)).toBe(true);
    expect(g.resolution).toBe(2);
  });

  it('变档后先跳过 settleFrames 帧', () => {
    const g = new AdaptiveResolution(steps, {
      windowFrames: 10,
      settleFrames: 5,
      upWindows: 1,
    });
    windows(g, 25, 1); // 降一档
    expect(g.resolution).toBe(1.75);
    // 紧接着的 5 帧不参与判定（即使很慢也不会继续降）。
    const changes = feed(g, 40, 5);
    expect(changes.every((v) => v === null)).toBe(true);
    expect(g.resolution).toBe(1.75);
  });

  it('重负载状态（canUpgrade=false）只降不升', () => {
    const g = new AdaptiveResolution(steps, {
      windowFrames: 10,
      settleFrames: 0,
      upWindows: 1,
    });
    windows(g, 25, 1); // 2 → 1.75
    // 即使帧率完美，重负载状态也不试探升档。
    expect(windows(g, 16.7, 6, false).every((v) => v === null)).toBe(true);
    expect(g.resolution).toBe(1.75);
    // 允许升档后，一个窗口就能升回去。
    expect(windows(g, 16.7, 1)).toContain(2);
    // 重负载下遇到慢窗口仍然会降档。
    expect(windows(g, 25, 1, false)).toContain(1.75);
    expect(g.resolution).toBe(1.75);
  });

  it('连续 3 次升档失败后不再试探', () => {
    const g = new AdaptiveResolution(steps, {
      windowFrames: 10,
      settleFrames: 0,
      upWindows: 1,
    });
    windows(g, 25, 1); // 2 → 1.75
    for (let i = 0; i < 3; i++) {
      // 攒够当前门槛的好窗口 → 升档
      windows(g, 16.7, g.requiredGoodWindows);
      expect(g.resolution).toBe(2);
      // 升上去立刻掉帧 → 降回并记一次失败
      windows(g, 25, 1);
      expect(g.resolution).toBe(1.75);
    }
    // 试满 3 次后，再怎么满帧也不再升档。
    expect(windows(g, 16.7, 40).every((v) => v === null)).toBe(true);
    expect(g.resolution).toBe(1.75);
  });

  it('拒绝空档位', () => {
    expect(() => new AdaptiveResolution([])).toThrow();
  });
});
