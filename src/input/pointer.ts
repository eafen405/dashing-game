/**
 * 指针输入 → 轨道。
 *
 * 规则层不认识 DOM，所以这里只做「屏幕坐标 → 游戏语义」的翻译；
 * 真正的 `Press` / `Release` 事件由会话层发给规则层。
 */

import type { Lane } from '../game/types';

/** 指针事件里与本模块相关的最小字段。 */
export interface PointerLike {
  clientY: number;
  pointerId: number;
  pointerType?: string;
  button?: number;
}

/** 舞台的纵向范围（`getBoundingClientRect()` 的子集）。 */
export interface StageRect {
  top: number;
  height: number;
}

/**
 * 根据点击位置判断轨道 —— 旧实现 `source.html:2541-2544` 的
 * 「上半屏 → 上轨，下半屏 → 下轨」。
 *
 * 返回 `null` 表示点在舞台之外（例如拖拽出界）。
 */
export function laneFromClientY(clientY: number, rect: StageRect): Lane | null {
  if (!(rect.height > 0)) return null;
  const y = clientY - rect.top;
  if (y < 0 || y > rect.height) return null;
  return y < rect.height / 2 ? 'top' : 'bottom';
}

/** 指针 id → 规则层的 `inputId`（旧实现 `"p" + e.pointerId`）。 */
export function pointerInputId(event: PointerLike): string {
  return `p${event.pointerId}`;
}

/** 鼠标只认左键；触摸 / 笔没有 button 语义。 */
export function isPrimaryPointer(event: PointerLike): boolean {
  if (event.pointerType === 'mouse') return (event.button ?? 0) === 0;
  return true;
}
