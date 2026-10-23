/**
 * 输入映射 —— 纯函数（DOM 事件 → 规则层事件）。
 *
 * 这里放的是**判定逻辑**，一行 DOM 都不碰：
 *   - 半屏怎么算轨道（`source.html:2548-2551`）
 *   - 指针 / 键盘的输入 id 怎么拼（`source.html:2550` / `2569`）
 *   - 每个键做什么（`source.html:2566-2583`）
 *
 * DOM 绑定在 `pointer.ts` / `keyboard.ts`，它们只负责把事件喂给这里的函数。
 * 这样「输入行为」这条规则可以脱离浏览器单测。
 */

import type { Lane } from '../game/types';
import { DEFAULT_KEY_BINDINGS, laneForKeyCode, type KeyBindings } from './keyBindings';

/** 指针输入 id —— `source.html:2550` 的 `"p" + e.pointerId`。 */
export function pointerInputId(pointerId: number): string {
  return `p${pointerId}`;
}

/** 键盘输入 id —— `source.html:2569` 的 `"key-top"` / `"key-bottom"`。 */
export const KEY_INPUT_ID: Record<Lane, string> = {
  top: 'key-top',
  bottom: 'key-bottom',
};

/**
 * 手机端的点击手法。
 *
 * - `vertical` —— 点上半屏打上轨、点下半屏打下轨（默认 / 旧版行为）
 * - `horizontal` —— 点左半屏打上轨、点右半屏打下轨
 */
export type ControlMode = 'vertical' | 'horizontal';

/**
 * 半屏 → 轨道 —— `source.html:2548-2551`。
 *
 * 以舞台矩形为基准：上半（含）走上轨，下半走下轨。
 */
export function laneForY(clientY: number, rect: { top: number; height: number }): Lane {
  return clientY - rect.top < rect.height / 2 ? 'top' : 'bottom';
}

/**
 * 按当前手法把点击位置换算成轨道。
 *
 * `vertical` 沿用旧版的上下半屏；`horizontal` 改为左右半屏。
 * 中线统一归下半 / 右半（与旧版「正中间算下半」一致）。
 */
export function laneForPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  mode: ControlMode,
): Lane {
  if (mode === 'horizontal') {
    return clientX - rect.left < rect.width / 2 ? 'top' : 'bottom';
  }
  return laneForY(clientY, rect);
}

/** 游戏内轨道提示文案（跟随手法切换）。 */
export const LANE_HINT: Record<ControlMode, Record<Lane, string>> = {
  vertical: {
    top: '上半屏 · 上轨',
    bottom: '下半屏 · 下轨',
  },
  horizontal: {
    top: '左半屏 · 上轨',
    bottom: '右半屏 · 下轨',
  },
};

/** 键盘动作。 */
export type KeyAction =
  /** 按下半屏。 */
  | { type: 'press'; lane: Lane }
  /** 松开按键。 */
  | { type: 'release'; lane: Lane }
  /** 开始界面上的「点击开始」。 */
  | { type: 'startFromTap' }
  /** 暂停 / 恢复切换。 */
  | { type: 'togglePause' }
  /** 结算界面上的「再来一局」。 */
  | { type: 'restart' }
  /** 菜单里上下移动（`delta` 为 -1 上 / 1 下）。 */
  | { type: 'menuMove'; delta: -1 | 1 }
  /** 菜单里确认（选定当前项）。 */
  | { type: 'menuConfirm' }
  /** 菜单里返回上一层。 */
  | { type: 'menuBack' }
  /** 不做任何事。 */
  | { type: 'none' };

/** 键盘映射需要的上下文。 */
export interface KeyContext {
  /** 当前是否停在开始界面（旧实现的 `inStartScreen()`）。 */
  isStartScreen: boolean;
  /** 当前是否已结算。 */
  isOver: boolean;
  /**
   * 当前是否停在**菜单子屏**（难度 / 玩法说明 / 按键设置）。
   *
   * 菜单屏上 `↑` / `↓` 不是出刀，而是**在列表里移动** ——
   * 菜单屏处于规则层的 `idle`，出刀本来就是空操作。
   */
  inMenu?: boolean;
  /**
   * 当前按键绑定（电脑端可自定义）。
   *
   * 不传时用默认的 ↑/W、↓/S —— 单测与旧路径不用改。
   */
  bindings?: KeyBindings;
}

/**
 * `keydown` 映射 —— `source.html:2566-2578`。
 *
 * 逐条照抄：
 *   - `↑` / `W` → 开始界面上是「开始」，否则上轨出刀（默认绑定，可被 `ctx.bindings` 覆盖）
 *   - `↓` / `S` → 开始界面上是「开始」，否则下轨出刀（默认绑定，可被 `ctx.bindings` 覆盖）
 *   - `P` → 暂停 / 恢复切换
 *   - `Enter` / `Space` → 开始界面上是「开始」；结算界面上是「再来一局」
 *
 * **菜单子屏（`inMenu`）优先**：那里 `↑` / `↓` 用来在列表里移动，
 * `Enter` / `Space` 确认，`Esc` / `Backspace` 返回。
 */
export function mapKeyDown(code: string, ctx: KeyContext): KeyAction {
  if (ctx.inMenu) {
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        return { type: 'menuMove', delta: -1 };
      case 'ArrowDown':
      case 'KeyS':
        return { type: 'menuMove', delta: 1 };
      case 'Enter':
      case 'Space':
        return { type: 'menuConfirm' };
      case 'Escape':
      case 'Backspace':
        return { type: 'menuBack' };
      default:
        // 菜单屏不接出刀键 —— 自定义键在这里也不该让背后的轨道闪一下。
        // `P` 仍沿用旧行为（菜单停在 idle，切换暂停本身是空操作）。
        return code === 'KeyP' ? { type: 'togglePause' } : { type: 'none' };
    }
  }

  // 游戏自己占用的键优先于自定义绑定（绑定界面也不允许占用它们）。
  switch (code) {
    case 'KeyP':
      return { type: 'togglePause' };
    case 'Enter':
    case 'Space':
      if (ctx.isStartScreen) return { type: 'startFromTap' };
      if (ctx.isOver) return { type: 'restart' };
      return { type: 'none' };
    default:
      break;
  }

  const bindings = ctx.bindings ?? DEFAULT_KEY_BINDINGS;
  const lane = laneForKeyCode(code, bindings);
  if (lane === null || ctx.isOver) return { type: 'none' };
  return ctx.isStartScreen ? { type: 'startFromTap' } : { type: 'press', lane };
}

/**
 * `keyup` 映射 —— `source.html:2580-2583`。
 *
 * 键盘也要发 `Release` —— 长按怪靠它判失败。
 */
export function mapKeyUp(code: string, bindings: KeyBindings = DEFAULT_KEY_BINDINGS): KeyAction {
  const lane = laneForKeyCode(code, bindings);
  return lane === null ? { type: 'none' } : { type: 'release', lane };
}
