/**
 * 规则层常量 —— 逐字搬自 `source.html:371-410`。
 *
 * 搬迁规则（见 `.scratch/refactor/issues/02-rules-layer-extraction.md` 第 1 条）：
 * 常量**连同原始注释一起搬**，保留设计意图的来源，方便回查 `source.html`。
 * 数值一个都不许改 —— 数值与时序必须逐字对齐旧实现。
 *
 * 本文件不 import 任何东西（除类型外）：常量层是规则层的最底层。
 */

import type { Difficulty, Lane } from './types';

/** 角色生命值上限。 */
export const MAX_HP = 250;
/** 每次漏怪 / 自爆造成的生命值损失。 */
export const HIT_DAMAGE = 20;
/** 出招动作时长（秒）。 */
export const ATTACK_DUR = 0.44; // 出招动作时长（秒）

/**
 * 上跳滞空时间（秒）。
 *
 * 角色默认在下轨跑，打下轨怪时不离开地面；打上轨怪会跳进天空，
 * 约 1 秒后受重力落回下轨。滞空期间只算「在上轨上方」。
 */
export const TOP_AIR_TIME = 1;

export const FEVER_COMBO = 50; // 每累计 50 连击触发一次 FEVER
export const FEVER_TIME = 10; // FEVER 持续 10 秒
export const FEVER_MULT = 1.5; // FEVER 期间得分 ×1.5
export const BASE_GAIN = 200; // 外围命中（普攻）200 分
export const CRIT_GAIN = 300; // 中心暴击区命中 300 分
export const GOLD = '#ffd24a';

// 双生敌人：上下轨各一只、被锁链连住，必须在同一时间窗内两轨各命中一次
export const PAIR_GAIN = 700; // 同时击破 700 分
export const PAIR_CRIT_GAIN = 1000; // 两轨都打进暴击区 1000 分
export const PAIR_WINDOW = 0.18; // 两轨命中的时间窗（秒）
export const PAIR_COLOR = '#ff5ecb';

// 长按敌人：头部进入判定圈时点击起手，再按住该轨 2 秒贯穿
export const LONG_HOLD_TIME = 2; // 需要连续按住的时间（秒）
export const LONG_WAIT = 6; // 长按被暂停/切后台中断后，重新按住的宽限（秒）
export const LONG_HEAD_GAIN = 200; // 击中头部 +200
export const LONG_1S_GAIN = 200; // 按住满 1 秒 +200
export const LONG_TAIL_GAIN = 200; // 贯穿到尾部 +200
export const LONG_COLOR = '#a6ff5e';
/** 长按怪放弃后的滑出速度（`source.html:1135` 的 `m.escSpeed = 980`）。 */
export const LONG_ESCAPE_SPEED = 980;
// FEVER 时两轨仍保留区分度：上轨亮金、下轨琥珀金
export const FRENZY_LANE: Record<Lane, string> = { top: '#ffd24a', bottom: '#ff9a2e' };

/**
 * 木棍几何（单位：角色半径 playerR）。
 *
 * 判定框中心和棒尖共用这一组常量：打击点就落在棒子真的够得到的地方，
 * 不再靠飞出去的刀光去够远处的怪。
 */
export const CLUB_PIVOT_X_R = 0.1; // 握棒支点相对角色中心
export const CLUB_GRIP_R = 0.42; // 支点到握把
export const CLUB_LEN_R = 2.55; // 握把到棒尖
/** 角色中心到棒尖的最大水平距离。 */
export const CLUB_REACH_R = CLUB_PIVOT_X_R + CLUB_GRIP_R + CLUB_LEN_R;

export const SPEED_BASE = 165; // 初始移速 px/s（900 基准宽）
export const SPEED_MAX = 300; // 移速上限（到达后不再增加）
export const SPEED_RAMP = 75; // 用多少秒平滑升到上限

// 难度：1 星为当前标准；2 星刷新速度 ×2、移速与最终上限 ×1.5
export const DIFFS: Record<Difficulty, { spawnMul: number; speedMul: number }> = {
  1: { spawnMul: 1, speedMul: 1 },
  2: { spawnMul: 2, speedMul: 1.5 },
};

export const LANE: Record<Lane, { color: string }> = {
  top: { color: '#4fd1ff' },
  bottom: { color: '#ff8a4f' },
};

/**
 * 某条轨道当前的配色 —— `source.html:1507-1509`。FEVER 时两轨仍保留区分度。
 *
 * **只有这一份实现**：规则层（爆散 / 冲击环 / 提示条的颜色）与战场层
 * （轨道渐变 / 判定区 / 刀光 / 怪物本体）都要它。
 * 按 ADR-0003 的分层方向（战场层可以依赖规则层，规则层不能反向依赖战场层），
 * 实现放在规则层的常量层 —— 战场层从 `game/constants` 取，不再自己抄一份。
 */
export function laneColorOf(lane: Lane, frenzyActive: boolean): string {
  return frenzyActive ? FRENZY_LANE[lane] : LANE[lane].color;
}
