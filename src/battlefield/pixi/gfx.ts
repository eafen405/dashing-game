/**
 * Pixi v8 `Graphics` 的低层封装 —— 样式复用 + 路径复用。
 *
 * ## 为什么要这一层
 *
 * Pixi v8 的 `Graphics` 与 Canvas 2D 语义**不同**（`pixi-fx-spec.md` §5.3）：
 *
 * - `fill()` / `stroke()` **不是「结束当前路径」**，而是「把当前路径快照成一条渲染指令」。
 * - `fill()` 之后 `stroke()` → `stroke()` **复用 `fill` 的路径**（不用重画路径）。
 * - `stroke()` 之后 `stroke()` → **不复用**（`_activePath` 已被清空成单个 `moveTo`），
 *   会画出一条退化路径 —— **必须重画路径**。
 * - `fill()` 之后 `fill()` → 同样退化。
 *
 * 所以本模块提供两条纪律：
 *
 * 1. **同一形状要描边多次** → 用 `GraphicsPath` 把路径**存下来**，
 *    每次描边前 `beginPath()` + `context.path(p)` 重新挂上去。
 * 2. **样式对象复用** → `fill` / `stroke` 的样式参数用**模块级可变对象**，
 *    每帧只改字段，不新建对象（ADR-0004 的「每帧零分配」）。
 *
 * ## 调用顺序纪律（重要）
 *
 * `setFill` / `setStroke` 会把 `GraphicsContext._tick` 归零，
 * 而 `fill()` / `stroke()` 在 `_tick === 0` 时会走「复用上一条路径」的分支。
 * 因此**样式必须在画路径之前设置**：
 *
 * ```
 * setFill(g, '#fff', 0.5);   // _tick = 0
 * g.beginPath();             // 不改 _tick
 * g.circle(x, y, r);         // _tick > 0  → fill() 走 clone 分支，用的是新路径 ✓
 * g.fill();
 * ```
 *
 * 若把 `setFill` 放在画路径之后，`_tick` 被归零，`fill()` 可能复用**上一条**路径
 * （上一条若是 `stroke`，就会画错形状）。
 */

import { GraphicsPath } from 'pixi.js';
import type { FillGradient, Graphics } from 'pixi.js';

/** 纯色填充样式（可复用）。 */
interface FillSpec {
  color: string;
  alpha: number;
}

/** 渐变填充样式（可复用）。 */
interface GradientFillSpec {
  fill: FillGradient;
  alpha: number;
}

/** 纯色描边样式（可复用）。 */
interface StrokeSpec {
  width: number;
  color: string;
  alpha: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
}

/** 渐变描边样式（可复用）。 */
interface GradientStrokeSpec {
  fill: FillGradient;
  width: number;
  alpha: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
}

/**
 * 纯色填充的复用样式对象。
 *
 * 注意：渐变路径会**改写**传入对象（Pixi 内部把 `color` 置白、`texture` / `matrix` 填进去），
 * 所以纯色与渐变必须用**不同的**对象，互不污染。
 */
const fillSpec: FillSpec = { color: '#ffffff', alpha: 1 };

/** 渐变填充的复用样式对象。 */
const gradientFillSpec: GradientFillSpec = {
  fill: null as unknown as FillGradient,
  alpha: 1,
};

/** 纯色描边的复用样式对象。 */
const strokeSpec: StrokeSpec = {
  width: 1,
  color: '#ffffff',
  alpha: 1,
  cap: 'butt',
  join: 'miter',
};

/** 渐变描边的复用样式对象。 */
const gradientStrokeSpec: GradientStrokeSpec = {
  fill: null as unknown as FillGradient,
  width: 1,
  alpha: 1,
  cap: 'butt',
  join: 'miter',
};

/** 设置当前填充样式（纯色）。**必须在画路径之前调用。** */
export function setFill(g: Graphics, color: string, alpha = 1): void {
  fillSpec.color = color;
  fillSpec.alpha = alpha;
  g.setFillStyle(fillSpec);
}

/** 设置当前填充样式（渐变）。**必须在画路径之前调用。** */
export function setFillGradient(g: Graphics, gradient: FillGradient, alpha = 1): void {
  gradientFillSpec.fill = gradient;
  gradientFillSpec.alpha = alpha;
  g.setFillStyle(gradientFillSpec);
}

/** 设置当前描边样式（纯色）。**必须在画路径之前调用。** */
export function setStroke(
  g: Graphics,
  width: number,
  color: string,
  alpha = 1,
  cap: 'butt' | 'round' | 'square' = 'butt',
): void {
  strokeSpec.width = width;
  strokeSpec.color = color;
  strokeSpec.alpha = alpha;
  strokeSpec.cap = cap;
  g.setStrokeStyle(strokeSpec);
}

/** 设置当前描边样式（渐变）。**必须在画路径之前调用。** */
export function setStrokeGradient(
  g: Graphics,
  width: number,
  gradient: FillGradient,
  alpha = 1,
  cap: 'butt' | 'round' | 'square' = 'butt',
): void {
  gradientStrokeSpec.fill = gradient;
  gradientStrokeSpec.width = width;
  gradientStrokeSpec.alpha = alpha;
  gradientStrokeSpec.cap = cap;
  g.setStrokeStyle(gradientStrokeSpec);
}

/**
 * 把一条存好的路径挂到 `Graphics` 的当前路径上。
 *
 * `GraphicsPath` 是 v8 的**一等公民**（从 `pixi.js` 包根导出），
 * 可以先建好、反复复用 —— 这正是「同一形状描边多次」需要的。
 */
export function attachPath(g: Graphics, path: GraphicsPath): void {
  g.beginPath();
  g.context.path(path);
}

/** 圆（整圆）路径。 */
export function circlePath(cx: number, cy: number, r: number): GraphicsPath {
  const p = new GraphicsPath();
  p.circle(cx, cy, r);
  return p;
}

/**
 * 圆弧路径（**不闭合** —— 与 Canvas 2D 的 `ctx.arc` + `stroke()` 同口径）。
 *
 * 起点先 `moveTo` 到弧的起点：`GraphicsPath` 的 `arc` 指令是「从当前点连到弧的起点」，
 * 不先 `moveTo` 会多出一条从原点拉过去的直线。
 */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): GraphicsPath {
  const p = new GraphicsPath();
  arcInto(p, cx, cy, r, startAngle, endAngle);
  return p;
}

/** 扇形路径（闭合，中心在圆心）—— 用于挥击光幕。 */
export function sectorPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): GraphicsPath {
  const p = new GraphicsPath();
  p.moveTo(cx, cy);
  p.arc(cx, cy, r, startAngle, endAngle);
  p.closePath();
  return p;
}

/** 圆角矩形路径（4 段 `arcTo`，与 Canvas 2D 版的 `roundRectPath` 同口径）。 */
export function roundRectPath(x: number, y: number, w: number, h: number, r: number): GraphicsPath {
  const p = new GraphicsPath();
  roundRectInto(p, x, y, w, h, r);
  return p;
}

/** 8 顶点星形路径（4 个外点 + 4 个内点，首个顶点朝正上方）。 */
export function starPath(cx: number, cy: number, outer: number, inner: number): GraphicsPath {
  const p = new GraphicsPath();
  starInto(p, cx, cy, outer, inner);
  return p;
}

/** 多边形路径（点表 `[x0,y0, x1,y1, ...]`）。 */
export function polyPath(points: readonly number[]): GraphicsPath {
  const p = new GraphicsPath();
  polyInto(p, points);
  return p;
}

// ── 「Into」版本：往**已有的**路径里追加形状（路径对象可复用，零分配） ──

/** 往已有路径里追加一个圆。 */
export function circleInto(p: GraphicsPath, cx: number, cy: number, r: number): void {
  p.circle(cx, cy, r);
}

/** 往已有路径里追加一段圆弧（不闭合）。 */
export function arcInto(
  p: GraphicsPath,
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): void {
  p.moveTo(cx + Math.cos(startAngle) * r, cy + Math.sin(startAngle) * r);
  p.arc(cx, cy, r, startAngle, endAngle);
}

/** 往已有路径里追加一个扇形（闭合）。 */
export function sectorInto(
  p: GraphicsPath,
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): void {
  p.moveTo(cx, cy);
  p.arc(cx, cy, r, startAngle, endAngle);
  p.closePath();
}

/** 往已有路径里追加一个圆角矩形。 */
export function roundRectInto(
  p: GraphicsPath,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
}

/** 往已有路径里追加一个 8 顶点星形。 */
export function starInto(
  p: GraphicsPath,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
): void {
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) p.moveTo(px, py);
    else p.lineTo(px, py);
  }
  p.closePath();
}

/** 往已有路径里追加一个多边形（点表 `[x0,y0, x1,y1, ...]`）。 */
export function polyInto(p: GraphicsPath, points: readonly number[]): void {
  p.moveTo(points[0] as number, points[1] as number);
  for (let i = 2; i < points.length; i += 2) {
    p.lineTo(points[i] as number, points[i + 1] as number);
  }
  p.closePath();
}
