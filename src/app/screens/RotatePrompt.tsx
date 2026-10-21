/**
 * 竖屏提示 —— 旧 `#rotate`。
 *
 * 横屏才渲染游戏；这个界面固定在最上层，旋转后自动消失。
 */

import type { JSX } from 'react';

/** 竖屏提示。 */
export function RotatePrompt(): JSX.Element {
  return (
    <div className="rotate-screen">
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
