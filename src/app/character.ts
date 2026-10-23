/**
 * 角色偏好 —— `localStorage["dualrail_character"]`。
 *
 * 默认哲。和最高分 / 手法一样，`file://` 或隐私模式下 localStorage 可能不可用，
 * 读写都 try/catch；失败只影响「下次打开还记不记得」，不影响本局。
 */

import type { CharacterId } from '../game/types';

/** 角色偏好的存储键。 */
export const CHARACTER_STORAGE_KEY = 'dualrail_character';

/** 读取角色偏好；没有记录 / 值非法 / localStorage 不可用时回退到哲。 */
export function loadCharacterId(): CharacterId {
  try {
    const raw = localStorage.getItem(CHARACTER_STORAGE_KEY);
    return raw === 'rin' ? 'rin' : 'zhe';
  } catch {
    return 'zhe';
  }
}

/** 写入角色偏好。失败时静默（只在当前会话里生效）。 */
export function saveCharacterId(id: CharacterId): void {
  try {
    localStorage.setItem(CHARACTER_STORAGE_KEY, id);
  } catch {
    // localStorage 不可用 —— 记录只留在本次会话里
  }
}
