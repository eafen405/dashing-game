/**
 * 背景 —— 星空 + 中线。
 *
 * 逐字搬自 `source.html:1480-1505`（`drawBackground`）与 `579-591`（`buildStars`）。
 *
 * **静态内容不每帧重建**：星空数据只在 `resize()` 时生成一次
 * （旧代码本来也是 `buildStars()` 只在 `resize()` 里调），
 * 中线的渐变也只建一次，不每帧 `createLinearGradient`。
 * 星星的**位置**是动画（横向流动），所以每帧仍要更新 —— 这是画面本身，不是重建。
 *
 * **实现选择**：星星用 `Sprite` 而不是 `Graphics` ——
 * 旧版每帧要画 30~90 个 `ctx.arc`（Pixi 里每个圆弧都要细分成多边形），
 * 用精灵只改 `x` 一个字段，GPU 侧合批成 1 次绘制。
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import type { FillGradient, Texture } from 'pixi.js';
import type { Layout } from '../../game/types';
import type { FrameContext } from './context';
import { linearGradient } from './gradient';
import { clamp, rand } from './math';
import { STAR_TEXTURE_SIZE, createDotTexture } from './textures';

/** 星星。 */
interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  s: number;
}

/** 背景视图。 */
export class BackgroundView {
  /** 容器（挂到 `background` 层）。 */
  readonly container = new Container();

  /** 星点精灵层。 */
  private readonly starLayer = new Container();
  /** 中线（静态，resize 时重建）。 */
  private readonly midGfx = new Graphics();

  private stars: Star[] = [];
  private sprites: Sprite[] = [];
  private dotTexture: Texture | null = null;
  private midGradient: FillGradient | null = null;
  private w = 0;
  private h = 0;

  constructor() {
    this.container.addChild(this.starLayer);
    this.container.addChild(this.midGfx);
  }

  /** DOM 依赖（纹理）在这里创建 —— 构造函数保持无 DOM。 */
  prepare(): void {
    this.dotTexture = createDotTexture(STAR_TEXTURE_SIZE);
  }

  /** 尺寸变化时重建星空与中线渐变。 */
  resize(layout: Layout): void {
    this.w = layout.width;
    this.h = layout.height;
    this.buildStars();
    this.buildMidLine();
  }

  draw(fc: FrameContext): void {
    const w = this.w;
    const vt = fc.vt;
    const stars = this.stars;
    const sprites = this.sprites;

    // 星空（位置是动画 —— 横向流动）。
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const sprite = sprites[i];
      if (!s || !sprite) continue;
      const x = (s.x - vt * s.s) % (w + 40);
      sprite.x = x < -20 ? x + w + 40 : x;
    }
  }

  /** 星空 —— `source.html:579-591`。 */
  private buildStars(): void {
    const w = this.w;
    const h = this.h;
    this.stars.length = 0;
    const n = Math.round(clamp((w * h) / 26000, 30, 90));
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: rand(0.5, 1.6),
        a: rand(0.08, 0.35),
        s: rand(2, 10),
      });
    }
    this.syncSprites();
  }

  /** 星星精灵池（数量变化时增删，多余的隐藏）。 */
  private syncSprites(): void {
    const texture = this.dotTexture;
    const need = this.stars.length;
    while (this.sprites.length < need) {
      if (!texture) break;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      this.starLayer.addChild(sprite);
      this.sprites.push(sprite);
    }
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const star = this.stars[i];
      if (!sprite || !star) {
        if (sprite) sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      sprite.tint = 0xbcd4ff;
      sprite.alpha = star.a;
      sprite.scale.set(star.r / (STAR_TEXTURE_SIZE / 2));
      sprite.x = star.x;
      sprite.y = star.y;
    }
  }

  /** 中线（静态）。 */
  private buildMidLine(): void {
    const g = this.midGfx;
    g.clear();
    const w = this.w;
    const h = this.h;
    if (!w || !h) return;
    if (!this.midGradient) {
      // 水平渐变：透明 → 白 10% → 透明（旧 `source.html:1487-1492`）。
      this.midGradient = linearGradient(
        [
          { offset: 0, color: 'rgba(255,255,255,0)' },
          { offset: 0.5, color: 'rgba(255,255,255,.10)' },
          { offset: 1, color: 'rgba(255,255,255,0)' },
        ],
        0,
        0.5,
        1,
        0.5,
      );
    }
    const mid = h / 2;
    // 旧版是 1px 宽的描边；Pixi 的局部渐变需要**有面积的包围盒**，
    // 所以用等高的细矩形代替（覆盖范围与 1px 描边一致）。
    g.beginPath();
    g.rect(0, mid - 0.5, w, 1);
    g.fill(this.midGradient);
  }

  destroy(): void {
    this.midGradient?.destroy();
    this.midGradient = null;
    this.dotTexture?.destroy(true);
    this.dotTexture = null;
  }
}
