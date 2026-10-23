/**
 * 文本工具 —— 战场里的所有文字都用 `Text` 对象（Pixi v8）。
 *
 * **成本意识**（`pixi-fx-spec.md` §5.5）：每个 `Text` = 一张 Po2 纹理 +
 * 一次 Canvas 2D 排版 + 一次 GPU 上传。所以：
 *
 * - 文本对象**全部池化复用**，不每帧 `new Text()`。
 * - 只有**字符串真的变了**才赋值（`AbstractText.set text` 自带短路）。
 * - 需要按帧改颜色的地方用 `tint`（不触发重排版）；
 *   必须连描边一起换色的（飘字）才动 `style.fill`。
 */

import { Text } from 'pixi.js';

/**
 * 字体族 —— 与旧版 Canvas 2D 的 `ctx.font` 完全一致
 * （`'PingFang SC','Microsoft YaHei',sans-serif`）。
 */
export const FONT_FAMILY = "'PingFang SC','Microsoft YaHei',sans-serif";

/** 字重。 */
export type FontWeight = '400' | '600' | '700' | '800';

/**
 * 造一个居中锚点的标签。
 *
 * `anchor: 0.5` 对应旧版 Canvas 2D 的 `textAlign = 'center'` + `textBaseline = 'middle'`。
 */
export function createLabel(text: string, fontSize: number, fontWeight: FontWeight): Text {
  return new Text({
    text,
    style: {
      fontFamily: FONT_FAMILY,
      fontSize,
      fontWeight,
      fill: '#ffffff',
      align: 'center',
    },
    anchor: 0.5,
  });
}
