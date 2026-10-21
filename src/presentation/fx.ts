/**
 * 效果签名 —— 规则层效果事件 → 表现层视觉档位的**翻译表**。
 *
 * 分层依据 ADR-0003：规则层只说「发生了什么」，表现层决定「怎么画」。
 * 规则层**不可改动**（票 07 的硬约束），所以「这一次击破是不是暴击」
 * 「这是不是双生同破」只能由表现层从**效果事件的签名**里反推出来 ——
 * 这张表就是那份签名的书面形式，每一条都注明规则层的出处。
 *
 * ## 规则层的签名（`src/game/rules/resolve.ts`）
 *
 * | 事件 | 主爆散 `count` | 主爆散 `power` | 出处 |
 * |---|---|---|---|
 * | 普攻击破 | 26 | 1.25 | `resolve.ts:110-117` |
 * | **暴击**击破 | 36 | **1.5** | `resolve.ts:110-117` |
 * | 双生击破 | 28 | **1.3** | `resolve.ts:253-260` |
 * | **双生暴击** | 34 | **1.5** | `resolve.ts:253-260` |
 * | 单破自爆（另一只） | 26 | 1.25 | `resolve.ts:360` |
 * | 长按奖励 | 10 | 0.8 | `resolve.ts:405` |
 * | 长按失败 | 22 | 1.0 | `resolve.ts:513` |
 * | 长按完成 | 9 | 0.95 | `resolve.ts:588` |
 * | 角色受击 | 22 | 1.15 | `resolve.ts:654` |
 *
 * 「白色内核」爆散（`power = 0.9`）永远不是主爆散 —— 它只是击中瞬间的白色闪光，
 * 但**形态**跟随所在批次（暴击批次的白色内核也是碎片形）。
 *
 * ## 震动签名（`src/game/rules/resolve.ts`）
 *
 * | 事件 | `amount` | 出处 |
 * |---|---|---|
 * | 普攻击破 | 5（FEVER 中 7） | `resolve.ts:154` |
 * | 暴击击破 | 11 | `resolve.ts:154` |
 * | 长按完成 | 12 | `resolve.ts:601` |
 * | 双生击破 | 13 | `resolve.ts:288` |
 * | 双生暴击 | 16 | `resolve.ts:288` |
 * | 单破自爆 | 13（`shake-max`） | `resolve.ts:358` |
 * | 长按失败 | 8（`shake-max`） | `resolve.ts:514` |
 * | 角色受击 | 14（`shake-set`） | `resolve.ts:652` |
 */

import type { ParticleForm, RingTier } from '../battlefield/types';
import type { Effect } from '../game/effects';

/** 震动档位 —— 普攻 / 暴击 / 双生同破。 */
export type ShakeTier = 'normal' | 'crit' | 'twin';

/**
 * 三档震动强度（px）。
 *
 * 旧实现把三种情形全压在一个上限 17 的值上（`source.html:469`），
 * 表现层改成**三档显式档位**，间隔明确（6 → 12 → 18，逐档翻倍）。
 *
 * 抖动位移是 `rand(-shake, shake) * 0.5`（`source.html:1463`），
 * 所以实际画面位移是 ±3 / ±6 / ±9 px。
 */
export const SHAKE_TIERS: Record<ShakeTier, number> = {
  normal: 6,
  crit: 12,
  twin: 18,
};

/**
 * 每档的封顶（连续同档命中最多累积到这么多）。
 *
 * 规则层事件里的 `cap`（17 / 18 / 20）是旧实现的封顶，本层不再采用 ——
 * 封顶由**档位**决定（普攻档封在暴击档，双生档封在自己）。
 */
export const SHAKE_CAPS: Record<ShakeTier, number> = {
  normal: 12,
  crit: 18,
  twin: 18,
};

/**
 * 规则层的震动幅度 → 震动档位。
 *
 * 阈值取自规则层的实际取值（见文件头的签名表）：
 * `≥ 13` 是双生同破 / 角色受击，`≥ 11` 是暴击 / 长按完成，其余是普攻级。
 */
export function shakeTierOf(amount: number): ShakeTier {
  if (amount >= 13) return 'twin';
  if (amount >= 11) return 'crit';
  return 'normal';
}

/** 冲击波档位 —— 无 / 暴击 / 双生同破。 */
export type WaveLevel = 'none' | 'crit' | 'twin';

/**
 * 一个效果批次的视觉签名。
 *
 * 「批次」= 一次规则层动作产生的**全部**效果事件
 * （`strike()` 把刀光与击破效果合并成一批 —— `strike.ts:76` / `139`）。
 * 批次级判定比逐事件判定更准：白色内核爆散（`power = 0.9`）自己没有签名，
 * 但它**属于**哪个批次是清楚的。
 *
 * 复用同一个对象（表现层持有），避免每次分类都分配。
 */
export interface BatchSignature {
  /** 批次里有没有暴击击破。 */
  crit: boolean;
  /** 冲击波档位。 */
  wave: WaveLevel;
  /** 冲击波中心 x（CSS 像素）。 */
  waveX: number;
  /** 冲击波中心 y（CSS 像素）。 */
  waveY: number;
}

/** 暴击主爆散的 `power` 下限（规则层用 1.5）。 */
const CRIT_POWER = 1.45;
/** 双生普通击破的主爆散 `power` 下限（规则层用 1.3）。 */
const TWIN_POWER = 1.28;
/** 单只暴击的主爆散粒子数（规则层用 36；双生暴击是 34）。 */
const SINGLE_CRIT_COUNT = 36;
/** 双生击破的主爆散粒子数下限（规则层用 28 / 34）。 */
const TWIN_COUNT = 28;

/** 主爆散位置的暂存（一次批次最多两只双生 + 一只自爆，4 个足够）。 */
const MAX_PRIMARY = 4;
const primaryX: number[] = [0, 0, 0, 0];
const primaryY: number[] = [0, 0, 0, 0];

/**
 * 判定一个效果批次的视觉签名。
 *
 * **零分配** —— 结果写进调用方给的 `out`。
 */
export function classifyBatch(list: readonly Effect[], out: BatchSignature): void {
  out.crit = false;
  out.wave = 'none';
  out.waveX = 0;
  out.waveY = 0;

  let n = 0;
  let sx = 0;
  let sy = 0;
  let critSingle = false;
  let critTwin = false;
  let twinPlain = false;

  for (const e of list) {
    if (e.type !== 'burst') continue;
    const isCrit = e.power >= CRIT_POWER;
    const isTwin = !isCrit && e.power >= TWIN_POWER && e.count >= TWIN_COUNT;
    if (!isCrit && !isTwin) continue;

    if (n < MAX_PRIMARY) {
      primaryX[n] = e.x;
      primaryY[n] = e.y;
      n++;
      sx += e.x;
      sy += e.y;
    }

    if (isCrit) {
      out.crit = true;
      if (e.count >= SINGLE_CRIT_COUNT) critSingle = true;
      else critTwin = true;
    } else {
      twinPlain = true;
    }
  }

  if (critSingle) out.wave = 'crit';
  else if (critTwin || twinPlain) out.wave = 'twin';

  if (n > 0) {
    out.waveX = sx / n;
    out.waveY = sy / n;
  }
}

/**
 * 批次里的粒子形态。
 *
 * 优先级：**暴击 > FEVER > 普攻** —— 暴击是「更高一档的打击」，
 * 哪怕在 FEVER 里也仍然是锐利的碎片（FEVER 的氛围由洗色 / 色散 / 周身火花承担）。
 */
export function particleFormOf(sig: BatchSignature, feverActive: boolean): ParticleForm {
  if (sig.crit) return 'shard';
  if (feverActive) return 'ember';
  return 'spark';
}

/** 批次里的冲击环档位（决定环的粗细与颜色分档）。 */
export function ringTierOf(sig: BatchSignature): RingTier {
  if (sig.wave === 'twin') return 'twin';
  if (sig.wave === 'crit') return 'crit';
  return 'normal';
}

/**
 * 特效强度档位 —— 表现层给「这一下有多重」用的刻度。
 *
 * | 档位 | 强度 | 什么时候 |
 * |---|---|---|
 * | `normal` | 1 | 普攻 / 空挥 / 长按 |
 * | `crit` | 2 | 暴击击破 |
 * | `twin` | 3 | 双生同破 |
 * | `fever` | 4 | FEVER 期间的任何效果（全局氛围拉满） |
 *
 * **FEVER 是最高档** —— FEVER 期间整个战场的效果强度都拉到顶，
 * 所以档位判定里 FEVER 优先于单次击破的档位。
 */
export type EffectIntensity = 'normal' | 'crit' | 'twin' | 'fever';

/** 特效强度刻度（严格递增）。 */
export const EFFECT_INTENSITY: Record<EffectIntensity, number> = {
  normal: 1,
  crit: 2,
  twin: 3,
  fever: 4,
};

/**
 * 本次效果的强度档位。
 *
 * FEVER 期间一律是 `fever`（最高档）；否则按批次签名落到普攻 / 暴击 / 双生。
 */
export function intensityOf(sig: BatchSignature, feverActive: boolean): EffectIntensity {
  if (feverActive) return 'fever';
  if (sig.wave === 'twin') return 'twin';
  if (sig.crit) return 'crit';
  return 'normal';
}
