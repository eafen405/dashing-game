/**
 * 竖屏提示 —— 旧实现的 `#rotate`（`source.html:284-289`）。
 *
 * 旧代码用 `body.landscape` 类切换（`source.html:506-515`）；
 * React 版用条件 class 等价实现 —— **游戏组件始终挂载**，
 * 这样旋转前后的局面不会因为卸载而丢失（旧代码也是这么做的：`#game` 只是被隐藏）。
 */

import type { ReactElement } from 'react';

/** 竖屏提示。 */
export function RotatePrompt(): ReactElement {
  return (
    <div className="rotate">
      <div className="phone" />
      <h1>请横屏游玩</h1>
      <p>
        本游戏仅支持横屏手机端
        <br />
        请将手机旋转至横向
      </p>
      <div className="pill">检测到竖屏 · 旋转后自动进入游戏</div>
    </div>
  );
}
