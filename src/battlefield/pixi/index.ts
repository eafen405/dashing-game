/**
 * PixiJS v8 战场渲染器 —— 票 06 的对外出口。
 *
 * ```ts
 * const renderer = createPixiRenderer();
 * await renderer.mount(hostEl);   // Pixi 需要等 GPU 初始化 —— mount 是异步的
 * renderer.resize(layout);
 * renderer.render(frame);
 * ```
 *
 * 这里是「规则层 / 表现层 / 战场层」三层之间唯一的接缝
 * （`src/battlefield/types.ts` 的 `BattlefieldRenderer`）。
 * 渲染层**只依赖规则层的类型**（`Layout` / `Monster` / `Lane`），不 import 任何规则函数。
 */

import type { BattlefieldRenderer } from '../types';
import { PixiRenderer } from './PixiRenderer';

export { PixiRenderer };
export { LAYER_ORDER, type LayerName } from './layers';
export {
  FRENZY_BOTTOM,
  FRENZY_TOP,
  GOLD,
  LANE_BOTTOM,
  LANE_TOP,
  LONG_COLOR,
  PAIR_COLOR,
  hexA,
  laneColorOf,
} from './palette';

/**
 * 造一个 PixiJS v8 渲染器。
 *
 * `mount()` 是**异步**的（Pixi 要等 GPU 初始化）——
 * 这是接口保留 `void | Promise<void>` 的原因。
 */
export function createPixiRenderer(): BattlefieldRenderer {
  return new PixiRenderer();
}
