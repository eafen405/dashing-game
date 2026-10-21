/**
 * 跨局最高分 —— `localStorage["dualrail_best"]`。
 *
 * **key 不能改**：旧实现用的是这个键（`source.html:463` / `726`），
 * 换 key 等于把老玩家的记录丢掉。
 *
 * **读写都要 try/catch**：Safari 在 `file://` 下可能禁用 localStorage
 * （旧实现 `source.html:463` 已有先例），产物是单文件、`file://` 直接打开的。
 */

/** 最高分的存储键。 */
export const BEST_STORAGE_KEY = 'dualrail_best';

/** 读最高分；读不到（禁用 / 损坏）时返回 0。 */
export function loadBest(): number {
  try {
    return +(localStorage.getItem(BEST_STORAGE_KEY) || 0) || 0;
  } catch {
    // localStorage 不可用（Safari file://）—— 当作没有记录
    return 0;
  }
}

/**
 * 写入最高分。
 *
 * 只有**真的更高**才写（旧实现 `source.html:724`：`if (score > best)`）。
 *
 * @param score 本局分数。
 * @param current 当前最高分。
 * @returns 写完后的最高分。
 */
export function saveBest(score: number, current: number): number {
  if (score <= current) return current;
  try {
    localStorage.setItem(BEST_STORAGE_KEY, String(score));
  } catch {
    // localStorage 不可用 —— 记录只留在本次会话里
  }
  return score;
}
