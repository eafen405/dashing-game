/**
 * 粒子 —— 旧 `source.html:2444-2454`（`drawParticles`）的 Pixi 版，票 07 加了三种形态。
 *
 * 半径随寿命线性收缩到 0.4，alpha 同步衰减。
 *
 * **实现说明**：用 Pixi v8 的 `ParticleContainer` 承载（而不是 `Container` + `Sprite`）——
 * 所有粒子共用同一张纹理，颜色走 `tint`、大小走 `scaleX/scaleY`、
 * alpha 走 `alpha`（三者都被合成进 `color` 动态属性）。
 *
 * **三种形态各一个 `ParticleContainer`**（票 07）——
 * `ParticleContainer` 一个容器只有一张纹理，所以「普攻圆点 / 暴击碎片 / FEVER 余烬」
 * 三种形状必须分容器：
 *
 * | 形态 | 纹理 | 形状 | 旋转 |
 * |---|---|---|---|
 * | `spark` | 圆点 | 圆 | 无 |
 * | `shard` | 细长菱形（长:宽 ≈ 2.6:1） | 沿速度方向的碎屑 | 跟随速度方向 |
 * | `ember` | 四角星芒 | 星芒 | 自转 |
 *
 * 每帧把粒子按形态分桶（复用的数组，`length = 0` 截断，不重新分配）。
 *
 * **Pixi v8 的三个坑**（`pixi-fx-spec.md` §0 / §2）：
 *
 * 1. `ParticleContainer` **从包根导入**（`pixi.js/particle-container` 子路径在 strict 下报 TS7016）。
 * 2. 选项键是 **`dynamicProperties`**（不是 `particleProperties`），合法键只有
 *    `vertex` / `position` / `rotation` / `uvs` / `color`。
 *    本作需要 `x/y`（position）、`scale`（vertex）、`tint/alpha`（color）、
 *    `rotation`（rotation）；`uvs` 保持 `false`（静态，不每帧重传）。
 * 3. **必须用 `addParticle` / `removeParticle`**（`addChild` 会抛错）。
 *
 * **第四个坑（票 07 踩到的）**：`ParticleContainer` 的 `bounds` 恒为 `Bounds(0,0,0,0)` ——
 * 挂在它上面的滤镜会因为空包围盒被**静默跳过**（`FilterSystem.mjs:523-526`）。
 * 所以每个容器都必须给 `boundsArea`。
 */

import { Container, Particle, ParticleContainer, Rectangle } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { Particle as EffectParticle, ParticleForm } from '../types';
import type { FrameContext } from './context';
import {
  EMBER_BASE_RADIUS,
  PARTICLE_BASE_RADIUS,
  SHARD_BASE_RADIUS,
  SHARD_LENGTH_RATIO,
  createDotTexture,
  createEmberTexture,
  createShardTexture,
} from './textures';

/** 粒子上限（与旧实现一致：`source.html:1258` / `presentation/effects.ts`）。 */
const MAX_PARTICLES = 260;

/** 碎片的自转速度（rad/s）—— 不自转的碎片看起来像贴纸。 */
const EMBER_SPIN = 2.5;

/** 一种形态的粒子层。 */
class FormLayer {
  /** 容器（挂到 `glow` 层）。 */
  readonly container: ParticleContainer;

  /** 粒子对象池（复用，不每帧新建）。 */
  readonly pool: Particle[] = [];

  /** 本帧属于该形态的粒子（复用的数组 —— `length = 0` 截断，不重新分配）。 */
  readonly bucket: EffectParticle[] = [];

  /** 该形态的纹理基准半径（px）—— 粒子实际半径 = `基准半径 × scale`。 */
  readonly baseRadius: number;

  /** 纹理的工厂（DOM 依赖，构造期不调用）。 */
  private readonly textureFactory: () => Texture;

  private texture: Texture | null = null;

  constructor(
    readonly form: ParticleForm,
    texture: () => Texture,
    baseRadius: number,
  ) {
    this.baseRadius = baseRadius;
    this.textureFactory = texture;
    this.container = new ParticleContainer({
      dynamicProperties: {
        position: true,
        rotation: true,
        vertex: true,
        uvs: false,
        color: true,
      },
    });
    // `ParticleContainer` 的 `bounds` 恒为空 —— 必须给 `boundsArea`，
    // 否则将来挂滤镜的父容器会因为空包围盒而静默跳过整个滤镜。
    this.container.boundsArea = new Rectangle(0, 0, 1, 1);
  }

  /** 创建纹理与对象池（需要 DOM，在 `prepare()` 里调）。 */
  prepare(): void {
    if (this.texture) return;
    const texture = this.textureFactory();
    this.texture = texture;
    this.container.texture = texture;
    // 预生成到接近上限，避免中途扩容卡顿（`ParticleBuffer` 扩容是 1.5 倍跳跃）。
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push(new Particle({ texture, anchorX: 0.5, anchorY: 0.5 }));
    }
  }

  /** 把本帧分桶的粒子写进容器。 */
  sync(): void {
    const parts = this.bucket;
    const n = parts.length;
    const children = this.container.particleChildren;

    // 数量对齐（只从尾部增删，保持池索引与容器索引一致）。
    while (children.length > n) this.container.removeParticleAt(children.length - 1);
    while (children.length < n) {
      const p = this.pool[children.length];
      if (!p) break;
      this.container.addParticle(p);
    }

    for (let i = 0; i < n; i++) {
      const src = parts[i];
      // 池索引与容器索引一致（只从尾部增删）——
      // 用池里的 `Particle` 而不是 `IParticle`，因为 `tint` / `alpha` 只在
      // `Particle` 上有（`IParticle` 只有合成后的 `color`）。
      const p = this.pool[i];
      if (!src || !p) continue;
      const a = 1 - src.t / src.life;
      p.x = src.x;
      p.y = src.y;
      p.tint = src.color;
      p.alpha = a;

      if (this.form === 'shard') {
        // 碎片：长轴沿速度方向（像一道被甩出的光屑）。
        const s = (src.r * a + 0.4) / this.baseRadius;
        p.scaleX = s * SHARD_LENGTH_RATIO;
        p.scaleY = s;
        p.rotation = Math.atan2(src.vy, src.vx);
      } else if (this.form === 'ember') {
        // 余烬：星芒自转。
        const s = (src.r * a + 0.4) / this.baseRadius;
        p.scaleX = s;
        p.scaleY = s;
        p.rotation = src.t * EMBER_SPIN;
      } else {
        // 火花：圆点，尺寸随寿命收缩（与旧实现逐字一致）。
        const s = (src.r * a + 0.4) / this.baseRadius;
        p.scaleX = s;
        p.scaleY = s;
        p.rotation = 0;
      }
    }
  }

  /** 尺寸变化时更新 `boundsArea`（`ParticleContainer` 的 `bounds` 恒空）。 */
  resize(width: number, height: number): void {
    this.container.boundsArea = new Rectangle(0, 0, width, height);
  }

  destroy(): void {
    this.texture?.destroy(true);
    this.texture = null;
  }
}

export class ParticleView {
  /** 容器（挂到 `glow` 层）。 */
  readonly container: Container;

  /** 三种形态各一层。 */
  private readonly layers: FormLayer[];

  constructor() {
    this.container = new Container();
    this.layers = [
      new FormLayer('spark', () => createDotTexture(8), PARTICLE_BASE_RADIUS),
      new FormLayer('shard', () => createShardTexture(), SHARD_BASE_RADIUS),
      new FormLayer('ember', () => createEmberTexture(), EMBER_BASE_RADIUS),
    ];
    // 容器的子节点顺序 = 形态之间的前后关系（普攻在下，余烬在上）。
    for (const layer of this.layers) this.container.addChild(layer.container);
  }

  prepare(): void {
    for (const layer of this.layers) layer.prepare();
  }

  draw(fc: FrameContext): void {
    const list = fc.effects.particles;
    const n = Math.min(list.length, MAX_PARTICLES);

    // 按形态分桶（复用的数组，零分配）。
    for (const layer of this.layers) layer.bucket.length = 0;
    for (let i = 0; i < n; i++) {
      const src = list[i];
      if (!src) continue;
      const layer = this.layerFor(src.form);
      layer.bucket.push(src);
    }

    for (const layer of this.layers) layer.sync();
  }

  /** 尺寸变化时更新 `boundsArea`（`ParticleContainer` 的 `bounds` 恒空）。 */
  resize(width: number, height: number): void {
    for (const layer of this.layers) layer.resize(width, height);
  }

  destroy(): void {
    for (const layer of this.layers) layer.destroy();
  }

  private layerFor(form: ParticleForm): FormLayer {
    if (form === 'shard') return this.layers[1] as FormLayer;
    if (form === 'ember') return this.layers[2] as FormLayer;
    return this.layers[0] as FormLayer;
  }
}
