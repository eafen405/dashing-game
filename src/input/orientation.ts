/**
 * 横竖屏检测 —— 旧实现 `source.html:500-531`。
 *
 * 旧代码用 `matchMedia` + `innerWidth/innerHeight` + `screen.orientation` 三重判断；
 * 这里保留前两条（`screen.orientation` 在部分内嵌浏览器里不可靠）。
 * 监听 `change` 与 `resize`，旋转后回调新状态。
 */

/** 当前是否为横屏。 */
export function isLandscape(): boolean {
  if (typeof window === 'undefined') return true;
  const mq = window.matchMedia?.('(orientation: landscape)');
  if (mq) return mq.matches;
  return window.innerWidth > window.innerHeight;
}

/**
 * 监听横竖屏变化。
 *
 * @returns 取消监听的函数。
 */
export function watchOrientation(onChange: (landscape: boolean) => void): () => void {
  const mq = window.matchMedia?.('(orientation: landscape)');
  const handler = (): void => onChange(isLandscape());

  if (mq) {
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', handler);
    else if (typeof mq.addListener === 'function') mq.addListener(handler);
  }
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);

  return () => {
    if (mq) {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', handler);
      else if (typeof mq.removeListener === 'function') mq.removeListener(handler);
    }
    window.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', handler);
  };
}
