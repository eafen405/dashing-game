/**
 * Canvas 2D 战场渲染器 —— 票 04 的对外出口。
 *
 * ```ts
 * const renderer = createCanvas2dRenderer();
 * renderer.mount(hostEl);
 * renderer.resize(layout);
 * renderer.render(frame);
 * ```
 *
 * 这里是「规则层 / 表现层 / 战场层」三层之间唯一的接缝
 * （`src/battlefield/types.ts` 的 `BattlefieldRenderer`）。
 * 渲染层**只依赖规则层的类型**（`Layout` / `Monster` / `Lane`），不 import 任何规则函数。
 */

import type { BattlefieldRenderer } from '../types';
import { Canvas2dRenderer } from './renderer';

export { Canvas2dRenderer };

/**
 * 造一个 Canvas 2D 渲染器。
 *
 * `mount()` 是同步的（Canvas 2D 不需要等 GPU 初始化）；
 * PixiJS v8 的实现会是异步的 —— 那是接口保留 `void | Promise<void>` 的原因。
 */
export function createCanvas2dRenderer(): BattlefieldRenderer {
  return new Canvas2dRenderer();
}
