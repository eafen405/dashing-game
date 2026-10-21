/**
 * 效果签名的契约测试 —— 票 07 的**主 seam**的「翻译表」部分。
 *
 * 规则层**不可改动**（golden trace 门禁），所以「这是不是暴击 / 双生同破」
 * 只能从效果事件的签名反推。这里逐条锁住那张签名表
 * （签名出处见 `src/presentation/fx.ts` 的文件头）。
 */

import { describe, expect, it } from 'vitest';

import type { Effect } from '../../game/effects';
import {
  classifyBatch,
  EFFECT_INTENSITY,
  intensityOf,
  particleFormOf,
  ringTierOf,
  shakeTierOf,
  type BatchSignature,
} from '../fx';

/** 分类的暂存对象（复用，零分配）。 */
function sig(): BatchSignature {
  return { crit: false, wave: 'none', waveX: 0, waveY: 0 };
}

/** 规则层 `killMonster` 的完整效果批次（`resolve.ts:110-154`）。 */
function killBatch(crit: boolean): Effect[] {
  return [
    { type: 'slash', x: 300, x0: 200, y: 100, life: 0.3, lane: 'top' },
    {
      type: 'burst',
      x: 300,
      y: 100,
      color: crit ? '#ffd24a' : '#4fd1ff',
      count: crit ? 36 : 26,
      power: crit ? 1.5 : 1.25,
    },
    { type: 'burst', x: 300, y: 100, color: '#ffffff', count: crit ? 16 : 10, power: 0.9 },
    { type: 'ring', x: 300, y: 100, life: 0.4, r0: 6, r1: 46, color: '#4fd1ff' },
    { type: 'shake-add', amount: crit ? 11 : 5, cap: 17 },
  ];
}

describe('效果签名 · 批次分类', () => {
  it('普攻批次：不是暴击、不触发冲击波', () => {
    const s = sig();

    classifyBatch(killBatch(false), s);

    expect(s.crit).toBe(false);
    expect(s.wave).toBe('none');
    expect(ringTierOf(s)).toBe('normal');
  });

  it('暴击批次：crit + 暴击档冲击波，中心是怪物的位置', () => {
    const s = sig();

    classifyBatch(killBatch(true), s);

    expect(s.crit).toBe(true);
    expect(s.wave).toBe('crit');
    expect(s.waveX).toBe(300);
    expect(s.waveY).toBe(100);
    expect(ringTierOf(s)).toBe('crit');
  });

  it('双生击破批次：双生档冲击波，中心是两只怪的中点', () => {
    const s = sig();
    const batch: Effect[] = [
      { type: 'burst', x: 100, y: 50, color: '#ff5ecb', count: 28, power: 1.3 },
      { type: 'burst', x: 100, y: 50, color: '#ffffff', count: 12, power: 0.9 },
      { type: 'burst', x: 300, y: 400, color: '#ff5ecb', count: 28, power: 1.3 },
      { type: 'burst', x: 300, y: 400, color: '#ffffff', count: 12, power: 0.9 },
      { type: 'shake-add', amount: 13, cap: 20 },
    ];

    classifyBatch(batch, s);

    expect(s.crit).toBe(false);
    expect(s.wave).toBe('twin');
    expect(s.waveX).toBe(200);
    expect(s.waveY).toBe(225);
    expect(ringTierOf(s)).toBe('twin');
  });

  it('双生暴击批次：crit + 双生档冲击波', () => {
    const s = sig();
    const batch: Effect[] = [
      { type: 'burst', x: 100, y: 50, color: '#ffd24a', count: 34, power: 1.5 },
      { type: 'burst', x: 300, y: 400, color: '#ffd24a', count: 34, power: 1.5 },
    ];

    classifyBatch(batch, s);

    expect(s.crit).toBe(true);
    expect(s.wave).toBe('twin');
  });

  it('单破自爆批次（26 / 1.25）不会被误判成双生或暴击', () => {
    const s = sig();
    const batch: Effect[] = [
      { type: 'burst', x: 100, y: 50, color: '#ff4d6d', count: 26, power: 1.25 },
      { type: 'burst', x: 100, y: 50, color: '#ff5ecb', count: 18, power: 1.0 },
    ];

    classifyBatch(batch, s);

    expect(s.crit).toBe(false);
    expect(s.wave).toBe('none');
  });

  it('角色受击批次（22 / 1.15）不会被误判', () => {
    const s = sig();

    classifyBatch([{ type: 'burst', x: 10, y: 20, color: '#ff4d6d', count: 22, power: 1.15 }], s);

    expect(s.crit).toBe(false);
    expect(s.wave).toBe('none');
  });
});

describe('效果签名 · 粒子形态', () => {
  it('普攻 → spark，暴击 → shard，FEVER → ember', () => {
    const plain = sig();
    classifyBatch(killBatch(false), plain);
    const crit = sig();
    classifyBatch(killBatch(true), crit);

    expect(particleFormOf(plain, false)).toBe('spark');
    expect(particleFormOf(crit, false)).toBe('shard');
    expect(particleFormOf(plain, true)).toBe('ember');
  });

  it('暴击优先于 FEVER（暴击永远是更锐利的那一下）', () => {
    const crit = sig();
    classifyBatch(killBatch(true), crit);

    expect(particleFormOf(crit, true)).toBe('shard');
  });
});

describe('效果签名 · 特效强度四档', () => {
  it('四档严格递增：普攻 < 暴击 < 双生同破 < FEVER', () => {
    expect(EFFECT_INTENSITY.normal).toBeLessThan(EFFECT_INTENSITY.crit);
    expect(EFFECT_INTENSITY.crit).toBeLessThan(EFFECT_INTENSITY.twin);
    expect(EFFECT_INTENSITY.twin).toBeLessThan(EFFECT_INTENSITY.fever);
    // 任务要求的「普攻 < 暴击 < FEVER」
    expect(EFFECT_INTENSITY.normal).toBeLessThan(EFFECT_INTENSITY.fever);
  });

  it('档位判定：普攻 / 暴击 / 双生 / FEVER', () => {
    const plain = sig();
    classifyBatch(killBatch(false), plain);
    const crit = sig();
    classifyBatch(killBatch(true), crit);
    const twin = sig();
    classifyBatch([{ type: 'burst', x: 0, y: 0, color: '#ff5ecb', count: 28, power: 1.3 }], twin);

    expect(intensityOf(plain, false)).toBe('normal');
    expect(intensityOf(crit, false)).toBe('crit');
    expect(intensityOf(twin, false)).toBe('twin');
    // FEVER 期间整场拉到最高档
    expect(intensityOf(plain, true)).toBe('fever');
  });
});

describe('效果签名 · 震动档位', () => {
  it('规则层的震动幅度映射到三档', () => {
    expect(shakeTierOf(5)).toBe('normal');
    expect(shakeTierOf(11)).toBe('crit');
    expect(shakeTierOf(16)).toBe('twin');
  });
});
