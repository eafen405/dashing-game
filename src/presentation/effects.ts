/**
 * 表现层效果池 —— 粒子 / 命中火花 / 冲击环 / 飘字。
 *
 * 分层依据 ADR-0003「规则层不可变、表现层可变」：规则层只产出**效果事件**
 * （`src/game/effects.ts` 的 `Effect[]`），表现层决定「怎么画」——
 * 这里的可变状态（粒子 / 命中火花 / 环 / 飘字）是**池化**的，渲染层只读。
 *
 * 三条硬约束（ADR-0004 · 性能靠构造，不靠基准）：
 *
 * 1. **对象池 + swap-remove**。回收时把末尾元素搬到被删位置再 `pop()`，
 *    数组里不会留空洞，也**不会**重建数组（旧实现用 `splice`，
 *    `source.html:1417/1429/1436/1448`）。
 * 2. **衰减公式逐字照抄旧实现**（`source.html:1413-1452`）。这些数字决定
 *    手感与视觉，改一个就与旧版对不上了。
 * 3. **每帧不得分配**。`step()` 里没有 `new`、没有闭包、没有数组字面量；
 *    回收掉的对象进空闲池，下次复用。
 *
 * **随机性**：旧实现的 `burst` 用 `Math.random()`（`source.html:493` / `1261`），
 * 这里照抄。表现层的视觉随机**不消费规则层 PRNG** —— 规则层的随机只管规则，
 * 两者互不干扰（`src/game/**` 之外的代码不受 `Math.random()` 禁令约束）。
 */

import type { Effects, Floater, Impact, Particle, Ring } from '../battlefield/types';
import type { Lane } from '../game/types';

/** 粒子上限（与旧实现一致：`source.html:1258`）。 */
export const MAX_PARTICLES = 260;

/** 飘字总寿命（秒）—— 旧 `addFloater`（`source.html:1441`）。 */
const FLOATER_LIFE = 0.95;
/** 飘字初速度（px/s）—— 旧 `addFloater`（`source.html:1441`）。 */
const FLOATER_VY = -46;

/** 旧 `rand(a,b)`（`source.html:493`）—— 表现层视觉随机专用。 */
function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** 有寿命的对象（池里的每一项）。 */
interface Timed {
  /** 已存活时间（秒）。 */
  t: number;
  /** 总寿命（秒）。 */
  life: number;
}

/**
 * 带寿命的对象池。
 *
 * 活跃对象放在 `items`（渲染层只读），回收后进 `spare` 复用。
 * `removeAt` 是 **swap-remove**：不 `splice`、不 `filter`、不重建数组。
 */
class TimedPool<T extends Timed> {
  /** 活跃对象。 */
  readonly items: T[] = [];
  /** 空闲对象（已回收，等待复用）。 */
  private readonly spare: T[] = [];
  private readonly factory: () => T;
  private readonly advance: (item: T, dt: number) => boolean;

  constructor(factory: () => T, advance: (item: T, dt: number) => boolean) {
    this.factory = factory;
    this.advance = advance;
  }

  /**
   * 取一个对象（优先复用空闲池），**调用方负责填字段**。
   *
   * 刻意不接受回调 —— 回调会让每次 spawn 都分配一个闭包。
   */
  take(): T {
    const item = this.spare.pop() ?? this.factory();
    this.items.push(item);
    return item;
  }

  /** 就地移除第 `index` 项（swap-remove，末尾元素补位）。 */
  removeAt(index: number): void {
    const item = this.items[index];
    if (item === undefined) return;
    const last = this.items.length - 1;
    const lastItem = this.items[last];
    if (index !== last && lastItem !== undefined) this.items[index] = lastItem;
    this.items.pop();
    this.spare.push(item);
  }

  /**
   * 推进一帧。
   *
   * 倒序遍历 + swap-remove 是安全的：被搬上来的末尾元素**已经推进过**，
   * 不会被重复处理。
   */
  step(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item === undefined) continue;
      item.t += dt;
      if (!this.advance(item, dt)) this.removeAt(i);
    }
  }

  /** 清空（所有对象回空闲池）。 */
  clear(): void {
    for (const item of this.items) this.spare.push(item);
    this.items.length = 0;
  }
}

function createParticle(): Particle {
  return { x: 0, y: 0, vx: 0, vy: 0, r: 0, t: 0, life: 0, color: '#ffffff' };
}

/** 粒子推进 —— 逐字照抄 `source.html:1416-1422`。 */
function advanceParticle(p: Particle, dt: number): boolean {
  if (p.t >= p.life) return false;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vx *= Math.pow(0.08, dt);
  p.vy *= Math.pow(0.08, dt);
  p.vy += 260 * dt;
  return true;
}

function createImpact(): Impact {
  return { x: 0, y: 0, t: 0, life: 0, lane: 'top' };
}

/** 命中火花只推进年龄。 */
function advanceImpact(s: Impact): boolean {
  return s.t < s.life;
}

function createRing(): Ring {
  return { x: 0, y: 0, t: 0, life: 0, r0: 0, r1: 0, color: '#ffffff' };
}

/** 冲击环只推进年龄 —— 旧 `updateRings`（`source.html:1433-1438`）。 */
function advanceRing(r: Ring): boolean {
  return r.t < r.life;
}

function createFloater(): Floater {
  return { x: 0, y: 0, text: '', color: '#ffffff', t: 0, life: 0, vy: 0 };
}

/** 飘字推进 —— 逐字照抄 `source.html:1447-1450`。 */
function advanceFloater(f: Floater, dt: number): boolean {
  if (f.t >= f.life) return false;
  f.y += f.vy * dt;
  f.vy *= Math.pow(0.2, dt);
  return true;
}

/**
 * 效果池。
 *
 * 渲染层通过 `particles` / `impacts` / `rings` / `floaters` 四个只读数组读画面；
 * 上层（会话层）通过 `burst` / `addImpact` / `addRing` / `addFloater` 产生效果。
 */
export class EffectsPool implements Effects {
  private readonly particlePool = new TimedPool<Particle>(createParticle, advanceParticle);
  private readonly impactPool = new TimedPool<Impact>(createImpact, advanceImpact);
  private readonly ringPool = new TimedPool<Ring>(createRing, advanceRing);
  private readonly floaterPool = new TimedPool<Floater>(createFloater, advanceFloater);

  /** 活跃粒子。 */
  get particles(): readonly Particle[] {
    return this.particlePool.items;
  }
  /** 活跃命中火花。 */
  get impacts(): readonly Impact[] {
    return this.impactPool.items;
  }
  /** 活跃冲击环。 */
  get rings(): readonly Ring[] {
    return this.ringPool.items;
  }
  /** 活跃飘字。 */
  get floaters(): readonly Floater[] {
    return this.floaterPool.items;
  }

  /**
   * 爆散粒子 —— 逐字照抄旧 `burst`（`source.html:1256-1273`）。
   *
   * 粒子上限 260 是旧实现的口径：长时间 FEVER 后一次爆炸不会叠出上百个圆弧。
   */
  burst(x: number, y: number, color: string, n: number, power: number): void {
    n = Math.min(n, MAX_PARTICLES - this.particlePool.items.length);
    if (n <= 0) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(60, 300) * power;
      const p = this.particlePool.take();
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.r = rand(1.2, 3.6);
      p.life = rand(0.25, 0.65);
      p.t = 0;
      p.color = color;
    }
  }

  /**
   * 单颗火花 —— 旧 `emitFrenzy()`（`source.html:1238-1253`）。
   *
   * FEVER 期间角色周身持续冒金色火花。旧实现直接 `particles.push`，
   * 这里同样走对象池；位置 / 速度 / 寿命由会话层按旧公式算好传进来。
   */
  addSpark(
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    life: number,
    color: string,
  ): void {
    if (this.particlePool.items.length >= MAX_PARTICLES) return;
    const p = this.particlePool.take();
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.r = r;
    p.life = life;
    p.t = 0;
    p.color = color;
  }

  /** 加一次命中火花 —— 就在打击点原地炸开。 */
  addImpact(x: number, y: number, life: number, lane: Lane): void {
    const s = this.impactPool.take();
    s.x = x;
    s.y = y;
    s.t = 0;
    s.life = life;
    s.lane = lane;
  }

  /** 加一个冲击环 —— 旧 `rings.push({...})`（例如 `source.html:1098`）。 */
  addRing(x: number, y: number, life: number, r0: number, r1: number, color: string): void {
    const r = this.ringPool.take();
    r.x = x;
    r.y = y;
    r.t = 0;
    r.life = life;
    r.r0 = r0;
    r.r1 = r1;
    r.color = color;
  }

  /** 加一条飘分文字 —— 旧 `addFloater`（`source.html:1440-1442`）。 */
  addFloater(x: number, y: number, text: string, color: string): void {
    const f = this.floaterPool.take();
    f.x = x;
    f.y = y;
    f.text = text;
    f.color = color;
    f.t = 0;
    f.life = FLOATER_LIFE;
    f.vy = FLOATER_VY;
  }

  /** 推进一帧（所有池一起）。 */
  step(dt: number): void {
    this.particlePool.step(dt);
    this.impactPool.step(dt);
    this.ringPool.step(dt);
    this.floaterPool.step(dt);
  }

  /** 清空所有效果。 */
  clear(): void {
    this.particlePool.clear();
    this.impactPool.clear();
    this.ringPool.clear();
    this.floaterPool.clear();
  }
}
