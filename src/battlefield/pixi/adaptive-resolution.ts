/**
 * 自适应渲染分辨率 —— 掉帧时先降内部像素密度，保住操作手感。
 *
 * **为什么需要它**：这个游戏的画面是「大面积半透明光效叠小人物」，
 * 帧成本主要随**像素填充量**走（实测同一场景 DPR 2 → 1.5，
 * 燃魂出招从 40fps 回到 60fps，而 CPU 侧几乎不变）。
 * 手机 / Retina 屏的 `devicePixelRatio` 常见 2~3，把画布按 2 倍渲染时，
 * 弱 GPU 会先扛不住填充率 —— 表现就是「凛一攻击就卡」。
 *
 * **策略**：从最高分辨率开始，按窗口统计 rAF 间隔：
 * - 平均间隔 > `downMs` → 立刻降一档（宁可稍软，也要跟手）；
 * - 平均间隔 < `upMs` 且连续若干个窗口 → 升一档（有余量就把清晰度还回去）；
 * - 每次变档后跳过 `settleFrames` 帧，等新尺寸稳定再判定；
 * - 升档后下一窗口又掉帧 → 记为一次失败的升档，并加长「升档需要的连续好窗口数」；
 *   连续失败 3 次后不再试探，稳定在当前档 —— 避免在边界上来回跳、每十几秒卡一下。
 *
 * **阈值按 60Hz 的 rAF 取**：16.7ms = 60fps，33.3ms = 30fps。
 * 18.3ms ≈ 54.6fps，17.0ms ≈ 58.8fps。
 *
 * 逻辑与 Pixi 无关，方便单测（见 `__tests__/adaptive-resolution.test.ts`）。
 */

/** 自适应分辨率参数。 */
export interface AdaptiveResolutionOptions {
  /** 窗口平均间隔超过它 → 降一档（毫秒）。 */
  readonly downMs?: number;
  /** 窗口平均间隔低于它 → 记一次「还有余量」（毫秒）。 */
  readonly upMs?: number;
  /** 每个判定窗口的帧数。 */
  readonly windowFrames?: number;
  /** 升一档需要的连续「余量窗口」数（会随降档次数加长）。 */
  readonly upWindows?: number;
  /** 变档后跳过的帧数（等新分辨率稳定）。 */
  readonly settleFrames?: number;
  /** 超过它的间隔视为切后台 / 一次性卡顿，不计入窗口（毫秒）。 */
  readonly maxIntervalMs?: number;
}

const DEFAULTS = {
  downMs: 18.3,
  upMs: 17.0,
  windowFrames: 45,
  upWindows: 4,
  settleFrames: 40,
  maxIntervalMs: 400,
} as const;

/** 每次升档失败，升档门槛增加多少个好窗口（指数增长，封顶）。 */
const UP_PENALTY_STEP = 4;
const UP_PENALTY_MAX = 32;
/** 连续失败多少次升档后彻底放弃（避免每隔十几秒试探一次、卡一下）。 */
const MAX_UP_FAILURES = 3;

/** 分辨率档位（从高到低，去重、必须为正）。 */
export class AdaptiveResolution {
  private readonly steps: readonly number[];
  private readonly downMs: number;
  private readonly upMs: number;
  private readonly windowFrames: number;
  private readonly baseUpWindows: number;
  private readonly settleFrames: number;
  private readonly maxIntervalMs: number;

  private index = 0;
  private acc = 0;
  private count = 0;
  private goodWindows = 0;
  private settle = 0;
  private upPenalty = 0;
  /** 刚升过一档：下一窗口若立刻掉帧，记为一次失败的升档。 */
  private pendingUp = false;
  /** 失败的升档次数；到上限后不再试探，稳定在当前档。 */
  private upFailures = 0;
  private upBlocked = false;

  constructor(steps: readonly number[], options: AdaptiveResolutionOptions = {}) {
    const clean: number[] = [];
    for (const step of steps) {
      if (!(step > 0)) continue;
      if (clean.length > 0 && step >= (clean[clean.length - 1] ?? 0)) continue;
      clean.push(step);
    }
    if (clean.length === 0) throw new Error('AdaptiveResolution 至少要有一个正的分辨率档位');
    this.steps = clean;
    this.downMs = options.downMs ?? DEFAULTS.downMs;
    this.upMs = options.upMs ?? DEFAULTS.upMs;
    this.windowFrames = Math.max(1, options.windowFrames ?? DEFAULTS.windowFrames);
    this.baseUpWindows = Math.max(1, options.upWindows ?? DEFAULTS.upWindows);
    this.settleFrames = Math.max(0, options.settleFrames ?? DEFAULTS.settleFrames);
    this.maxIntervalMs = options.maxIntervalMs ?? DEFAULTS.maxIntervalMs;
  }

  /** 当前分辨率（还没降过档时就是最高档）。 */
  get resolution(): number {
    return this.steps[this.index] ?? 1;
  }

  /** 当前档位索引（0 = 最高）。测试 / 调试用。 */
  get step(): number {
    return this.index;
  }

  /** 失败升档之后，再升档需要的连续好窗口数。 */
  get requiredGoodWindows(): number {
    return this.baseUpWindows + this.upPenalty;
  }

  /**
   * 作废当前窗口（切相位 / 切后台时用）：不改变当前档位，
   * 只把「半截窗口」和「连续好窗口」清零，避免把两种状态的帧混在一起算。
   */
  resetWindow(): void {
    this.acc = 0;
    this.count = 0;
    this.goodWindows = 0;
    this.pendingUp = false;
  }

  /**
   * 观测一帧间隔。
   *
   * @param intervalMs 距离上一帧渲染的毫秒数。
   * @param canUpgrade 当前是否适合试探升档（燃魂 / 出招等重负载状态不要试探，
   *   否则「1.5 满帧、1.75 掉帧」会变成周期性卡顿）。
   * @returns 分辨率发生了变化时返回新值；没变返回 `null`。
   */
  observe(intervalMs: number, canUpgrade = true): number | null {
    // 切后台回来、或者一次性长卡顿：整窗作废，别因为切页面把画质永久降掉。
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs > this.maxIntervalMs) {
      this.resetWindow();
      return null;
    }
    if (this.settle > 0) {
      this.settle -= 1;
      return null;
    }

    this.acc += intervalMs;
    this.count += 1;
    if (this.count < this.windowFrames) return null;

    const avg = this.acc / this.count;
    this.acc = 0;
    this.count = 0;

    if (avg > this.downMs) {
      this.goodWindows = 0;
      // 上一窗口刚升档、这一窗口又掉帧 → 升档失败，下次试探要等更久
      // （4 → 8 → 16 → 32 个好窗口），避免在边界上反复跳。
      if (this.pendingUp) {
        this.pendingUp = false;
        this.upFailures += 1;
        this.upBlocked = this.upFailures >= MAX_UP_FAILURES;
        this.upPenalty = Math.min(UP_PENALTY_MAX, Math.max(UP_PENALTY_STEP, this.upPenalty * 2));
      }
      if (this.index >= this.steps.length - 1) return null;
      this.index += 1;
      this.settle = this.settleFrames;
      return this.resolution;
    }

    if (canUpgrade && !this.upBlocked && avg < this.upMs && this.index > 0) {
      this.goodWindows += 1;
      if (this.goodWindows >= this.requiredGoodWindows) {
        this.goodWindows = 0;
        this.pendingUp = true;
        this.index -= 1;
        this.settle = this.settleFrames;
        return this.resolution;
      }
      return null;
    }

    // 窗口结束且没降档：刚升上去的那一档站住了。
    this.pendingUp = false;
    this.goodWindows = 0;
    return null;
  }
}

/**
 * 由基础分辨率生成档位：100% / 87.5% / 75% / 62.5%，
 * 且不低于 `minResolution`（绝对分辨率，避免糊到看不清）。
 */
export function resolutionSteps(base: number, minResolution = 1.1): number[] {
  const factors = [1, 0.875, 0.75, 0.625] as const;
  const steps: number[] = [];
  for (const factor of factors) {
    const value = Math.round(base * factor * 100) / 100;
    if (value < minResolution - 1e-6) continue;
    if (steps.length > 0 && value >= (steps[steps.length - 1] ?? 0)) continue;
    steps.push(value);
  }
  return steps.length > 0 ? steps : [base];
}
