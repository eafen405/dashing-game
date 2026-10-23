/**
 * 数值小工具 —— 逐字搬自 `source.html:494`。
 */

/** 把 `v` 钳制到 `[a, b]`。 */
export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
