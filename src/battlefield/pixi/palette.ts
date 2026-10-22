/**
 * 战场配色 —— Pixi 侧的色彩常量。
 *
 * **这套配色不得改**（ADR-0001 附带决定：保持赛博霓虹）。
 * 语义对应 `GLOSSARY.md`：
 *
 * | 常量 | 色值 | 语义 |
 * | --- | --- | --- |
 * | `GOLD` | `#ffd24a` | 得分 / 暴击圈 |
 * | `PAIR_COLOR` | `#ff5ecb` | 双生（锁链、伙伴光环） |
 * | `LONG_COLOR` | `#a6ff5e` | 长按怪 |
 * | `LANE_TOP` | `#4fd1ff` | 上轨 |
 * | `LANE_BOTTOM` | `#ff8a4f` | 下轨 |
 * | `FRENZY_TOP` | `#ffd24a` | FEVER 上轨（亮金） |
 * | `FRENZY_BOTTOM` | `#ff9a2e` | FEVER 下轨（琥珀金） |
 *
 * 值本身来自规则层常量（`src/game/constants.ts`）—— 渲染层**只依赖规则层的常量**，
 * 不重新定义一份数字，避免两处漂移。测试直接断言这里的字面量，
 * 规则层一旦改色就会红。
 */

import {
  FRENZY_LANE,
  GOLD as RULE_GOLD,
  LANE,
  LONG_COLOR as RULE_LONG_COLOR,
  PAIR_COLOR as RULE_PAIR_COLOR,
  laneColorOf,
} from '../../game/constants';

/** 得分金 —— 得分飘字、暴击判定圈。 */
export const GOLD = RULE_GOLD;

/** 双生粉 —— 锁链、伙伴光环、双生标签。 */
export const PAIR_COLOR = RULE_PAIR_COLOR;

/** 长按绿 —— 长按怪本体、进度槽、提示标签。 */
export const LONG_COLOR = RULE_LONG_COLOR;

/** 上轨青。 */
export const LANE_TOP = LANE.top.color;

/** 下轨橙。 */
export const LANE_BOTTOM = LANE.bottom.color;

/** FEVER 上轨亮金。 */
export const FRENZY_TOP = FRENZY_LANE.top;

/** FEVER 下轨琥珀金。 */
export const FRENZY_BOTTOM = FRENZY_LANE.bottom;

/**
 * 某条轨道当前的配色。
 *
 * FEVER 时两轨仍保留区分度（上轨亮金 / 下轨琥珀金）。
 *
 * **实现住在规则层**（`game/constants.ts` 的 `laneColorOf`）——
 * 规则层给爆散 / 冲击环 / 提示条上色时用的是同一个函数，两边不许各抄一份。
 * 这里只做转发，战场层其余模块照旧从 `./palette` 取。
 */
export { laneColorOf };

/**
 * `#rrggbb` + alpha → `rgba(...)` —— 逐字搬自 `source.html:2502-2506`。
 *
 * **只接受 6 位十六进制**（`hex.slice(1)` + `parseInt(...,16)`），
 * 传 `#fff` 会得到错误结果。旧代码所有入参都是 6 位，安全。
 *
 * alpha **不做格式化**（`0.16 + pulse*0.09` 会原样拼进字符串）——
 * 改了会让颜色与旧版对不上。
 *
 * **例外**：小于 `0.0001` 的 alpha 一律归零。渲染层有些 alpha 是
 * `1 - t/life` 的残值（可能小到 `7e-16`），而 Pixi 的 `Color` 解析器
 * **不接受科学计数法**，会抛 `Unable to convert color rgba(...)`。归零与
 * 「寿命已经结束」在视觉上完全等价。
 *
 * Pixi 的 `Color.setValue` 认识 CSS 的 `rgba(r,g,b,a)` 写法，所以本函数在
 * Pixi 版里同样有效（`Graphics.fill` / `stroke` / `TextStyle.fill` 都吃它）。
 */
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const alpha = a < 0.0001 ? 0 : a;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}
