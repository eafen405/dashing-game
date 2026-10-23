/**
 * 图层顺序 —— 自底向上。
 *
 * Pixi 版用**图层容器**承担旧 Canvas 2D 版 `draw()` 里的绘制顺序
 * （`source.html:1466-1477`）：
 *
 * ```
 * background → ground → rails → defense → entities → glow → floaters
 * ```
 *
 * - `background` —— 星空 + 中线
 * - `ground` —— 下轨脚下的大地（土层 / 碎石 / 草簇）
 * - `rails` —— 轨道底光带 / 主线 / 流动刻度
 * - `defense` —— 角色身前的防线
 * - `entities` —— 判定区 / 角色 / 双生锁链 / 怪物 / 刀光 / 环 / 粒子
 * - `glow` —— FEVER 全场氛围（**票 07 在这一层挂 bloom**）
 * - `floaters` —— 飘分文字
 *
 * `entities` 层内部还要复现旧代码的**遮挡关系**
 * （`drawHitZones → drawPlayer → drawPairLinks → drawMonsters → drawSlashes → drawRings → drawParticles`），
 * 由 `PixiRenderer` 往层里加子容器的顺序承担。
 *
 * 屏幕抖动由**根容器**承载所有图层，每帧只改 `root.position.set(dx, dy)`
 * （旧代码是 `ctx.translate` 施加在全部绘制内容上，`source.html:1463`）。
 */

/** 图层名（自底向上）。 */
export const LAYER_ORDER = [
  'background',
  'ground',
  'rails',
  'defense',
  'entities',
  'glow',
  'floaters',
] as const;

/** 图层名类型。 */
export type LayerName = (typeof LAYER_ORDER)[number];

/** 图层数量。 */
export const LAYER_COUNT = LAYER_ORDER.length;
