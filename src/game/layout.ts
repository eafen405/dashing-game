/**
 * 战场几何布局 —— `source.html:534-577` `resize()` 的纯函数化。
 *
 * 规则层不碰 DOM，所以 `resize()` 里的「读 `getBoundingClientRect()` +
 * 写 `style`」被拆成两半：
 *   - 表现层负责量尺寸并调 `computeLayout(width, height, dpr)`
 *   - 表现层再把新布局喂回规则层（`Resize` 事件），由 `refitMonsters()`
 *     把在场怪物的尺寸重新贴合轨道
 */

import { clamp } from './math';
import type { Layout, Monster } from './types';

/**
 * 计算战场布局（纯函数）。
 *
 * **已知差异 D2**（`legacy-semantics.md` §8）：旧实现里 `hitX` 在 `playerX`
 * **之前**算出来（`source.html:555` 用到 `560` 行才算出的 `playerX`），
 * 所以首次 `resize()` 时 `playerX` 恒为 0，`hitX` 会少算一段；
 * 第二次起 `hitX` 用的是**上一次**的 `playerX`。
 * 纯函数化后按**正确顺序**重算：`playerR → playerX → hitX → hitW →
 * zoneHalf → critHalf`，因此 `hitX` 与 `playerX` 始终自洽。
 */
export function computeLayout(width: number, height: number, dpr: number): Layout {
  const laneY = {
    top: height * 0.28,
    bottom: height * 0.72,
  };

  const playerR = clamp(height * 0.115, 22, 46);
  const playerX = Math.max(clamp(width * 0.085, 48, 120), playerR * 2.05 + 12);
  // 依赖 playerX，所以必须排在 playerX 之后（旧代码这里是顺序 bug，见上方 D2 说明）
  const hitX = Math.max(clamp(width * 0.34, 150, 430), playerX + playerR * 2.6 + 120);
  const hitW = clamp(width * 0.07, 58, 100);
  // 暴击区半宽 = 外圈半宽的一半：判定落在中心区间的概率约 50%
  const zoneHalf = hitW * 0.5 + clamp(width * 0.03, 16, 44);
  const critHalf = zoneHalf * 0.5;

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
