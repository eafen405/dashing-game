/**
 * 路径与颜色工具 —— 逐字搬自 `source.html:1961-1981` / `2502-2506`。
 *
 * `starPath` / `roundRectPath` 只**构造路径**，不填充也不描边 ——
 * 调用方紧接着自己 `fill()` / `stroke()`（旧代码的用法逐字保留）。
 */

/**
 * `#rrggbb` + alpha → `rgba(...)` —— `source.html:2502-2506`。
 *
 * **只接受 6 位十六进制**（`hex.slice(1)` + `parseInt(...,16)`），
 * 传 `#fff` 会得到错误结果。旧代码所有入参都是 6 位，安全。
 *
 * alpha **不做格式化**（`0.16 + pulse*0.09` 会原样拼进字符串）——
 * 改了会让颜色与旧版对不上。
 */
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

/**
 * 8 顶点星形路径（4 个外点 + 4 个内点）—— `source.html:1961-1971`。
 *
 * 首个顶点朝**正上方**（`-Math.PI/2`）。
 */
export function starPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * 圆角矩形路径（4 段 `arcTo`）—— `source.html:1973-1981`。
 *
 * 注意是 `arcTo` 而**不是** `ctx.roundRect` —— 两者的半径钳制规则不同，
 * 旧代码所有调用都传 `r = 9`（18px 高的胶囊标签底板），恰好 `r = h/2`。
 */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
