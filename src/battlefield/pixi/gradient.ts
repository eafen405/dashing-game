/**
 * 渐变工具 —— Pixi v8 `FillGradient` 的封装。
 *
 * ## 为什么用「局部归一化坐标」
 *
 * `FillGradient` 默认 `textureSpace: 'local'`：渐变坐标是**形状包围盒的归一化坐标**
 * （`(0,0)` = 包围盒左上角，`(1,1)` = 右下角）。
 *
 * 好处：
 *
 * - 渐变**跟着形状走**（形状动了、缩放了，渐变自动贴合）。
 * - 坐标与形状的实际像素尺寸无关 → **一个渐变实例可以复用于所有同类形状**，
 *   不需要每帧重建（Pixi v8.22 的 `FillGradient` **没有 `update()`**，
 *   改了 `colorStops` 也不会重建纹理 —— 想动颜色只能新建实例）。
 *
 * 代价：**形状的包围盒不能退化**（高度或宽度为 0 时归一化会除零）。
 * 所以带渐变的形状一律用**有面积的矩形 / 圆形**表达
 * （旧 Canvas 2D 版那些「零高度的水平线」在 Pixi 版改成细矩形，见各 view 的注释）。
 *
 * ## 动画 alpha 的处理
 *
 * Canvas 2D 版有些渐变的**色标 alpha 每帧在变**（脉冲）。
 * `FillGradient` 的色标是烘焙的，改不了 —— 所以做法是：
 *
 * - 渐变本体按**参考脉冲值**烘焙一次；
 * - 每帧的实时 alpha 用 `fill({ alpha })` 施加在**整体**上。
 *
 * 视觉差异 ≤ 一个脉冲区间的 1/2，肉眼不可见。
 */

import { FillGradient } from 'pixi.js';

/** 色标。 */
export interface GradientStop {
  /** 位置（0..1）。 */
  offset: number;
  /** 颜色（CSS 字符串，含 alpha 也可以）。 */
  color: string;
}

/**
 * 线性渐变（局部归一化坐标）。
 *
 * @param stops 色标
 * @param startX 起点 x（归一化）
 * @param startY 起点 y（归一化）
 * @param endX 终点 x（归一化）
 * @param endY 终点 y（归一化）
 */
export function linearGradient(
  stops: readonly GradientStop[],
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    colorStops: stops.map((s) => ({ offset: s.offset, color: s.color })),
    textureSpace: 'local',
  });
}

/**
 * 径向渐变（局部归一化坐标）。
 *
 * @param stops 色标
 * @param centerX 圆心 x（归一化）
 * @param centerY 圆心 y（归一化）
 * @param innerRadius 内圆半径（归一化；0 = 从圆心开始）
 * @param outerRadius 外圆半径（归一化；0.5 = 铺满包围盒的半宽）
 */
export function radialGradient(
  stops: readonly GradientStop[],
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
): FillGradient {
  return new FillGradient({
    type: 'radial',
    center: { x: centerX, y: centerY },
    innerRadius,
    outerCenter: { x: centerX, y: centerY },
    outerRadius,
    colorStops: stops.map((s) => ({ offset: s.offset, color: s.color })),
    textureSpace: 'local',
  });
}

/** 释放渐变（`FillGradient` 内部持有纹理，不释放会泄漏显存）。 */
export function destroyGradient(gradient: FillGradient | null): void {
  gradient?.destroy();
}
