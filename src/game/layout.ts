/**
 * 战场几何布局 —— `source.html:534-577` `resize()` 的纯函数化。
 *
 * 规则层不碰 DOM，所以 `resize()` 里的「读 `getBoundingClientRect()` +
 * 写 `style`」被拆成两半：
 *   - 表现层负责量尺寸并调 `computeLayout(width, height, dpr)`
 *   - 表现层再把新布局喂回规则层（`Resize` 事件），由 `refitMonsters()`
 *     把在场怪物的尺寸重新贴合轨道
 */

import { CLUB_REACH_R } from './constants';
import { clamp } from './math';
import type { Layout, Monster } from './types';

/**
 * 计算战场布局（纯函数）。
 *
 * `playerX` 必须排在 `hitX` 之前：判定框中心挂在棒尖上
 * （`playerX + playerR * CLUB_REACH_R`），棒子多长，框就多远。
 * 旧实现的 `hitX` 是「屏幕宽度 34%」的固定远景，木棍根本够不到，
 * 现在不再沿用那套几何。
 *
 * 旧实现首次 `resize()` 时 `playerX` 恒为 0 的顺序 bug（D2）在这里也不存在：
 * 所有依赖都按 `playerR → playerX → hitW → zoneHalf → critHalf → hitX`
 * 的顺序从同一组入参算出来。
 */
export function computeLayout(width: number, height: number, dpr: number): Layout {
  const laneY = {
    top: height * 0.28,
    bottom: height * 0.72,
  };

  const playerR = clamp(height * 0.115, 22, 46);
  const playerX = Math.max(clamp(width * 0.085, 48, 120), playerR * 2.05 + 12);
  const hitW = clamp(width * 0.07, 58, 100);
  // 暴击区半宽 = 外圈半宽的一半：判定落在中心区间的概率约 50%
  const zoneHalf = hitW * 0.5 + clamp(width * 0.03, 16, 44);
  const critHalf = zoneHalf * 0.5;
  // 判定框中心 = 棒尖：实打实挥棍能碰到的地方才判定
  const hitX = playerX + playerR * CLUB_REACH_R;

  return { width, height, dpr, laneY, playerR, playerX, hitX, hitW, zoneHalf, critHalf };
}

/**
 * 让在场怪物重新贴合新轨道（`source.html:562-574`）。
 *
 * 长按怪只改长度 / 高度；普通怪与双生怪改宽高。两者都把 `y` 贴回轨道中心。
 */
export function refitMonsters(monsters: readonly Monster[], layout: Layout): Monster[] {
  const { width, height, laneY } = layout;
  return monsters.map((m) => {
    if (m.kind === 'hold') {
      const len = clamp(width * 0.26, 180, 300);
      return { ...m, y: laneY[m.lane], len, h: clamp(height * 0.1, 26, 44), w: len };
    }
    return {
      ...m,
      y: laneY[m.lane],
      w: clamp(width * 0.055, 40, 62),
      h: clamp(height * 0.17, 40, 78),
    };
  });
}
