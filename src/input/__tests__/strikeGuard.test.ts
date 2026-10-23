import { describe, expect, it } from 'vitest';

import { INPUT_GUARD, StrikeGuard } from '../strikeGuard';

describe('StrikeGuard', () => {
  it('短时间突发最多放行 burst 次', () => {
    const guard = new StrikeGuard();
    const lanes = ['top', 'bottom', 'top', 'bottom'] as const;

    for (const lane of lanes) expect(guard.allow(0, lane)).toBe(true);
    expect(guard.allow(0, 'top')).toBe(false);
  });

  it('令牌按时间恢复，100Hz 连点 1 秒只放行约 12 次', () => {
    const guard = new StrikeGuard();
    let allowed = 0;

    for (let i = 0; i < 100; i += 1) {
      if (guard.allow(i * 0.01, 'top')) allowed += 1;
    }

    // 初始 4 个 + 约 1 秒按 8/s 恢复的 8 个（时间窗口边界允许差 1）。
    expect(allowed).toBeGreaterThanOrEqual(11);
    expect(allowed).toBeLessThanOrEqual(12);
  });

  it('同轨重复按下至少间隔 sameLaneLock 秒', () => {
    const guard = new StrikeGuard();
    guard.record(0, 'top', 'hit');

    expect(guard.allow(INPUT_GUARD.sameLaneLock - 0.001, 'top')).toBe(false);
    expect(guard.allow(INPUT_GUARD.sameLaneLock, 'top')).toBe(true);

    guard.record(INPUT_GUARD.sameLaneLock, 'top', 'hit');
    expect(guard.allow(INPUT_GUARD.sameLaneLock + 0.01, 'top')).toBe(false);
  });

  it('换轨不受同轨锁限制', () => {
    const guard = new StrikeGuard();
    guard.record(0, 'top', 'hit');

    expect(guard.allow(0.01, 'bottom')).toBe(true);
  });

  it('双生 0.18 秒窗口内两轨各一次仍然放行', () => {
    const guard = new StrikeGuard();
    guard.record(0, 'top', 'hit');

    expect(guard.allow(0.05, 'bottom')).toBe(true);
    guard.record(0.05, 'bottom', 'hit');

    expect(guard.allow(0.1, 'bottom')).toBe(false); // 同轨锁，但双生已经不需要第三刀
  });

  it('第一次空挥不罚，窗口内第二次空挥触发硬直', () => {
    const guard = new StrikeGuard();
    expect(guard.record(0, 'top', 'whiff')).toBe(false);
    expect(guard.allow(0.1, 'bottom')).toBe(true);

    expect(guard.record(0.1, 'bottom', 'whiff')).toBe(true);
    expect(guard.allow(0.2, 'top')).toBe(false);
    expect(guard.allow(0.1 + INPUT_GUARD.whiffLock, 'top')).toBe(true);
  });

  it('命中会打断空挥连击', () => {
    const guard = new StrikeGuard();
    guard.record(0, 'top', 'whiff');
    guard.record(0.1, 'bottom', 'hit');
    guard.record(0.2, 'top', 'whiff');

    expect(guard.allow(0.21, 'bottom')).toBe(true);
  });

  it('neutral 不参与同轨锁和空挥链', () => {
    const guard = new StrikeGuard();
    guard.record(0, 'top', 'neutral');

    expect(guard.allow(0.01, 'top')).toBe(true);
  });

  it('reset 清空令牌与锁定状态', () => {
    const guard = new StrikeGuard();
    for (const lane of ['top', 'bottom', 'top', 'bottom'] as const) {
      expect(guard.allow(0, lane)).toBe(true);
    }
    guard.record(0, 'top', 'whiff');
    guard.record(0.1, 'bottom', 'whiff');

    guard.reset();

    expect(guard.allow(0, 'top')).toBe(true);
  });
});
