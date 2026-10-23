/**
 * 凛的 2D 立绘帧（来自参考动画的逐帧抠像）。
 *
 * 动画源是一段 24fps、1280×720 的「镰刀少女待机 → 举镰过顶 → 上轨下劈」循环：
 *
 * - `RIN_IDLE_SPRITES`：待机呼吸（0、5、10、15、20 帧），只差发丝 / 刃光，
 *   循环播放时不会看出跳帧。
 * - `RIN_ATTACK_SPRITES`：出招 12 帧 —— 起手（30）→ 后摆（34）→ 举镰过顶
 *   （38~44）→ 命中（46，带红色刀光与星芒）→ 收势（50~64）。
 *
 * 抠像由 U²-Netp 生成，统一裁到 `x∈[150,1250]、y∈[30,716]` 后缩到 0.5 倍，
 * 因此所有帧共用同一套锚点（脚底）与缩放比例（见 `player.ts` 的 RIN_SPRITE_*）。
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

/** 一组立绘纹理（本体 / 灵魂分身共用同一份 GPU 纹理）。 */
export interface RinTextureSet {
  readonly idle: readonly Texture[];
  readonly attack: readonly Texture[];
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
      const [idle, attack] = await Promise.all([
        Promise.all(RIN_IDLE_SPRITES.map((src) => decodeTexture(src))),
        Promise.all(RIN_ATTACK_SPRITES.map((src) => decodeTexture(src))),
      ]);
      return { idle, attack };
    })().catch((err: unknown) => {
      textureSet = null;
      throw err;
    });
  }
  return textureSet;
}
