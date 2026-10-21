/**
 * 全屏滤镜 —— 常驻 bloom（`glow` 层）+ 条件色散 / 冲击波（`stage` 层）。
 *
 * ## 生命周期（硬约束：滤镜不得每帧重建实例）
 *
 * ```
 * mount()   → createScreenFilters()  ← 实例在这里诞生，全生命周期只有一次
 * render()  → 只改参数（enabled / 分量偏移 / time / center）
 * unmount() → app.destroy() 连带销毁
 * ```
 *
 * 开关一律用 `filter.enabled = false`（**不是** `filters = null`）——
 * `filters` 数组一旦被换掉，Pixi 的 `FilterEffect` 会重建整条滤镜管线。
 *
 * ## 已核实的 pixi-filters 6.1.5 事实（照着源码写的，不是凭印象）
 *
 * 1. **`AdvancedBloomFilter` 的 `options` 里没有 `resolution`** ——
 *    只能构造后赋值（`Filter.resolution` 生效，见 `FilterSystem.mjs:492`）。
 * 2. **`AdvancedBloomFilter` 的 `padding` 恒为 0** —— 内层 Kawase 模糊的 padding
 *    **不向上传播**，不手设就会把辉光裁掉（`FilterSystem.mjs:493` 累加各滤镜的 padding）。
 * 3. **`AdvancedBloomFilter` 的亮度提取用 `max/min` 通道**（`extract-brightness.mjs`），
 *    且**不做 alpha 反预乘** —— 半透明的霓虹色亮度会被 alpha 压低，
 *    所以 `threshold` 必须压得比直觉低（0.22），否则什么都不发光。
 * 4. **`RGBSplitFilter` 的整体 setter（`red = {...}`）会替换 uniform 对象**，
 *    分量 setter（`redX` / `redY` …）才是就地改 —— 逐帧插值必须用分量 setter。
 * 5. **`RGBSplitFilter` / `ShockwaveFilter` 构造时 `Object.assign(this, options)`**
 *    会把 `DEFAULT_OPTIONS` 里的**同一个对象引用**塞进 uniform。
 *    之后用分量 setter 改值 = **改全局默认对象**（跨实例污染）。
 *    → 构造后立刻用整体 setter 换成自己的对象（见下）。
 * 6. **`ShockwaveFilter` 的 `center` 是像素，不是归一化坐标** ——
 *    着色器算的是 `uOffset / uInputSize.xy`（`shockwave.mjs`），
 *    `.d.ts` 里「normalized screen coords」的注释是错的。
 *    （票 07 的 e2e 脚本 `tests/e2e/filter-center-probe.mjs` 实测复核过。）
 * 7. **`ShockwaveFilter` 的 `radius` 是像素**：
 *    `maxRadius = uRadius / uInputSize.x`，`currentRadius = uTime * uSpeed / uInputSize.x`
 *    → 波front 在 `t = radius / speed` 时到达最大半径。
 */

import { AdvancedBloomFilter } from 'pixi-filters/advanced-bloom';
import { RGBSplitFilter } from 'pixi-filters/rgb-split';
import { ShockwaveFilter } from 'pixi-filters/shockwave';

import { SHOCK_LIFE, type ScreenFx } from '../types';

/** bloom 的亮度阈值 —— 压低才能让半透明的霓虹色也发光（见文件头第 3 条）。 */
export const BLOOM_THRESHOLD = 0.22;
/** bloom 的强度倍率。 */
export const BLOOM_SCALE = 1.15;
/** bloom 的亮度倍率。 */
export const BLOOM_BRIGHTNESS = 1.05;
/** bloom 的模糊半径（映射到 Kawase 的 `strength`）。 */
export const BLOOM_BLUR = 6;
/** bloom 的模糊质量（Kawase 迭代次数）。 */
export const BLOOM_QUALITY = 3;
/**
 * bloom 的 padding（px）—— **必须手设**（见文件头第 2 条）。
 *
 * 内层 Kawase 模糊会把辉光扩到滤镜区域之外，不留余量就会被裁掉一圈。
 */
export const BLOOM_PADDING = 28;
/**
 * bloom 的渲染分辨率 —— **与主画布分辨率解耦**。
 *
 * 0.5 → 像素量降到 1/4，辉光本来就是糊的，看不出差别。
 */
export const BLOOM_RESOLUTION = 0.5;

/** 色散 / 冲击波的渲染分辨率（同样是 0.5 —— 全屏滤镜的开销在像素量上）。 */
export const FILTER_RESOLUTION = 0.5;
/** 色散 / 冲击波的 padding（px）—— 位移会让边缘采样越界。 */
export const FILTER_PADDING = 24;

/** 色散的最大横向偏移（px）—— `rgbSplit = 1` 时的峰值。 */
export const RGB_SPLIT_MAX = 7;

/** 冲击波速度（px/s）。 */
export const SHOCK_SPEED = 1000;
/** 冲击波振幅（px）。 */
export const SHOCK_AMPLITUDE = 20;
/** 冲击波波长（px）。 */
export const SHOCK_WAVELENGTH = 110;

/** 全屏滤镜组。 */
export interface ScreenFilters {
  /** 常驻 bloom —— 挂在 `glow` 层。 */
  readonly bloom: AdvancedBloomFilter;
  /** FEVER 色散 —— 挂在 `stage`（作用于**整个画面**）。 */
  readonly rgbSplit: RGBSplitFilter;
  /** 暴击冲击波 —— 挂在 `stage`。 */
  readonly shockwave: ShockwaveFilter;
}

/** 已创建的滤镜组数量（测试用：证明「只创建一次」）。 */
let createdCount = 0;

/** 已创建的滤镜组数量 —— 测试断言「滤镜实例不重建」用。 */
export function filterInstanceCount(): number {
  return createdCount;
}

/**
 * 全屏滤镜控制器 —— **滤镜实例的生命周期归它管**。
 *
 * ```
 * new ScreenFilterController()   ← 实例诞生（整个应用生命周期只有一次）
 * controller.apply(fx, vt)       ← 每帧只改参数
 * controller.destroy()           ← 卸载时销毁
 * ```
 *
 * 开关一律用 `filter.enabled = false`（**不是** `filters = null`）——
 * `filters` 数组一旦被换掉，Pixi 的 `FilterEffect` 会重建整条滤镜管线。
 */
export class ScreenFilterController implements ScreenFilters {
  /** 常驻 bloom —— 挂在 `glow` 层。 */
  readonly bloom: AdvancedBloomFilter;
  /** FEVER 色散 —— 挂在 `stage`（作用于**整个画面**）。 */
  readonly rgbSplit: RGBSplitFilter;
  /** 暴击冲击波 —— 挂在 `stage`。 */
  readonly shockwave: ShockwaveFilter;

  constructor() {
    // ── bloom（常驻） ───────────────────────────────────────
    const bloom = new AdvancedBloomFilter({
      threshold: BLOOM_THRESHOLD,
      bloomScale: BLOOM_SCALE,
      brightness: BLOOM_BRIGHTNESS,
      blur: BLOOM_BLUR,
      quality: BLOOM_QUALITY,
    });
    // `AdvancedBloomFilter` 的 options 里**没有** resolution —— 只能构造后赋值。
    bloom.resolution = BLOOM_RESOLUTION;
    // `padding` 恒为 0 —— 必须手设，否则辉光被裁。
    bloom.padding = BLOOM_PADDING;
    bloom.enabled = true;
    this.bloom = bloom;

    // ── 色散（条件启用） ───────────────────────────────────
    const rgbSplit = new RGBSplitFilter();
    // 换成自己的对象 —— 否则分量 setter 会改到 `DEFAULT_OPTIONS` 的共享对象上。
    rgbSplit.red = { x: 0, y: 0 };
    rgbSplit.green = { x: 0, y: 0 };
    rgbSplit.blue = { x: 0, y: 0 };
    rgbSplit.resolution = FILTER_RESOLUTION;
    rgbSplit.padding = FILTER_PADDING;
    rgbSplit.enabled = false;
    this.rgbSplit = rgbSplit;

    // ── 冲击波（条件启用） ─────────────────────────────────
    const shockwave = new ShockwaveFilter({
      speed: SHOCK_SPEED,
      amplitude: SHOCK_AMPLITUDE,
      wavelength: SHOCK_WAVELENGTH,
      brightness: 1,
      // `radius` 是像素，且波front 在 `t = radius / speed` 时到达它 ——
      // 所以 `radius = speed × SHOCK_LIFE`，波的生命周期与表现层的计时严格对齐。
      radius: SHOCK_SPEED * SHOCK_LIFE,
    });
    // 同上：换掉 `DEFAULT_OPTIONS.center` 的共享对象。
    shockwave.center = { x: 0, y: 0 };
    shockwave.resolution = FILTER_RESOLUTION;
    shockwave.padding = FILTER_PADDING;
    shockwave.enabled = false;
    this.shockwave = shockwave;

    createdCount += 1;
  }

  /**
   * 把表现层的 `ScreenFx` 映射到滤镜参数上。
   *
   * **只改参数，不重建实例**：
   *
   * - 色散用**分量 setter**（`redX` / `redY` …）——
   *   整体 setter（`red = {...}`）会替换 uniform 对象，插值就会丢。
   * - 冲击波的 `time` 必须**每帧推进**（由表现层计时，渲染层只搬运），
   *   `radius` 已在构造时按 `speed × SHOCK_LIFE` 设好，波不会扩到出屏。
   */
  apply(fx: ScreenFx, visualTime: number): void {
    // 色散：只有 FEVER 期间才开（`rgbSplit` 由表现层在进出 FEVER 时插值）。
    const split = this.rgbSplit;
    if (fx.rgbSplit > 0.001) {
      split.enabled = true;
      // 缓慢左右漂移（视觉时钟驱动，暂停时也继续漂 —— 它是氛围不是规则）。
      const drift = Math.sin(visualTime * 1.6);
      const amount = fx.rgbSplit * RGB_SPLIT_MAX;
      split.redX = -amount * (0.75 + 0.25 * drift);
      split.redY = amount * 0.3 * drift;
      split.greenX = 0;
      split.greenY = 0;
      split.blueX = amount * (0.75 - 0.25 * drift);
      split.blueY = -amount * 0.3 * drift;
    } else {
      split.enabled = false;
    }

    // 冲击波：暴击 / 双生同破时瞬时触发一次。
    const shock = this.shockwave;
    if (fx.shockLevel > 0) {
      shock.enabled = true;
      shock.time = fx.shockAge;
      shock.centerX = fx.shockX;
      shock.centerY = fx.shockY;
    } else {
      shock.enabled = false;
    }
  }

  /** 销毁（卸载时）。 */
  destroy(): void {
    this.bloom.destroy();
    this.rgbSplit.destroy();
    this.shockwave.destroy();
  }
}

/**
 * 造一组滤镜 —— 兼容旧调用点的工厂函数。
 *
 * 建议直接用 `new ScreenFilterController()`。
 */
export function createScreenFilters(): ScreenFilters {
  return new ScreenFilterController();
}
