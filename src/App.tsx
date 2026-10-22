/**
 * 根组件 —— PixiJS v8 是唯一渲染路径（票 08 收口）。
 *
 * 已删除 Canvas 2D 实现与 `?renderer=` 分支。`BattlefieldRenderer` 接口保留 ——
 * 它仍是有意义的抽象边界，未来换渲染器不必改规则层与表现层。
 *
 * 渲染器实例**只创建一次**（`useState` 的惰性初始化保证），
 * 卸载时由会话层 `dispose()` → `renderer.unmount()` 释放。
 */

import { useState } from 'react';
import type { ReactElement } from 'react';

import { createPixiRenderer } from './battlefield/pixi';
import { GameApp } from './app/App';
import type { BattlefieldRenderer } from './battlefield/types';

/** 根组件。 */
export default function App(): ReactElement {
  const [renderer] = useState<BattlefieldRenderer>(() => createPixiRenderer());

  return <GameApp renderer={renderer} />;
}
