/**
 * 粒子 —— 逐字搬自 `source.html:2444-2454`（`drawParticles`）。
 *
 * 半径随寿命线性收缩到 0.4，alpha 同步衰减。
 *
 * **实现说明**：用 Pixi v8 的 `ParticleContainer` 承载（而不是 `Container` + `Sprite`）——
 * 所有粒子共用同一张圆点纹理，颜色走 `tint`、大小走 `scaleX/scaleY`、
 * alpha 走 `alpha`（三者都被合成进 `color` 动态属性）。
 *
 * **Pixi v8 的三个坑**（`pixi-fx-spec.md` §0 / §2）：
 *
 * 1. `ParticleContainer` **从包根导入**（`pixi.js/particle-container` 子路径在 strict 下报 TS7016）。
 * 2. 选项键是 **`dynamicProperties`**（不是 `particleProperties`），合法键只有
 *    `vertex` / `position` / `rotation` / `uvs` / `color`。
 *    本作需要 `x/y`（position）、`scale`（vertex）、`tint/alpha`（color）、
 *    `rotation`（rotation）；`uvs` 保持 `false`（静态，不每帧重传）。
 * 3. **必须用 `addParticle` / `removeParticle`**（`addChild` 会抛错）。
 */

import { Container, Particle, ParticleContainer, Rectangle } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { FrameContext } from './context';
import { PARTICLE_BASE_RADIUS, PARTICLE_TEXTURE_SIZE, createDotTexture } from './textures';

/** 粒子上限（与旧实现一致：`source.html:1258` / `presentation/effects.ts`）。 */
const MAX_PARTICLES = 260;

export class ParticleView {
  /** 容器（挂到 `entities` 层）。 */
  readonly container: Container;

  /** 粒子容器。 */
  private readonly particles: ParticleContainer;

  /** 粒子对象池（复用，不每帧新建）。 */
  private readonly pool: Particle[] = [];

  private texture: Texture | null = null;

  constructor() {
    // 纹理在 `prepare()` 里创建（需要 DOM），先用占位纹理建容器。
    this.texture = null;
    this.particles = new ParticleContainer({
      dynamicProperties: {
        position: true,
        rotation: true,
        vertex: true,
        uvs: false,
        color: true,
      },
    });
    this.container = this.particles;
    // `ParticleContainer` 的 `bounds` 恒为空 —— 必须给 `boundsArea`，
    // 否则将来挂滤镜的父容器会因为空包围盒而静默跳过整个滤镜。
    this.particles.boundsArea = new Rectangle(0, 0, 1, 1);
  }

  prepare(): void {
    if (this.texture) return;
    const texture = createDotTexture(PARTICLE_TEXTURE_SIZE);
    this.texture = texture;
    this.particles.texture = texture;
    // 预生成到接近上限，避免中途扩容卡顿（`ParticleBuffer` 扩容是 1.5 倍跳跃）。
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push(new Particle({ texture, anchorX: 0.5, anchorY: 0.5 }));
    }
  }

  draw(fc: FrameContext): void {
    const list = fc.effects.particles;
    const n = Math.min(list.length, MAX_PARTICLES);
    const children = this.particles.particleChildren;

    // 数量对齐（只从尾部增删，保持池索引与容器索引一致）。
    while (children.length > n) this.particles.removeParticleAt(children.length - 1);
    while (children.length < n) {
      const p = this.pool[children.length];
      if (!p) break;
      this.particles.addParticle(p);
    }

    for (let i = 0; i < n; i++) {
      const src = list[i];
      // 池索引与容器索引一致（只从尾部增删）——
      // 用池里的 `Particle` 而不是 `IParticle`，因为 `tint` / `alpha` 只在
      // `Particle` 上有（`IParticle` 只有合成后的 `color`）。
      const p = this.pool[i];
      if (!src || !p) continue;
      const a = 1 - src.t / src.life;
      p.x = src.x;
      p.y = src.y;
      const s = (src.r * a + 0.4) / PARTICLE_BASE_RADIUS;
      p.scaleX = s;
      p.scaleY = s;
      p.tint = src.color;
      p.alpha = a;
    }
  }

  /** 尺寸变化时更新 `boundsArea`（`ParticleContainer` 的 `bounds` 恒空）。 */
  resize(width: number, height: number): void {
    this.particles.boundsArea = new Rectangle(0, 0, width, height);
  }

  destroy(): void {
    this.texture?.destroy(true);
    this.texture = null;
  }
}
