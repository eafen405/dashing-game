/**
 * 横竖屏 / 切后台 —— 暂停与恢复。
 *
 * 照抄 `source.html:500-531`（横竖屏）与 `2658-2660`（切后台）：
 *
 * ```
 * updateOrientation():
 *   mq = matchMedia("(orientation: landscape)")
 *   isLandscape = mq.matches
 *              || window.innerWidth > window.innerHeight
 *              || /landscape/i.test(screen.orientation.type)
 *   横屏 → 若「因竖屏暂停过」且当前是 paused → 恢复
 *   竖屏 → 若当前是 running → 暂停，并记下「因竖屏暂停」
 * ```
 *
 * 三重兜底（媒体查询 / 宽高比 / `screen.orientation`）是刻意的：
 * 移动端浏览器对 `orientation` 媒体查询的支持参差不齐，单靠一条会漏。
 *
 * 另外 `visibilitychange`（切后台）→ 暂停，理由与旧代码一致：
 * 后台标签页的 rAF 会被节流，回到前台时局面已经不对了。
 *
 * **旧代码的 `setTimeout(resize, 70/260)` 兜底不搬**：布局改用 `ResizeObserver`
 * （见 brief-04 §5），定时器兜底反而制造难以清理的悬挂副作用。
 */

import type { InputSink } from './types';

/** 横竖屏监听的接线参数。 */
export interface OrientationOptions {
  /** 当前是否在游戏中（running）。 */
  isRunning: () => boolean;
  /** 当前是否已暂停。 */
  isPaused: () => boolean;
  /** 暂停。 */
  pause: () => void;
  /** 恢复。 */
  resume: () => void;
  /** 通知横竖屏变化（用于切换「请横屏游玩」提示）。 */
  onLandscapeChange?: (landscape: boolean) => void;
  /** 事件所在的 window（默认 `window`；测试时注入假实现）。 */
  win?: Window;
}

/**
 * 判断当前是否横屏 —— `source.html:501-504`。
 *
 * 三重兜底：媒体查询 → 宽高比 → `screen.orientation.type`。
 */
export function detectLandscape(win: Window): boolean {
  const mq = typeof win.matchMedia === 'function' ? win.matchMedia('(orientation: landscape)') : null;
  const orientationType = win.screen?.orientation?.type ?? '';
  return (
    (mq?.matches ?? false) ||
    win.innerWidth > win.innerHeight ||
    /landscape/i.test(orientationType)
  );
}

/**
 * 接上横竖屏 / 切后台监听。
 *
 * @returns 解绑函数（组件卸载时调用）。
 */
export function attachOrientationWatcher(options: OrientationOptions): () => void {
  const { isRunning, isPaused, pause, resume, onLandscapeChange } = options;
  const win = options.win ?? window;

  // 「因竖屏而暂停」标记 —— 与旧代码的 `pausedByOrientation` 同义。
  // 只有「因竖屏暂停的」才在转回横屏时自动恢复；玩家手动暂停的不该被自动恢复。
  let pausedByOrientation = false;

  const update = (): void => {
    const landscape = detectLandscape(win);
    onLandscapeChange?.(landscape);

    if (landscape) {
      if (pausedByOrientation && isPaused()) {
        pausedByOrientation = false;
        resume();
      }
      return;
    }

    if (isRunning()) {
      pausedByOrientation = true;
      pause();
    }
  };

  const onVisibilityChange = (): void => {
    const doc = win.document;
    if (doc?.hidden && isRunning()) pause();
  };

  const mq = typeof win.matchMedia === 'function' ? win.matchMedia('(orientation: landscape)') : null;

  win.addEventListener('orientationchange', update);
  win.addEventListener('resize', update);
  mq?.addEventListener?.('change', update);
  win.screen?.orientation?.addEventListener?.('change', update);
  win.document?.addEventListener('visibilitychange', onVisibilityChange);

  // 初始状态对齐一次（旧代码在启动时调了一次 `updateOrientation()`）
  update();

  return () => {
    win.removeEventListener('orientationchange', update);
    win.removeEventListener('resize', update);
    mq?.removeEventListener?.('change', update);
    win.screen?.orientation?.removeEventListener?.('change', update);
    win.document?.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

/** `InputSink` 的空实现 —— 给只需要方向信息、不需要长按的场景用。 */
export const NOOP_INPUT_SINK: InputSink = {
  press: () => undefined,
  release: () => undefined,
  cancelHold: () => undefined,
};
