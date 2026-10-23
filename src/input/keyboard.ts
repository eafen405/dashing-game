/**
 * 键盘输入 —— 桌面调试用。
 *
 * 照抄 `source.html:2566-2583`：
 *
 * ```
 * keydown:
 *   if (e.repeat) return;               // 长按不重复触发
 *   ↑ / W   → 开始界面：开始游戏；否则：上轨出刀
 *   ↓ / S   → 开始界面：开始游戏；否则：下轨出刀
 *   P       → running 暂停 / paused 恢复
 *   Enter / Space → 开始界面：开始游戏；结算界面：再来一局
 * keyup:
 *   ↑ / W   → release("key-top")
 *   ↓ / S   → release("key-bottom")
 * ```
 *
 * `keyup` 也要发 `Release` —— 长按怪靠它判失败（`source.html:2580-2583`）。
 */

import { DEFAULT_KEY_BINDINGS, type KeyBindings } from './keyBindings';
import { KEY_INPUT_ID, mapKeyDown, mapKeyUp } from './mapping';
import type { InputSink } from './types';

/** 键盘输入的接线参数。 */
export interface KeyboardInputOptions {
  /** 事件接收端。 */
  sink: InputSink;
  /** 当前是否停在开始界面。 */
  isStartScreen: () => boolean;
  /** 当前是否已结算。 */
  isOver: () => boolean;
  /** 开始界面上的「点击开始」。 */
  onStartFromTap: () => void;
  /** `P` 键：暂停 / 恢复切换。 */
  onTogglePause: () => void;
  /** 结算界面上的「再来一局」。 */
  onRestart: () => void;
  /** 当前是否停在菜单子屏（难度 / 玩法说明）。 */
  isInMenu?: () => boolean;
  /** 菜单里上下移动。 */
  onMenuMove?: (delta: -1 | 1) => void;
  /** 菜单里确认（选定当前项）。 */
  onMenuConfirm?: () => void;
  /** 菜单里返回上一层。 */
  onMenuBack?: () => void;
  /** 当前电脑端按键绑定（上下轨各 1–3 个）。 */
  getKeyBindings?: () => KeyBindings;
  /** 事件所在的 window（默认 `window`；测试时注入假实现）。 */
  win?: Window;
}

/**
 * 接上键盘输入。
 *
 * @returns 解绑函数（组件卸载时调用）。
 */
export function attachKeyboardInput(options: KeyboardInputOptions): () => void {
  const { sink, isStartScreen, isOver, onStartFromTap, onTogglePause, onRestart } = options;
  const win = options.win ?? window;

  const onKeyDown = (event: KeyboardEvent): void => {
    // 长按不重复触发（旧代码 `if (e.repeat) return;`）
    if (event.repeat) return;

    // 焦点在按钮上时，Enter / Space 的默认行为就是「点这个按钮」——
    // 交给浏览器，别抢。否则在开始界面上按 Enter 会**同时**
    // 「开始游戏」和「打开难度界面」（两件事都发生）。
    const target = event.target as Element | null;
    const focusOnControl = Boolean(target?.closest('button, a, input, select, textarea'));
    if (focusOnControl && (event.code === 'Enter' || event.code === 'Space')) return;

    const bindings = options.getKeyBindings?.() ?? DEFAULT_KEY_BINDINGS;
    const action = mapKeyDown(event.code, {
      isStartScreen: isStartScreen(),
      isOver: isOver(),
      inMenu: options.isInMenu?.() ?? false,
      bindings,
    });

    switch (action.type) {
      case 'press':
        sink.press(action.lane, KEY_INPUT_ID[action.lane]);
        break;
      case 'startFromTap':
        onStartFromTap();
        break;
      case 'togglePause':
        onTogglePause();
        break;
      case 'restart':
        onRestart();
        break;
      case 'menuMove':
        options.onMenuMove?.(action.delta);
        break;
      case 'menuConfirm':
        options.onMenuConfirm?.();
        break;
      case 'menuBack':
        options.onMenuBack?.();
        break;
      case 'none':
        break;
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    const action = mapKeyUp(event.code, options.getKeyBindings?.() ?? DEFAULT_KEY_BINDINGS);
    if (action.type === 'release') {
      sink.release(KEY_INPUT_ID[action.lane]);
    }
  };

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);

  return () => {
    win.removeEventListener('keydown', onKeyDown);
    win.removeEventListener('keyup', onKeyUp);
  };
}
