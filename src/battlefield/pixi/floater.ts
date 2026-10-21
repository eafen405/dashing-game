/**
 * 飘分文字 —— 逐字搬自 `source.html:2456-2471`（`drawFloaters`）。
 *
 * 描边 + 填充两遍（先深色描边再彩色填充），alpha 按 `1 - p²` 衰减。
 *
 * **实现说明**：Pixi v8 的 `Text` 自带描边（`style.stroke`），
 * 所以「描边 + 填充」由 `TextStyle` 一次表达。
 *
 * **成本**：每个 `Text` = 一张 Po2 纹理 + 一次排版 + 一次 GPU 上传。
 * 飘字的数量有限（生命 0.95s），但**绝不能每帧新建** —— 所以用**对象池**：
 *
 * - 池子固定大小（`MAX_FLOATERS`），多出来的飘字不画。
 * - 槽位复用时，只有**文本变了**才写 `text`，只有**颜色变了**才写 `style.fill`
 *   （两者都会触发重排版 / 重上传）。
 */

import { Container, Text } from 'pixi.js';
import type { FrameContext } from './context';
import { clamp } from './math';
import { createLabel } from './text';

/** 飘字池大小（同时可见的飘字上限）。 */
const MAX_FLOATERS = 16;

export class FloaterView {
  /** 容器（挂到 `floaters` 层）。 */
  readonly container = new Container();

  private readonly pool: Text[] = [];
  /** 槽位当前绑定的文本（用于避免重复赋值）。 */
  private readonly slotText: string[] = [];
  /** 槽位当前绑定的颜色（用于避免重复赋值）。 */
  private readonly slotColor: string[] = [];

  prepare(): void {
    if (this.pool.length > 0) return;
    for (let i = 0; i < MAX_FLOATERS; i++) {
      const text = createLabel('', 14, '700');
      // 旧版是「深色描边 + 彩色填充」两遍（`source.html:2465-2469`）。
      text.style.stroke = { color: 'rgba(4,8,16,.85)', width: 3 };
      text.style.fill = '#ffffff';
      text.visible = false;
      this.pool.push(text);
      this.slotText.push('');
      this.slotColor.push('');
      this.container.addChild(text);
    }
  }

  draw(fc: FrameContext): void {
    const list = fc.effects.floaters;
    const n = Math.min(list.length, this.pool.length);
    for (let i = 0; i < n; i++) {
      const f = list[i];
      const text = this.pool[i];
      if (!f || !text) continue;
      if (this.slotText[i] !== f.text) {
        text.text = f.text;
        this.slotText[i] = f.text;
      }
      if (this.slotColor[i] !== f.color) {
        text.style.fill = f.color;
        this.slotColor[i] = f.color;
      }
      const p = clamp(f.t / f.life, 0, 1);
      text.x = f.x;
      text.y = f.y;
      text.alpha = 1 - p * p;
      text.visible = true;
    }
    for (let i = n; i < this.pool.length; i++) {
      const text = this.pool[i];
      if (text) text.visible = false;
    }
  }

  destroy(): void {
    // 文本纹理随 `app.destroy({ children: true, texture: true }) 一起释放。
  }
}
