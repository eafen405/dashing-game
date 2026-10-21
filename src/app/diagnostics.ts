/**
 * 产物自检用的全局标记。
 *
 * `scripts/verify-single-file.mjs` 在 `file://` 下等这个标记，确认真实应用
 * （而不是 Phase 0 spike）已经挂载。它只暴露「是否就绪」，不暴露内部状态。
 */

export interface GameDiagnostics {
  ready: boolean;
}

declare global {
  interface Window {
    __GAME__?: GameDiagnostics;
  }
}

/** 标记应用是否已经完成首帧挂载。 */
export function setGameReady(ready: boolean): void {
  window.__GAME__ = { ready };
}
