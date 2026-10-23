/**
 * 规则层 → 上层的效果事件。
 *
 * 旧实现里规则函数顺手调用的视觉副作用（`burst()` / `showToast()` / `rings.push()` /
 * `nudgeVibrate()` / `shake` / `playerFlash` / `flashHurt()`）在这一层全部改成
 * **效果事件**：规则层只描述「发生了什么」，表现层决定「怎么画」。
 *
 * 逐条映射见 `docs/adr/0003-rules-immutable-presentation-mutable.md` 与本票简报。
 */

import type { Lane } from './types';

/**
 * 效果事件全集。
 *
 * - `burst` —— 旧 `burst(x, y, color, n, power)`
 * - `ring` —— 旧 `rings.push({ x, y, t, life, r0, r1, color })`（`t` 是年龄，属表现层）
 * - `slash` —— 旧 `slashes.push({ x, x0, y, t, life, lane })`
 * - `soul-strike` —— 按住长条怪时点另一条轨：灵魂分身飞出去代打（纯表现）
 * - `floater` —— 旧 `addFloater(x, y, text, color)`
 * - `toast` —— 旧 `showToast(text, color)`
 * - `lane-flash` —— 旧 `laneTop/laneBot.classList.add("hit")`（轨道受击高亮）
 * - `shake-add` —— 旧 `shake = Math.min(shake + n, cap)`
 * - `shake-max` —— 旧 `shake = Math.max(shake, n)`
 * - `shake-set` —— 旧 `shake = 14`（直接赋值）
 * - `player-flash` —— 旧 `playerFlash = 1`
 * - `hurt` —— 旧 `flashHurt()`
 * - `vibrate` —— 旧 `nudgeVibrate(ms | ms[])`
 * - `fever-start` —— 旧 `enterFrenzy()`
 * - `fever-end` —— 旧 `endFever()`
 * - `pair-smash` —— 双生击破：角色大幅跳起下砸（纯表现，规则层不关心）
 * - `game-over` —— 旧 `gameOverNow()`
 */
export type Effect =
  | { type: 'burst'; x: number; y: number; color: string; count: number; power: number }
  | { type: 'ring'; x: number; y: number; life: number; r0: number; r1: number; color: string }
  | { type: 'slash'; x: number; x0: number; y: number; life: number; lane: Lane }
  | {
      type: 'soul-strike';
      /** 灵魂从哪条轨（长按怪所在轨）飞出来。 */
      from: Lane;
      /** 打向哪条轨。 */
      lane: Lane;
      /** 起点：角色悬浮位置。 */
      x0: number;
      y0: number;
      /** 落点：与本体相同的判定点（`layout.hitX`）。 */
      x: number;
      y: number;
      life: number;
      /** 这一击是否真的打到了怪（决定落点要不要炸开）。 */
      hit: boolean;
      /** 是否落在暴击区（决定灵魂的颜色）。 */
      crit: boolean;
    }
  | { type: 'floater'; x: number; y: number; text: string; color: string }
  | { type: 'toast'; text: string; color: string }
  | { type: 'lane-flash'; lane: Lane }
  | { type: 'shake-add'; amount: number; cap: number }
  | { type: 'shake-max'; amount: number }
  | { type: 'shake-set'; amount: number }
  | { type: 'player-flash' }
  | { type: 'hurt' }
  | { type: 'vibrate'; pattern: number | number[] }
  | { type: 'fever-start' }
  | { type: 'fever-end' }
  | { type: 'pair-smash' }
  | { type: 'game-over' };

/** 效果事件类型名（表现层按类型分派）。 */
export type EffectType = Effect['type'];

/**
 * 爆散效果的**签名词表** —— 规则层生成爆散时用的数值，表现层靠它「认词」。
 *
 * ADR-0003 说规则层只描述「发生了什么」、表现层决定「怎么画」。
 * 但「这一下是暴击还是双生同破」规则层本来就知道 —— 它决定分数、连击、震屏，
 * 也决定爆散用多少粒子、什么力度。表现层拿不到这个「是什么」，
 * 只能反过来从爆散事件的 `power` / `count` **反推**。
 *
 * 反推就要有一份词表。同样的数字抄在规则层和表现层两份，
 * 规则层一改，表现层就静默误判（暴击被当成双生、或者反过来）。
 * 所以词表**只在这里定义一次**：规则层用这些值生成效果事件，
 * 表现层（`src/presentation/fx.ts`）导入同一组值来认词。
 *
 * 数值一个都没改 —— 与旧版逐字一致。
 */
export const BURST = {
  /** 普攻击破的主爆散。 */
  normal: { count: 26, power: 1.25 },
  /** 暴击击破的主爆散。 */
  crit: { count: 36, power: 1.5 },
  /** 双生同破（未暴击）的主爆散。 */
  twin: { count: 28, power: 1.3 },
  /** 双生同破且暴击的主爆散。 */
  twinCrit: { count: 34, power: 1.5 },
} as const;

/**
 * 表现层按力度认词的**下限**（签名词表的配套值）。
 *
 * 规则层只有 1.25 / 1.3 / 1.5 三档主爆散力度，阈值卡在两档之间：
 * `≥ 1.45` 认作暴击，`≥ 1.28` 认作双生同破。
 * 阈值与 {@link BURST} 配套 —— 改了力度就要同步改这里。
 */
export const BURST_POWER_CRIT_MIN = 1.45;

/** 双生同破的力度下限（见 {@link BURST_POWER_CRIT_MIN}）。 */
export const BURST_POWER_TWIN_MIN = 1.28;
