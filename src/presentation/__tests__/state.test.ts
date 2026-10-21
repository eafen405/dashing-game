/**
 * 表现层状态（效果事件 → 表现状态）的契约测试。
 *
 * 这是**次 seam**：`src/presentation/` 消费规则层的 `Effect[]`，
 * 把「发生了什么」翻译成「怎么表现」。
 */

import { describe, expect, it, vi } from 'vitest';

import type { Effect } from '../../game/effects';
import { computeLayout } from '../../game/layout';
import { SHOCK_LIFE } from '../../battlefield/types';
import {
  MAX_PARTICLES,
  PresentationState,
  SHAKE_CAPS,
  SHAKE_TIERS,
  type EffectSink,
} from '../index';

function makeSink(): EffectSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    toast: (text) => calls.push(`toast:${text}`),
    laneFlash: (lane) => calls.push(`laneFlash:${lane}`),
    vibrate: (pattern) => calls.push(`vibrate:${String(pattern)}`),
    hurt: () => calls.push('hurt'),
    feverStart: () => calls.push('feverStart'),
    feverEnd: () => calls.push('feverEnd'),
    gameOver: () => calls.push('gameOver'),
  };
}

describe('表现层状态 · 效果事件', () => {
  it('burst 事件产生粒子', () => {
    const state = new PresentationState();

    state.applyEffects([{ type: 'burst', x: 10, y: 20, color: '#fff', count: 5, power: 1 }]);

    expect(state.effects.particles).toHaveLength(5);
  });

  it('ring / slash / floater 事件产生对应效果', () => {
    const state = new PresentationState();

    const events: Effect[] = [
      { type: 'ring', x: 1, y: 2, life: 0.3, r0: 5, r1: 28, color: '#a6ff5e' },
      { type: 'slash', x: 3, x0: 4, y: 5, life: 0.25, lane: 'top' },
      { type: 'floater', x: 6, y: 7, text: '+700', color: '#ff5ecb' },
    ];
    state.applyEffects(events);

    expect(state.effects.rings).toHaveLength(1);
    expect(state.effects.slashes).toHaveLength(1);
    expect(state.effects.floaters).toHaveLength(1);
    expect(state.effects.floaters[0]?.text).toBe('+700');
  });

  it('粒子事件也受 260 上限约束', () => {
    const state = new PresentationState();

    state.applyEffects([{ type: 'burst', x: 0, y: 0, color: '#fff', count: 1000, power: 1 }]);

    expect(state.effects.particles).toHaveLength(MAX_PARTICLES);
  });

  it('三种震动事件语义各自落实（三档强度）', () => {
    const state = new PresentationState();

    // 普攻（规则层 amount = 5）→ 普攻档
    state.applyEffects([{ type: 'shake-add', amount: 5, cap: 17 }]);
    expect(state.shake.value).toBe(SHAKE_TIERS.normal);

    // shake-add 是**累加**：第二次再加一次普攻 → 12（普攻档的封顶）
    state.applyEffects([{ type: 'shake-add', amount: 5, cap: 17 }]);
    expect(state.shake.value).toBe(SHAKE_CAPS.normal);

    // 暴击（规则层 amount = 11）→ 暴击档（12 + 12 = 24，被暴击档封顶 18）
    state.applyEffects([{ type: 'shake-add', amount: 11, cap: 17 }]);
    expect(state.shake.value).toBe(SHAKE_CAPS.crit);

    // shake-max 只在更大时才抬升（规则层 amount = 3 → 普攻档，不抬）
    state.applyEffects([{ type: 'shake-max', amount: 3 }]);
    expect(state.shake.value).toBe(SHAKE_CAPS.crit);

    // 双生同破（规则层 amount = 16）→ 双生档
    state.applyEffects([{ type: 'shake-max', amount: 16 }]);
    expect(state.shake.value).toBe(SHAKE_TIERS.twin);

    // shake-set 是直接赋值（规则层 amount = 14 → 双生档）
    state.applyEffects([{ type: 'shake-set', amount: 14 }]);
    expect(state.shake.value).toBe(SHAKE_TIERS.twin);
  });

  it('player-flash 事件点亮红闪', () => {
    const state = new PresentationState();

    state.applyEffects([{ type: 'player-flash' }]);

    expect(state.playerFlash).toBe(1);
  });

  it('上层事件转交给 sink', () => {
    const sink = makeSink();
    const state = new PresentationState(sink);

    state.applyEffects([
      { type: 'toast', text: '双生敌人！', color: '#ff5ecb' },
      { type: 'lane-flash', lane: 'top' },
      { type: 'vibrate', pattern: 30 },
      { type: 'hurt' },
      { type: 'fever-start' },
      { type: 'fever-end' },
      { type: 'game-over' },
    ]);

    expect(sink.calls).toEqual([
      'toast:双生敌人！',
      'laneFlash:top',
      'vibrate:30',
      'hurt',
      'feverStart',
      'feverEnd',
      'gameOver',
    ]);
  });

  it('没有 sink 时上层事件被安全丢弃', () => {
    const state = new PresentationState();

    expect(() => state.applyEffects([{ type: 'toast', text: 'x', color: '#fff' }])).not.toThrow();
  });

  it('step 推进效果、衰减红闪与震动', () => {
    const state = new PresentationState();
    state.applyEffects([
      { type: 'burst', x: 0, y: 0, color: '#fff', count: 1, power: 1 },
      { type: 'player-flash' },
      { type: 'shake-set', amount: 14 },
    ]);

    state.step(1);

    expect(state.effects.particles).toHaveLength(0); // 寿命 0.25~0.65 秒，一秒后必然过期
    expect(state.playerFlash).toBe(0);
    expect(state.shake.value).toBe(0); // 0.001^1 后低于 0.2 → 归零
  });

  it('reset 清空一切', () => {
    const state = new PresentationState();
    state.applyEffects([
      { type: 'burst', x: 0, y: 0, color: '#fff', count: 3, power: 1 },
      { type: 'shake-set', amount: 14 },
      { type: 'player-flash' },
    ]);

    state.reset();

    expect(state.effects.particles).toHaveLength(0);
    expect(state.shake.value).toBe(0);
    expect(state.playerFlash).toBe(0);
  });
});

describe('表现层状态 · 随机性', () => {
  it('burst 用 Math.random，不消费规则层 PRNG', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = new PresentationState();

    state.applyEffects([{ type: 'burst', x: 0, y: 0, color: '#fff', count: 3, power: 1 }]);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

/**
 * 票 07 的**主 seam**：规则层效果事件 → 表现层的视觉形态。
 *
 * 断言全部来自**规则层的实际签名**（`src/game/rules/resolve.ts`），
 * 而不是「照着实现再算一遍」。
 */
describe('表现层状态 · 差异化粒子形态', () => {
  /** 规则层 `killMonster` 的主爆散签名（`resolve.ts:110-117`）。 */
  const killBurst = (crit: boolean): Effect[] => [
    {
      type: 'burst',
      x: 100,
      y: 50,
      color: crit ? '#ffd24a' : '#4fd1ff',
      count: crit ? 36 : 26,
      power: crit ? 1.5 : 1.25,
    },
    { type: 'burst', x: 100, y: 50, color: '#ffffff', count: crit ? 16 : 10, power: 0.9 },
  ];

  it('普攻击破 → 火花形态（spark）', () => {
    const state = new PresentationState();

    state.applyEffects(killBurst(false));

    expect(state.effects.particles).toHaveLength(36);
    expect(state.effects.particles.every((p) => p.form === 'spark')).toBe(true);
  });

  it('暴击击破 → 碎片形态（shard），白色内核也跟着变', () => {
    const state = new PresentationState();

    state.applyEffects(killBurst(true));

    expect(state.effects.particles).toHaveLength(52);
    expect(state.effects.particles.every((p) => p.form === 'shard')).toBe(true);
  });

  it('FEVER 期间的非暴击爆散 → 余烬形态（ember）', () => {
    const state = new PresentationState();
    state.applyEffects([{ type: 'fever-start' }]);

    state.applyEffects(killBurst(false));

    expect(state.effects.particles.every((p) => p.form === 'ember')).toBe(true);
  });

  it('FEVER 期间的暴击仍然是碎片（暴击永远更锐利）', () => {
    const state = new PresentationState();
    state.applyEffects([{ type: 'fever-start' }]);

    state.applyEffects(killBurst(true));

    expect(state.effects.particles.every((p) => p.form === 'shard')).toBe(true);
  });

  it('三种形态的速度与生命周期不同（一眼可辨的前提）', () => {
    // 把随机钉死成中位数 —— 三种形态的差异必须是**结构性的**，
    // 不能靠「这次刚好抽到哪个数」。
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = new PresentationState();
    const speeds: Record<string, number> = {};

    state.applyEffects(killBurst(false));
    speeds.spark = Math.hypot(
      state.effects.particles[0]?.vx ?? 0,
      state.effects.particles[0]?.vy ?? 0,
    );
    const sparkLife = state.effects.particles[0]?.life ?? 0;

    const crit = new PresentationState();
    crit.applyEffects(killBurst(true));
    speeds.shard = Math.hypot(
      crit.effects.particles[0]?.vx ?? 0,
      crit.effects.particles[0]?.vy ?? 0,
    );
    const shardLife = crit.effects.particles[0]?.life ?? 0;

    const fever = new PresentationState();
    fever.applyEffects([{ type: 'fever-start' }]);
    fever.applyEffects(killBurst(false));
    speeds.ember = Math.hypot(
      fever.effects.particles[0]?.vx ?? 0,
      fever.effects.particles[0]?.vy ?? 0,
    );
    const emberLife = fever.effects.particles[0]?.life ?? 0;

    // 暴击碎片最快
    expect(speeds.shard ?? 0).toBeGreaterThan(speeds.spark ?? 0);
    // FEVER 余烬最慢、活得最久
    expect(speeds.ember ?? 0).toBeLessThan(speeds.spark ?? 0);
    expect(emberLife).toBeGreaterThan(sparkLife);
    expect(shardLife).toBeGreaterThan(sparkLife);
    vi.restoreAllMocks();
  });
});

describe('表现层状态 · 冲击环档位与冲击波', () => {
  it('普攻击破的环是普攻档，不触发冲击波', () => {
    const state = new PresentationState();

    state.applyEffects([
      { type: 'burst', x: 10, y: 20, color: '#4fd1ff', count: 26, power: 1.25 },
      { type: 'ring', x: 10, y: 20, life: 0.4, r0: 6, r1: 46, color: '#4fd1ff' },
    ]);

    expect(state.effects.rings[0]?.tier).toBe('normal');
    expect(state.screenFx.shockLevel).toBe(0);
  });

  it('暴击击破：环加粗到暴击档，并瞬时触发冲击波', () => {
    const state = new PresentationState();

    state.applyEffects([
      { type: 'burst', x: 100, y: 50, color: '#ffd24a', count: 36, power: 1.5 },
      { type: 'ring', x: 100, y: 50, life: 0.5, r0: 6, r1: 88, color: '#ffd24a' },
    ]);

    expect(state.effects.rings[0]?.tier).toBe('crit');
    expect(state.screenFx.shockLevel).toBe(1);
    expect(state.screenFx.shockX).toBe(100);
    expect(state.screenFx.shockY).toBe(50);
  });

  it('双生同破：环是双生档，冲击波是最强档', () => {
    const state = new PresentationState();

    state.applyEffects([
      { type: 'burst', x: 100, y: 50, color: '#ff5ecb', count: 34, power: 1.5 },
      { type: 'burst', x: 300, y: 400, color: '#ff5ecb', count: 34, power: 1.5 },
      { type: 'ring', x: 100, y: 50, life: 0.52, r0: 6, r1: 92, color: '#ff5ecb' },
    ]);

    expect(state.effects.rings[0]?.tier).toBe('twin');
    expect(state.screenFx.shockLevel).toBe(2);
    // 中心是两只怪的中点
    expect(state.screenFx.shockX).toBe(200);
    expect(state.screenFx.shockY).toBe(225);
  });

  it('冲击波的 age 逐帧推进，寿命走完就关掉', () => {
    const state = new PresentationState();
    state.applyEffects([{ type: 'burst', x: 10, y: 20, color: '#ffd24a', count: 36, power: 1.5 }]);
    expect(state.screenFx.shockAge).toBe(0);

    state.step(0.1);
    expect(state.screenFx.shockAge).toBeCloseTo(0.1, 10);
    expect(state.screenFx.shockLevel).toBe(1);

    state.step(SHOCK_LIFE);
    expect(state.screenFx.shockLevel).toBe(0);
  });
});

describe('表现层状态 · 暴击余晖与色散', () => {
  it('暴击批次追加一道余晖刀光', () => {
    const state = new PresentationState();

    state.applyEffects([
      { type: 'slash', x: 300, x0: 200, y: 100, life: 0.3, lane: 'top' },
      { type: 'burst', x: 300, y: 100, color: '#ffd24a', count: 36, power: 1.5 },
    ]);

    expect(state.effects.slashes).toHaveLength(2);
    expect(state.effects.slashes[0]?.kind).toBe('main');
    expect(state.effects.slashes[1]?.kind).toBe('afterglow');
    // 余晖比主刀光活得久
    expect(state.effects.slashes[1]?.life ?? 0).toBeGreaterThan(
      state.effects.slashes[0]?.life ?? 0,
    );
  });

  it('普攻批次不追加余晖', () => {
    const state = new PresentationState();

    state.applyEffects([
      { type: 'slash', x: 300, x0: 200, y: 100, life: 0.3, lane: 'top' },
      { type: 'burst', x: 300, y: 100, color: '#4fd1ff', count: 26, power: 1.25 },
    ]);

    expect(state.effects.slashes).toHaveLength(1);
    expect(state.effects.slashes[0]?.kind).toBe('main');
  });

  it('色散强度在进出 FEVER 时插值（不是开关）', () => {
    const state = new PresentationState();
    expect(state.screenFx.rgbSplit).toBe(0);

    state.applyEffects([{ type: 'fever-start' }]);
    state.step(0.1);
    expect(state.screenFx.rgbSplit).toBeGreaterThan(0);
    expect(state.screenFx.rgbSplit).toBeLessThan(1);

    state.step(1);
    expect(state.screenFx.rgbSplit).toBe(1);

    state.applyEffects([{ type: 'fever-end' }]);
    state.step(1);
    expect(state.screenFx.rgbSplit).toBe(0);
  });
});

describe('表现层状态 · FEVER 周身金色火花', () => {
  it('FEVER 期间持续发射绕着角色的余烬粒子', () => {
    const state = new PresentationState();
    state.setLayout(computeLayout(900, 500, 1));
    state.applyEffects([{ type: 'fever-start' }]);

    state.step(0.1);
    state.step(0.1);

    const sparks = state.effects.particles;
    expect(sparks.length).toBeGreaterThan(0);
    expect(sparks.every((p) => p.form === 'ember')).toBe(true);
    // 位置在角色附近（环半径 = playerR * rand(1.2, 2.1)）
    const layout = computeLayout(900, 500, 1);
    for (const p of sparks) {
      const dx = p.x - layout.playerX;
      const dy = p.y - layout.height / 2;
      const dist = Math.hypot(dx, dy);
      expect(dist).toBeGreaterThan(layout.playerR);
      expect(dist).toBeLessThan(layout.playerR * 2.2);
    }
  });

  it('FEVER 结束后不再发射', () => {
    const state = new PresentationState();
    state.setLayout(computeLayout(900, 500, 1));
    state.applyEffects([{ type: 'fever-start' }]);
    state.step(0.1);
    const during = state.effects.particles.length;

    state.applyEffects([{ type: 'fever-end' }]);
    state.step(1);
    const after = state.effects.particles.filter((p) => p.form === 'ember').length;

    expect(during).toBeGreaterThan(0);
    expect(after).toBeLessThan(during);
  });
});
