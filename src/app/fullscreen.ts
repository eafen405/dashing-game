/**
 * 全屏切换 —— 旧 `source.html:2587-2597`。
 *
 * 只做浏览器能力检查与异常吞掉；失败时保持窗口模式，不打扰玩家。
 *
 * **这里是全屏逻辑的唯一实现** —— `App.tsx` 只调用本模块，
 * 不在自己身上再写一份（此前两份并存，改一处就会漏另一处）。
 *
 * 行为口径照旧版 `source.html:2587-2597` 与现行产品实现：
 * 请求返回的 Promise **不挂 `.catch`**（被拒绝时由浏览器自己在控制台报，
 * 不影响游戏）—— 要改这条得先想清楚「拒绝全屏」时该给玩家什么反馈。
 */

/**
 * 当前环境是否支持全屏。
 *
 * 标准 API 与旧版 `webkit` 前缀都算数 —— 旧版 `source.html` 也是这么判的
 * （`document.documentElement.requestFullscreen || ....webkitRequestFullscreen`）。
 */
function canFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as unknown as {
    requestFullscreen?: unknown;
    webkitRequestFullscreen?: unknown;
  };
  return Boolean(el.requestFullscreen ?? el.webkitRequestFullscreen);
}

/** 切换全屏（并尝试锁定横屏，失败忽略）。 */
export function toggleFullscreen(): void {
  const el = document.documentElement as unknown as {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
    webkitRequestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  };
  try {
    if (!document.fullscreenElement) {
      if (!canFullscreen()) return;
      const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
      if (!request) return;
      void request.call(el, { navigationUI: 'hide' } as FullscreenOptions);
      lockLandscape();
    } else {
      const exit =
        document.exitFullscreen ??
        (document as unknown as { webkitExitFullscreen?: () => Promise<void> })
          .webkitExitFullscreen;
      if (exit) void exit.call(document);
    }
  } catch {
    // 全屏被拒绝（同步抛错）—— 忽略
  }
}

/** 锁定横屏（`screen.orientation.lock` 是移动端专有 API，TS 的 DOM lib 里没有）。 */
function lockLandscape(): void {
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  if (typeof orientation.lock !== 'function') return;
  try {
    void orientation.lock('landscape').catch(() => undefined);
  } catch {
    // 锁定失败 —— 忽略
  }
}
