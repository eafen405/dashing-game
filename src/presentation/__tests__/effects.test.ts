/**
 * 表现层效果池的契约测试。
 *
 * 这里测的是**已约定的 seam**：`src/presentation/` 的效果池 —— 效果的产生 / 推进 / 回收。
 * 断言全部来自**旧实现的语义**（`source.html:1256-1273` / `1413-1452`），
 * 而不是「照着实现再算一遍」的同义反复。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EffectsPool, MAX_PARTICLES } from '../effects';

afterEach(() => {
  vi.restoreAllMocks();
});

/** 取列表首项（空列表直接报错，避免用 `!` 断言掩盖问题）。 */
function first<T>(list: readonly T[]): T {
  const v = list[0];
  if (v === undefined) throw new Error('列表是空的');
  return v;
}

/** 把 `Math.random` 钉死成常数，让 burst 的初始参数可预期。 */
function stubRandom(value: number): void {
  vi.spyOn(Math, 'random').mockReturnValue(value);
}

describe('效果池 · 产生', () => {
  it('burst 按请求数量产生粒子', () => {
    const pool = new EffectsPool();

    pool.burst(100, 200, '#ff0000', 7, 1, 'spark');

    expect(pool.particles).toHaveLength(7);
    expect(pool.particles[0]?.x).toBe(100);
    expect(pool.particles[0]?.y).toBe(200);
    expect(pool.particles[0]?.color).toBe('#ff0000');
    expect(pool.particles[0]?.t).toBe(0);
  });

  it('burst 的初始参数逐字照抄旧实现（source.html:1256-1273）', () => {
    // Math.random() 恒为 0.5 →
    //   a  = 0.5 * 2π = π
    //   sp = rand(60,300) * power = (60 + 0.5*240) * power
    //   r  = rand(1.2,3.6) = 1.2 + 0.5*2.4
    //   life = rand(0.25,0.65) = 0.25 + 0.5*0.4
    stubRandom(0.5);
    const pool = new EffectsPool();

    pool.burst(0, 0, '#fff', 1, 2, 'spark');

    const p = first(pool.particles);
    const sp = 180 * 2; // rand(60,300) * power
    expect(p.vx).toBeCloseTo(Math.cos(Math.PI) * sp, 10);
    expect(p.vy).toBeCloseTo(Math.sin(Math.PI) * sp, 10);
    expect(p.r).toBeCloseTo(2.4, 10);
    expect(p.life).toBeCloseTo(0.45, 10);
  });

  it('粒子数上限是 260（与旧实现一致）', () => {
    const pool = new EffectsPool();

    pool.burst(0, 0, '#fff', 1000, 1, 'spark');

    expect(MAX_PARTICLES).toBe(260);
    expect(pool.particles).toHaveLength(MAX_PARTICLES);
  });

  it('池满时再 burst 不会突破上限', () => {
    const pool = new EffectsPool();
    pool.burst(0, 0, '#fff', MAX_PARTICLES, 1, 'spark');

    pool.burst(0, 0, '#fff', 50, 1, 'spark');

    expect(pool.particles).toHaveLength(MAX_PARTICLES);
  });

  it('飘字 / 刀光 / 冲击环按旧实现的默认值产生', () => {
    const pool = new EffectsPool();

    pool.addFloater(12, 34, '+200', '#a6ff5e');
    pool.addSlash(100, 60, 140, 0.25, 'top');
    pool.addRing(200, 140, 0.3, 5, 28, '#a6ff5e');

    const f = first(pool.floaters);
    expect(f).toMatchObject({ x: 12, y: 34, text: '+200', color: '#a6ff5e', t: 0 });
    expect(f.life).toBeCloseTo(0.95, 10);
    expect(f.vy).toBeCloseTo(-46, 10);
    expect(pool.slashes[0]).toMatchObject({ x: 100, x0: 60, y: 140, lane: 'top', t: 0 });
    expect(pool.rings[0]).toMatchObject({ x: 200, y: 140, r0: 5, r1: 28, color: '#a6ff5e', t: 0 });
  });
});

describe('效果池 · 推进', () => {
  it('粒子按旧公式推进：阻尼 0.08^dt + 重力 260*dt', () => {
    const pool = new EffectsPool();
    pool.burst(0, 0, '#fff', 1, 1, 'spark');
    const p = first(pool.particles);
    p.vx = 100;
    p.vy = 0;
    p.life = 10;

    const dt = 0.5;
    pool.step(dt);

    const expectedVx = 100 * Math.pow(0.08, dt);
    const expectedVy = 0 * Math.pow(0.08, dt) + 260 * dt;
    expect(pool.particles[0]?.vx).toBeCloseTo(expectedVx, 10);
    expect(pool.particles[0]?.vy).toBeCloseTo(expectedVy, 10);
    // 位置用的是「阻尼之前」的速度
    expect(pool.particles[0]?.x).toBeCloseTo(100 * dt, 10);
    expect(pool.particles[0]?.y).toBeCloseTo(0, 10);
    expect(pool.particles[0]?.t).toBeCloseTo(dt, 10);
  });

  it('飘字上升并按 0.2^dt 衰减', () => {
    const pool = new EffectsPool();
    pool.addFloater(0, 0, 'x', '#fff');

    const dt = 0.25;
    pool.step(dt);

    expect(pool.floaters[0]?.y).toBeCloseTo(-46 * dt, 10);
    expect(pool.floaters[0]?.vy).toBeCloseTo(-46 * Math.pow(0.2, dt), 10);
  });

  it('刀光与冲击环只推进年龄，不改其他字段', () => {
    const pool = new EffectsPool();
    pool.addSlash(100, 60, 140, 0.25, 'top');
    pool.addRing(200, 140, 0.3, 5, 28, '#a6ff5e');

    pool.step(0.1);

    expect(pool.slashes[0]).toMatchObject({ x: 100, x0: 60, y: 140, lane: 'top' });
    expect(pool.slashes[0]?.t).toBeCloseTo(0.1, 10);
    expect(pool.rings[0]).toMatchObject({ x: 200, y: 140, r0: 5, r1: 28 });
    expect(pool.rings[0]?.t).toBeCloseTo(0.1, 10);
  });
});

describe('效果池 · 回收', () => {
  it('粒子寿命耗尽后被回收', () => {
    const pool = new EffectsPool();
    pool.burst(0, 0, '#fff', 3, 1, 'spark');
    for (const p of pool.particles) p.life = 0.1;

    pool.step(0.2);

    expect(pool.particles).toHaveLength(0);
  });

  it('回收用 swap-remove：中间到期也不会留下空洞', () => {
    const pool = new EffectsPool();
    pool.burst(0, 0, '#fff', 3, 1, 'spark');
    const ids = [0, 1, 2];
    pool.particles.forEach((p, i) => {
      p.life = 0.2;
      p.color = `#${ids[i]}`;
    });
    // 让中间那只先到期
    const middle = pool.particles[1];
    if (middle) middle.life = 0.05;

    pool.step(0.1);

    expect(pool.particles).toHaveLength(2);
    expect(pool.particles.every((p) => p !== undefined)).toBe(true);
    const colors = pool.particles.map((p) => p.color).sort();
    expect(colors).toEqual(['#0', '#2']);
  });

  it('回收掉的对象被复用（不每次 new）', () => {
    const pool = new EffectsPool();
    pool.burst(0, 0, '#fff', 1, 1, 'spark');
    const firstParticle = first(pool.particles);

    pool.step(2);
    expect(pool.particles).toHaveLength(0);

    pool.burst(5, 5, '#0f0', 1, 1, 'spark');
    expect(pool.particles[0]).toBe(firstParticle);
    expect(pool.particles[0]).toMatchObject({ x: 5, y: 5, color: '#0f0', t: 0 });
  });

  it('刀光 / 冲击环 / 飘字到期后被回收', () => {
    const pool = new EffectsPool();
    pool.addSlash(0, 0, 0, 0.1, 'top');
    pool.addRing(0, 0, 0.1, 1, 2, '#fff');
    pool.addFloater(0, 0, 'x', '#fff');

    // 飘字的默认寿命是 0.95 秒（旧 addFloater），所以推进 1 秒
    pool.step(1);

    expect(pool.slashes).toHaveLength(0);
    expect(pool.rings).toHaveLength(0);
    expect(pool.floaters).toHaveLength(0);
  });
});
