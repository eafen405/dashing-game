/**
 * 凛的 2D 立绘帧（来自参考动画的逐帧抠像）。
 *
 * 两段动画源都是 24fps、1280×720：
 *
 * - **待机 / 出招**（第一段）：待机 → 举镰过顶 → 上轨下劈。
 *   - `RIN_IDLE_SPRITES`：待机呼吸（0、5、10、15、20 帧），只差发丝 / 刃光。
 *   - `RIN_ATTACK_SPRITES`：出招 12 帧 —— 起手（30）→ 后摆（34）→ 举镰过顶
 *     （38~44）→ 命中（46，带红色刀光与星芒）→ 收势（50~64）。
 * - **骑镰飞行**（第二段）：凛站在横持的镰刀上，刀刃上下摆动 + 发丝飘动。
 *   - `RIN_RIDE_SPRITES`：42、48、…、90 帧共 9 帧，构成「高 → 低 → 高」的
 *     起伏循环，用作地面跑动时的飞行姿态。
 *
 * 两段素材的裁切窗口不同：待机 / 出招统一裁到 `x∈[150,1250]、y∈[30,716]`；
 * 骑乘帧按眼睛位置对齐后裁到 820×570，再缩到 0.5 倍。因此各自的锚点与
 * 身体像素高度分别记在 `player.ts` 的 `RIN_SPRITE_*` / `RIN_RIDE_*` 常量里。
 * 另外原画朝向并不统一：待机 / 骑乘朝右，出招帧朝左挥镰，
 * 因此 `player.ts` 只对出招帧做水平翻转，待机 / 骑乘保持原画方向。
 *
 * 用 `?inline` 导入：单文件构建会把它们全部转成 data URL，`file://` 下也能加载。
 */

import { ImageSource, Texture } from 'pixi.js';

import atk0 from './rin/atk-0.webp?inline';
import atk1 from './rin/atk-1.webp?inline';
import atk2 from './rin/atk-2.webp?inline';
import atk3 from './rin/atk-3.webp?inline';
import atk4 from './rin/atk-4.webp?inline';
import atk5 from './rin/atk-5.webp?inline';
import atk6 from './rin/atk-6.webp?inline';
import atk7 from './rin/atk-7.webp?inline';
import atk8 from './rin/atk-8.webp?inline';
import atk9 from './rin/atk-9.webp?inline';
import atk10 from './rin/atk-10.webp?inline';
import atk11 from './rin/atk-11.webp?inline';
import idle0 from './rin/idle-0.webp?inline';
import idle1 from './rin/idle-1.webp?inline';
import idle2 from './rin/idle-2.webp?inline';
import idle3 from './rin/idle-3.webp?inline';
import idle4 from './rin/idle-4.webp?inline';
import ride0 from './rin/ride/ride-0.webp?inline';
import ride1 from './rin/ride/ride-1.webp?inline';
import ride2 from './rin/ride/ride-2.webp?inline';
import ride3 from './rin/ride/ride-3.webp?inline';
import ride4 from './rin/ride/ride-4.webp?inline';
import ride5 from './rin/ride/ride-5.webp?inline';
import ride6 from './rin/ride/ride-6.webp?inline';
import ride7 from './rin/ride/ride-7.webp?inline';
import ride8 from './rin/ride/ride-8.webp?inline';

/** 待机帧（顺序播放）。 */
export const RIN_IDLE_SPRITES: readonly string[] = [idle0, idle1, idle2, idle3, idle4];

/** 出招帧（按时间顺序，索引 6 = 命中帧）。 */
export const RIN_ATTACK_SPRITES: readonly string[] = [
  atk0,
  atk1,
  atk2,
  atk3,
  atk4,
  atk5,
  atk6,
  atk7,
  atk8,
  atk9,
  atk10,
  atk11,
];

/** 骑镰飞行帧（顺序播放，构成刀刃起伏循环）。 */
export const RIN_RIDE_SPRITES: readonly string[] = [
  ride0,
  ride1,
  ride2,
  ride3,
  ride4,
  ride5,
  ride6,
  ride7,
  ride8,
];

/** 一组立绘纹理（本体 / 灵魂分身共用同一份 GPU 纹理）。 */
export interface RinTextureSet {
  readonly idle: readonly Texture[];
  readonly attack: readonly Texture[];
  readonly ride: readonly Texture[];
}

let textureSet: Promise<RinTextureSet> | null = null;

/**
 * 把内联 data URL 解成纹理。
 *
 * 不走 `Assets.load`：Pixi 对 data URL 会先转成 `blob:` 再 `createImageBitmap`，
 * 单文件门禁会把 `blob:` 判成外部请求。用 `<img>` 解码不会产生任何网络请求。
 */
function decodeTexture(src: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      resolve(new Texture({ source: new ImageSource({ resource: img }) }));
    };
    img.onerror = () => reject(new Error('凛的立绘解码失败'));
    img.src = src;
  });
}

/**
 * 异步解码全部立绘。
 *
 * 模块级缓存：4 个 `PlayerView`（本体 + 3 个灵魂分身）共用同一组纹理，
 * 不会重复解码 / 重复占显存。解码失败时清掉缓存，下次 mount 还能重试。
 */
export function loadRinTextureSet(): Promise<RinTextureSet> {
  if (!textureSet) {
    textureSet = (async () => {
      const [idle, attack, ride] = await Promise.all([
        Promise.all(RIN_IDLE_SPRITES.map((src) => decodeTexture(src))),
        Promise.all(RIN_ATTACK_SPRITES.map((src) => decodeTexture(src))),
        Promise.all(RIN_RIDE_SPRITES.map((src) => decodeTexture(src))),
      ]);
      return { idle, attack, ride };
    })().catch((err: unknown) => {
      textureSet = null;
      throw err;
    });
  }
  return textureSet;
}
