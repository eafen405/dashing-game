/**
 * 表现层效果池 —— 粒子 / 刀光 / 冲击环 / 飘字。
 *
 * 分层依据 ADR-0003「规则层不可变、表现层可变」：规则层只产出**效果事件**
 * （`src/game/effects.ts` 的 `Effect[]`），表现层决定「怎么画」——
 * 这里的可变状态（粒子 / 刀光 / 环 / 飘字）是**池化**的，渲染层只读。
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
 *
 * ## 票 07：三种粒子形态
 *
 * 旧版只有一种形态（圆点）。这里拆成三种，让普攻 / 暴击 / FEVER
 * **一眼可辨**（形状 / 速度 / 颜色 / 生命周期都不同，见 `FORM_SPECS`）：
 *
 * | 形态 | 形状 | 速度 | 寿命 | 什么时候 |
 * |---|---|---|---|---|
 * | `spark` | 圆点 | 旧版 | 旧版 | 普攻 / 空挥 / 长按 |
 * | `shard` | 细长碎片（Pixi 侧） | 更快 | 略长 | 暴击击破 |
 * | `ember` | 四角星芒（Pixi 侧） | 更慢 | 更长 | FEVER 期间 + 周身金色火花 |
 *
 * 形态由**表现层**决定（`fx.ts` 的 `particleFormOf`）——
 * 规则层只说「击破了」，不说「长什么样」。
 */

import type {
  Effects,
  Floater,
  Particle,
  ParticleForm,
  Ring,
  RingTier,
  Slash,
  SlashKind,
} from '../battlefield/types';
import type { Lane } from '../game/types';

/** 粒子上限（与旧实现一致：`source.html:1258`）。 */
export const MAX_PARTICLES = 260;

/**
 * 余烬暖金 —— FEVER 期间的粒子颜色。
 *
 * 规则层在 FEVER 时给的轨道色是 `#ffd24a` / `#ff9a2e`，
 * 与普攻的 `#ff8a4f` 几乎分不出来（`palette.ts` 的 `laneColorOf`），
 * 所以表现层在 FEVER 期间**统一改用余烬暖金**，让 FEVER 一眼可辨。
 */
export const EMBER_COLOR = '#ffb43c';
/** 余烬的亮色变体（35% 概率 —— 旧 `emitFrenzy` 的口径）。 */
export const EMBER_COLOR_BRIGHT = '#fff4c2';
/** 命中亮色变体的概率（旧 `source.html:1250`：`Math.random() < 0.35`）。 */
const EMBER_BRIGHT_CHANCE = 0.35;

/** 飘字总寿命（秒）—— 旧 `addFloater`（`source.html:1441`）。 */
const FLOATER_LIFE = 0.95;
/** 飘字初速度（px/s）—— 旧 `addFloater`（`source.html:1441`）。 */
const FLOATER_VY = -46;

/**
 * 每种粒子形态的规格 —— 形状 / 速度 / 颜色 / 生命周期。
 *
 * `spark` 的三个数字**逐字照抄**旧实现（`source.html:1261-1272`），
 * 旧版只有这一种形态；`shard`（暴击）与 `ember`（FEVER）是票 07 新增的。
 */
interface FormSpec {
  /** 速度区间（px/s）—— 再乘以爆散的 `power`。 */
  speed: readonly [number, number];
  /** 半径区间（px）。 */
  radius: readonly [number, number];
  /** 寿命区间（秒）。 */
  life: readonly [number, number];
}

/** 三种粒子形态的规格表。 */
export const FORM_SPECS: Record<ParticleForm, FormSpec> = {
  /** 普攻：圆点，轨道色，旧速度与旧寿命。 */
  spark: { speed: [60, 300], radius: [1.2, 3.6], life: [0.25, 0.65] },
  /** 暴击：细长碎片，更快更大更亮（金 / 白）。 */
  shard: { speed: [140, 420], radius: [2.0, 4.6], life: [0.32, 0.72] },
  /** FEVER：四角星芒，更慢更持久（暖金）。 */
  ember: { speed: [40, 220], radius: [1.8, 4.2], life: [0.45, 1.0] },
};

/** 旧 `rand(a,b)`（`source.html:493`）—— 表现层视觉随机专用。 */
function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** 余烬颜色 —— 35% 概率是亮色（旧 `source.html:1250` 的口径）。 */
function emberColor(): string {
  return Math.random() < EMBER_BRIGHT_CHANCE ? EMBER_COLOR_BRIGHT : EMBER_COLOR;
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
  return { x: 0, y: 0, vx: 0, vy: 0, r: 0, t: 0, life: 0, color: '#ffffff', form: 'spark' };
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

function createSlash(): Slash {
  return { x: 0, x0: 0, y: 0, t: 0, life: 0, lane: 'top', kind: 'main' };
}

/** 刀光只推进年龄 —— 旧 `updateSlashes`（`source.html:1426-1431`）。 */
function advanceSlash(s: Slash): boolean {
  return s.t < s.life;
}

function createRing(): Ring {
  return { x: 0, y: 0, t: 0, life: 0, r0: 0, r1: 0, color: '#ffffff', tier: 'normal' };
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
 * 渲染层通过 `particles` / `slashes` / `rings` / `floaters` 四个只读数组读画面；
 * 上层（会话层）通过 `burst` / `addSlash` / `addRing` / `addFloater` 产生效果。
 */
export class EffectsPool implements Effects {
  private readonly particlePool = new TimedPool<Particle>(createParticle, advanceParticle);
  private readonly slashPool = new TimedPool<Slash>(createSlash, advanceSlash);
  private readonly ringPool = new TimedPool<Ring>(createRing, advanceRing);
  private readonly floaterPool = new TimedPool<Floater>(createFloater, advanceFloater);

  /** 活跃粒子。 */
  get particles(): readonly Particle[] {
    return this.particlePool.items;
  }
  /** 活跃刀光。 */
  get slashes(): readonly Slash[] {
    return this.slashPool.items;
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
   *
   * 票 07：形态由**表现层**决定（`fx.ts` 的 `particleFormOf`）——
   * 速度 / 半径 / 寿命按形态取 `FORM_SPECS`，
   * `spark` 的三个数字与旧版逐字一致。
   */
  burst(x: number, y: number, color: string, n: number, power: number, form: ParticleForm): void {
    n = Math.min(n, MAX_PARTICLES - this.particlePool.items.length);
    if (n <= 0) return;
    const spec = FORM_SPECS[form];
    const tint = form === 'ember' ? emberColor() : color;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(spec.speed[0], spec.speed[1]) * power;
      const p = this.particlePool.take();
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.r = rand(spec.radius[0], spec.radius[1]);
      p.life = rand(spec.life[0], spec.life[1]);
      p.t = 0;
      p.color = tint;
      p.form = form;
    }
  }

  /**
   * 直接放一个粒子 —— 参数全由调用方给。
   *
   * FEVER 周身火花（`source.html:1238-1254` 的 `emitFrenzy`）用这条路径：
   * 它的速度 / 半径 / 寿命都是旧实现写死的，不走 `FORM_SPECS`。
   *
   * 超过 260 上限直接丢弃（与旧实现 `particles.length >= 260` 的检查同口径）。
   */
  spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    life: number,
    color: string,
    form: ParticleForm,
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
    p.form = form;
  }

  /**
   * FEVER 周身金色火花 —— 旧 `emitFrenzy`（`source.html:1238-1254`）。
   *
   * 逐字保留旧口径：环半径 `playerR * rand(1.2, 2.1)`、
   * 速度 `vx = -rand(40, 160)` / `vy = rand(-70, 20)`、
   * 半径 `rand(1.4, 3.2)`、寿命 `rand(0.3, 0.7)`、
   * 颜色 35% 概率 `#fff4c2` 否则金色。
   *
   * 发射节奏由调用方（`PresentationState`）控制 —— 旧实现的
   * `frenzySparkT = rand(0.035, 0.08)` 属于「什么时候发」，
   * 这里是「发一颗」。
   */
  emitFeverSpark(playerX: number, playerY: number, playerR: number): void {
    const a = Math.random() * Math.PI * 2;
    const rr = playerR * rand(1.2, 2.1);
    this.spawnParticle(
      playerX + Math.cos(a) * rr,
      playerY + Math.sin(a) * rr,
      -rand(40, 160),
      rand(-70, 20),
      rand(1.4, 3.2),
      rand(0.3, 0.7),
      emberColor(),
      'ember',
    );
  }

  /** 加一道刀光 —— 旧 `slashes.push({...})`（`source.html:2343` 之前的产生点）。 */
  addSlash(
    x: number,
    x0: number,
    y: number,
    life: number,
    lane: Lane,
    kind: SlashKind = 'main',
  ): void {
    const s = this.slashPool.take();
    s.x = x;
    s.x0 = x0;
    s.y = y;
    s.t = 0;
    s.life = life;
    s.lane = lane;
    s.kind = kind;
  }

  /** 加一个冲击环 —— 旧 `rings.push({...})`（例如 `source.html:1098`）。 */
  addRing(
    x: number,
    y: number,
    life: number,
    r0: number,
    r1: number,
    color: string,
    tier: RingTier = 'normal',
  ): void {
    const r = this.ringPool.take();
    r.x = x;
    r.y = y;
    r.t = 0;
    r.life = life;
    r.r0 = r0;
    r.r1 = r1;
    r.color = color;
    r.tier = tier;
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
    this.slashPool.step(dt);
    this.ringPool.step(dt);
    this.floaterPool.step(dt);
  }

  /** 清空所有效果。 */
  clear(): void {
    this.particlePool.clear();
    this.slashPool.clear();
    this.ringPool.clear();
    this.floaterPool.clear();
  }
}
