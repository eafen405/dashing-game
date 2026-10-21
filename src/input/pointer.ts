/**
 * 指针输入 —— 整屏点击 → 上轨 / 下轨。
 *
 * 照抄 `source.html:2536-2563`：
 *
 * ```
 * stage.addEventListener("pointerdown", …)   // 整屏点击，开始界面也能接收
 *   ├─ 命中排除目标 → 直接返回
 *   ├─ 在开始界面 → preventDefault + 开始游戏
 *   ├─ 不在 running → 返回
 *   └─ 按 y 落在上半还是下半 → pressLane(lane, "p" + pointerId)
 * window.addEventListener("pointerup",     …) → releaseHold("p" + pointerId)
 * window.addEventListener("pointercancel", …) → releaseHold("p" + pointerId)
 * window.addEventListener("blur",          …) → cancelHold()
 * ```
 *
 * **排除目标的等价实现**：旧代码用 `e.target.closest("#btnPause")` 这类
 * 选择器排除按钮。React 版里这些是组件，但组件渲染出来的 DOM 节点**照样会冒泡**
 * 到舞台的 `pointerdown`（事件沿 DOM 树冒泡，React 只影响状态更新路径），
 * 所以必须显式排除。做法是给这些节点打 `data-no-strike` 标记，
 * 这里查这个标记 —— 语义与旧代码的 `closest(...)` 排除列表一一对应。
 */

import { laneForY, pointerInputId } from './mapping';
import type { InputSink } from './types';

/** 「不要触发出刀」标记 —— 旧代码排除列表（暂停 / 结算 / 重开 / 难度选择 / 顶栏按钮）的等价物。 */
export const NO_STRIKE_ATTR = 'data-no-strike';

/** 指针输入的接线参数。 */
export interface PointerInputOptions {
  /** 舞台元素（点击命中区）。 */
  stage: HTMLElement;
  /** 事件接收端。 */
  sink: InputSink;
  /** 当前是否停在开始界面。 */
  isStartScreen: () => boolean;
  /** 开始界面上的「点击开始」。 */
  onStartFromTap: () => void;
  /** 事件所在的 window（默认 `window`；测试时注入假实现）。 */
  win?: Window;
}

/** 这个事件目标是否被排除（按钮 / 遮罩）。 */
export function isExcludedTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as Element;
  if (typeof el.closest !== 'function') return false;
  return el.closest(`[${NO_STRIKE_ATTR}]`) !== null;
}

/**
 * 接上指针输入。
 *
 * @returns 解绑函数（组件卸载时调用）。
 */
export function attachPointerInput(options: PointerInputOptions): () => void {
  const { stage, sink, isStartScreen, onStartFromTap } = options;
  const win = options.win ?? window;

  const onPointerDown = (event: PointerEvent): void => {
    if (isExcludedTarget(event.target)) return;

    if (isStartScreen()) {
      event.preventDefault();
      onStartFromTap();
      return;
    }

    const rect = stage.getBoundingClientRect();
    const lane = laneForY(event.clientY, rect);
    sink.press(lane, pointerInputId(event.pointerId));
  };

  const onPointerUp = (event: PointerEvent): void => {
    sink.release(pointerInputId(event.pointerId));
  };

  const onBlur = (): void => {
    sink.cancelHold();
  };

  stage.addEventListener('pointerdown', onPointerDown, { passive: false });
  win.addEventListener('pointerup', onPointerUp);
  win.addEventListener('pointercancel', onPointerUp);
  win.addEventListener('blur', onBlur);

  return () => {
    stage.removeEventListener('pointerdown', onPointerDown);
    win.removeEventListener('pointerup', onPointerUp);
    win.removeEventListener('pointercancel', onPointerUp);
    win.removeEventListener('blur', onBlur);
  };
}
