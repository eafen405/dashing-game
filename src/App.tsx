/**
 * 根组件 —— **渲染器选择**。
 *
 * `?renderer=canvas2d|pixi`：
 *   - `canvas2d`（默认）—— Canvas 2D 实现（票 04 交付）
 *   - `pixi` —— PixiJS v8 实现（票 06 交付；本阶段还没落地，先回退到 canvas2d）
 *
 * 参数位先留着（brief-04 §6），默认 `canvas2d`。
 *
 * 渲染器实例**只创建一次**（`useState` 的惰性初始化保证），
 * 卸载时由会话层 `dispose()` → `renderer.unmount()` 释放。
 */

import { useState } from 'react';
import type { ReactElement } from 'react';

import { createCanvas2dRenderer } from './battlefield/canvas2d';
import { GameApp } from './app/App';
import type { BattlefieldRenderer } from './battlefield/types';

/** 支持的渲染器参数值。 */
export type RendererKind = 'canvas2d' | 'pixi';

/** 从 URL 里读渲染器参数（默认 `canvas2d`）。 */
export function readRendererKind(search: string): RendererKind {
  const value = new URLSearchParams(search).get('renderer');
  return value === 'pixi' ? 'pixi' : 'canvas2d';
}

/** 根组件。 */
export default function App(): ReactElement {
  const [kind] = useState<RendererKind>(() =>
    typeof window === 'undefined' ? 'canvas2d' : readRendererKind(window.location.search),
  );
  const [renderer] = useState<BattlefieldRenderer>(() => {
    if (kind === 'pixi') {
      // PixiJS v8 实现是票 06 的交付物；在它落地之前回退到 Canvas 2D。
      console.warn('[dualrail] ?renderer=pixi 尚未实现（票 06），已回退到 canvas2d');
    }
    return createCanvas2dRenderer();
  });

  return <GameApp renderer={renderer} />;
}
