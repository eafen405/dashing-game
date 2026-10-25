import { clamp } from './math';

/** 第 4 张待机素材已进入出招起手；呼吸只在相邻的四张站姿间往返。 */
export const RIN_IDLE_FRAMES = [0, 1, 2, 3, 2, 1] as const;
export const RIN_RIDE_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export const RIN_ATTACK_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
export const RIN_BURN_FRAMES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

/** 复用采样结果；只改数字，不在逐帧路径里创建数组或纹理。 */
export class RinFrameSample {
  from = 0;
  to = 0;
  mix = 0;

  sample(frames: readonly number[], position: number, loop: boolean, blend = 1): void {
    const n = frames.length;
    if (n === 0) {
      this.from = this.to = 0;
      this.mix = 0;
      return;
    }
    const p = loop ? ((position % n) + n) % n : clamp(position, 0, n - 1);
    const index = Math.floor(p);
    this.from = frames[index] ?? 0;
    this.to = frames[loop ? (index + 1) % n : Math.min(index + 1, n - 1)] ?? this.from;
    // 出招只在帧末短暂过渡，保留命中帧的清晰度；呼吸 / 骑乘连续过渡。
    const t = blend > 0 ? clamp((p - index - (1 - blend)) / blend, 0, 1) : 0;
    this.mix = t * t * (3 - 2 * t);
  }
}
