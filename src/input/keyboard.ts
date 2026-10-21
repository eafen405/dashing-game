/**
 * 键盘输入映射 —— 旧实现 `source.html:2566-2585`。
 *
 * 这里只把按键翻译成**意图**；「开始 / 重开 / 暂停」等状态判断由会话层做。
 */

import type { Lane } from '../game/types';

/** 键盘意图。 */
export type KeyAction =
  | { type: 'press'; lane: Lane; inputId: string }
  | { type: 'release'; inputId: string }
  | { type: 'toggle-pause' }
  | { type: 'confirm' };

/** 按下（keydown）映射。 */
export function keyActionFor(code: string): KeyAction | null {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return { type: 'press', lane: 'top', inputId: 'key-top' };
    case 'ArrowDown':
    case 'KeyS':
      return { type: 'press', lane: 'bottom', inputId: 'key-bottom' };
    case 'KeyP':
      return { type: 'toggle-pause' };
    case 'Enter':
    case 'Space':
      return { type: 'confirm' };
    default:
      return null;
  }
}

/** 松开（keyup）映射：只处理两条轨道的长按释放。 */
export function releaseInputFor(code: string): string | null {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return 'key-top';
    case 'ArrowDown':
    case 'KeyS':
      return 'key-bottom';
    default:
      return null;
  }
}
