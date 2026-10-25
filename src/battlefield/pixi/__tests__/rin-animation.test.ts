import { describe, expect, it } from 'vitest';
import {
  RIN_ATTACK_FRAMES,
  RIN_BURN_FRAMES,
  RIN_IDLE_FRAMES,
  RIN_RIDE_FRAMES,
  RinFrameSample,
} from '../rin-animation';

describe('凛的原画帧过渡', () => {
  it('呼吸往返只用站姿，不混入已开始挥镰的 idle-4', () => {
    expect(RIN_IDLE_FRAMES).toEqual([0, 1, 2, 3, 2, 1]);
    const sample = new RinFrameSample();
    sample.sample(RIN_IDLE_FRAMES, 5.5, true);
    expect([sample.from, sample.to, sample.mix]).toEqual([1, 0, 0.5]);
    sample.sample(RIN_IDLE_FRAMES, 6, true);
    expect([sample.from, sample.to, sample.mix]).toEqual([0, 1, 0]);
  });

  it('骑乘保留九帧和原周期，帧内也持续变化', () => {
    const sample = new RinFrameSample();
    sample.sample(RIN_RIDE_FRAMES, 2.25, true);
    const early = sample.mix;
    sample.sample(RIN_RIDE_FRAMES, 2.5, true);
    expect(sample.from).toBe(2);
    expect(sample.to).toBe(3);
    expect(sample.mix).toBeGreaterThan(early);
    expect(sample.mix).toBe(0.5);
    sample.sample(RIN_RIDE_FRAMES, 9, true);
    expect(sample.from).toBe(0);
  });

  it('出招大部分时间保持清晰原画，只在帧末混合', () => {
    const sample = new RinFrameSample();
    sample.sample(RIN_ATTACK_FRAMES, 6.5, false, 0.35);
    expect(sample.from).toBe(6);
    expect(sample.mix).toBe(0);
    sample.sample(RIN_ATTACK_FRAMES, 6.825, false, 0.35);
    expect(sample.to).toBe(7);
    expect(sample.mix).toBeCloseTo(0.5);
  });

  it('普通与燃魂出招结束停在收势，不闪回起手', () => {
    const sample = new RinFrameSample();
    for (const sequence of [RIN_ATTACK_FRAMES, RIN_BURN_FRAMES]) {
      sample.sample(sequence, 100, false);
      expect([sample.from, sample.to, sample.mix]).toEqual([11, 11, 0]);
    }
  });

  it('长按使用完整出招顺序，循环回起手而非从收势倒跳至劈下', () => {
    const sample = new RinFrameSample();
    sample.sample(RIN_ATTACK_FRAMES, 11.8, true, 0.35);
    expect(sample.from).toBe(11);
    expect(sample.to).toBe(0);
    expect(sample.mix).toBeGreaterThan(0);
  });

  it('空序列、负时间、关闭混合都产生有限的安全采样', () => {
    const sample = new RinFrameSample();
    sample.sample([], 1, true);
    expect([sample.from, sample.to, sample.mix]).toEqual([0, 0, 0]);
    sample.sample(RIN_RIDE_FRAMES, -0.5, true);
    expect([sample.from, sample.to, sample.mix]).toEqual([8, 0, 0.5]);
    sample.sample(RIN_ATTACK_FRAMES, -1, false);
    expect(sample.from).toBe(0);
    sample.sample(RIN_ATTACK_FRAMES, 6.9, false, 0);
    expect(sample.mix).toBe(0);
  });
});
