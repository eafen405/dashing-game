/**
 * 手机手法偏好 —— `localStorage["dualrail_control"]`。
 *
 * 默认 `vertical`（旧版上下半屏）。和最高分一样，`file://` / 隐私模式下
 * localStorage 可能不可用，读写都要 try/catch；失败时只影响「下次打开还记不记得」，
 * 不影响本局操作。
 */

import type { ControlMode } from '../input/mapping';

/** 手法偏好的存储键。 */
export const CONTROL_MODE_STORAGE_KEY = 'dualrail_control';

/** 读取手法偏好；没有记录 / 值非法 / localStorage 不可用时回退到上下点击。 */
export function loadControlMode(): ControlMode {
  try {
    const raw = localStorage.getItem(CONTROL_MODE_STORAGE_KEY);
    return raw === 'horizontal' ? 'horizontal' : 'vertical';
  } catch {
    return 'vertical';
  }
}

/** 写入手法偏好。失败时静默（只在当前会话里生效）。 */
export function saveControlMode(mode: ControlMode): void {
  try {
    localStorage.setItem(CONTROL_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage 不可用 —— 记录只留在本次会话里
  }
}
