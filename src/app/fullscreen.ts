/**
 * 全屏切换 —— 旧 `source.html:2587-2604`。
 *
 * 只做浏览器能力检查与异常吞掉；失败时保持窗口模式，不打扰玩家。
 */

/** 当前环境是否支持全屏。 */
export function canFullscreen(): boolean {
  return typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen);
}

/** 切换全屏（并尝试锁定横屏，失败忽略）。 */
export function toggleFullscreen(): void {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement) {
      const request = el.requestFullscreen?.bind(el);
      if (!request) return;
      void request({ navigationUI: 'hide' })
        .then(() => {
          const orientation = screen.orientation as unknown as
            { lock?: (mode: string) => Promise<void> } | undefined;
          void orientation?.lock?.('landscape').catch(() => {
            // 部分浏览器不支持锁定方向 —— 忽略
          });
        })
        .catch(() => {
          // 用户拒绝 / 权限策略禁止 —— 忽略
        });
    } else {
      void document.exitFullscreen().catch(() => {
        // 已经退出或不可用 —— 忽略
      });
    }
  } catch {
    // 老浏览器没有 requestFullscreen —— 保持窗口模式
  }
}
