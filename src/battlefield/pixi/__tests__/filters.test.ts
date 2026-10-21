/**
 * 全屏滤镜的契约测试 —— 票 07 的**次 seam**。
 *
 * 断言的是**滤镜的启用 / 禁用与参数插值**（FEVER 进出、暴击冲击波的瞬时触发），
 * 以及「滤镜实例只创建一次」这条硬约束。
 *
 * 运行环境是 Node（没有 WebGL）—— 这里只断言**不依赖 GPU 的那一半契约**：
 * 实例的生命周期、参数赋值、`enabled` 开关、uniform 对象不被替换。
 */

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { RGBSplitFilter } from 'pixi-filters/rgb-split';

import { SHOCK_LIFE, type ScreenFx } from '../../types';
import {
  BLOOM_PADDING,
  BLOOM_RESOLUTION,
  filterInstanceCount,
  ScreenFilterController,
  SHOCK_SPEED,
} from '../filters';

/**
 * Pixi 的 `GlProgram` 构造时会要一个 canvas 来问「显卡支持多高的精度」——
 * Node 环境没有 `document`，所以这里给一个**最小桩**：
 * canvas 的 `getContext` 返回 `null` → Pixi 退回 `mediump`（不影响本文件的断言）。
 */
beforeAll(() => {
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ getContext: () => null }),
  };
});

afterAll(() => {
  delete (globalThis as { document?: unknown }).document;
});

/** 一个「什么特效都没有」的 `ScreenFx`。 */
const IDLE: ScreenFx = {
  rgbSplit: 0,
  shockAge: 0,
  shockLevel: 0,
  shockX: 0,
  shockY: 0,
};

describe('全屏滤镜 · 实例生命周期', () => {
  it('滤镜实例只创建一次：多帧 apply 不新建实例', () => {
    const before = filterInstanceCount();
    const controller = new ScreenFilterController();
    const bloom = controller.bloom;
    const rgb = controller.rgbSplit;
    const shock = controller.shockwave;

    expect(filterInstanceCount()).toBe(before + 1);

    for (let i = 0; i < 600; i++) {
      controller.apply(
        {
          rgbSplit: i % 2 === 0 ? 0 : 1,
          shockAge: i * 0.001,
          shockLevel: i % 3 === 0 ? 2 : 0,
          shockX: 100,
          shockY: 200,
        },
        i * 0.016,
      );
    }

    // 600 帧之后还是同一批实例，计数没有增加
    expect(filterInstanceCount()).toBe(before + 1);
    expect(controller.bloom).toBe(bloom);
    expect(controller.rgbSplit).toBe(rgb);
    expect(controller.shockwave).toBe(shock);
  });

  it('bloom 常驻开启；色散 / 冲击波默认关闭', () => {
    const controller = new ScreenFilterController();

    expect(controller.bloom.enabled).toBe(true);
    expect(controller.rgbSplit.enabled).toBe(false);
    expect(controller.shockwave.enabled).toBe(false);
  });
});

describe('全屏滤镜 · bloom 的关键参数', () => {
  it('padding 必须手设（AdvancedBloomFilter 的 padding 恒为 0）', () => {
    const controller = new ScreenFilterController();

    expect(controller.bloom.padding).toBe(BLOOM_PADDING);
    expect(controller.bloom.padding).toBeGreaterThan(0);
  });

  it('resolution 与主画布分辨率解耦（0.5 → 像素量 1/4）', () => {
    const controller = new ScreenFilterController();

    expect(controller.bloom.resolution).toBe(BLOOM_RESOLUTION);
    expect(controller.bloom.resolution).toBe(0.5);
  });
});

describe('全屏滤镜 · 色散（条件启用 + 参数插值）', () => {
  it('rgbSplit = 0 时关闭，> 0 时开启', () => {
    const controller = new ScreenFilterController();

    controller.apply(IDLE, 0);
    expect(controller.rgbSplit.enabled).toBe(false);

    controller.apply({ ...IDLE, rgbSplit: 0.5 }, 0);
    expect(controller.rgbSplit.enabled).toBe(true);
  });

  it('逐帧插值用分量 setter —— uniform 对象不被替换', () => {
    const controller = new ScreenFilterController();
    const redBefore = controller.rgbSplit.uniforms.uRed;

    controller.apply({ ...IDLE, rgbSplit: 1 }, 0);
    controller.apply({ ...IDLE, rgbSplit: 0.5 }, 1.6);

    // 整体 setter（`red = {...}`）会替换这个对象；分量 setter 不会
    expect(controller.rgbSplit.uniforms.uRed).toBe(redBefore);
    // 分量确实被改了
    expect(controller.rgbSplit.redX).not.toBe(0);
  });

  it('不会污染 RGBSplitFilter 的全局默认对象', () => {
    const controller = new ScreenFilterController();

    controller.apply({ ...IDLE, rgbSplit: 1 }, 0);

    // `DEFAULT_OPTIONS.red` 是共享对象 —— 我们的实例必须用自己的一份
    const def = RGBSplitFilter.DEFAULT_OPTIONS.red as { x: number; y: number } | undefined;
    expect(def?.x).toBe(-10);
    expect(def?.y).toBe(0);
  });
});

describe('全屏滤镜 · 冲击波（瞬时触发）', () => {
  it('shockLevel = 0 时关闭，> 0 时开启并带上时间与中心', () => {
    const controller = new ScreenFilterController();

    controller.apply(IDLE, 0);
    expect(controller.shockwave.enabled).toBe(false);

    controller.apply({ ...IDLE, shockAge: 0.12, shockLevel: 1, shockX: 320, shockY: 180 }, 0);
    expect(controller.shockwave.enabled).toBe(true);
    expect(controller.shockwave.time).toBeCloseTo(0.12, 10);
    expect(controller.shockwave.centerX).toBe(320);
    expect(controller.shockwave.centerY).toBe(180);
  });

  it('time 每帧推进（否则没有波）', () => {
    const controller = new ScreenFilterController();

    controller.apply({ ...IDLE, shockAge: 0.1, shockLevel: 1 }, 0);
    const t1 = controller.shockwave.time;
    controller.apply({ ...IDLE, shockAge: 0.2, shockLevel: 1 }, 0);
    const t2 = controller.shockwave.time;

    expect(t2).toBeGreaterThan(t1);
  });

  it('radius 按 speed × 寿命设定（波不会一直扩到出屏）', () => {
    const controller = new ScreenFilterController();

    expect(controller.shockwave.radius).toBe(SHOCK_SPEED * SHOCK_LIFE);
    // 波front 在 t = radius / speed 时到达最大半径 = 寿命
    expect(controller.shockwave.radius / controller.shockwave.speed).toBeCloseTo(SHOCK_LIFE, 10);
  });
});
