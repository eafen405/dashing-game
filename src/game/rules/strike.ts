/**
 * 出刀 —— `source.html:861-927` 与 `source.html:1061-1080` 的纯函数化。
 *
 * 两条输入路径：
 *   - `strike(lane)` —— 对某条轨道挥刀（`source.html:861`）
 *   - `pressLane(lane, id)` —— 按下半屏：先看该轨有没有长按怪，没有才挥刀
 *     （`source.html:1061`）
 *
 * **双生补齐的精确语义**（务必对照 `legacy-semantics.md` §5 / §6.2 / §6.3）：
 * 先击中的那只**不立即死亡**，而是 `pairPending = true` 且 `pairT = PAIR_WINDOW` 挂起；
 * 窗口内补齐 → `killPair` 700 分（双暴击 1000）；窗口过期 → `resolvePairSolo`
 * （先中的那只按普攻 200 / 暴击 300 得分，另一只 `pairBlast` 自爆扣 20 血）。
 */

import { ATTACK_DUR, LANE, PAIR_COLOR, PAIR_WINDOW, TOP_AIR_TIME } from '../constants';
import type { Effect } from '../effects';
import { isHoldMonster, isTwinMonster } from '../kinds';
import type { GameState, Lane, Monster } from '../types';
import { findLongInLane } from './spawn';
import { completePair, findMonster, killMonster, longHeadX, missLong, startHold } from './resolve';

/** 命中某只怪物的结果。 */
export interface StrikeResult {
  state: GameState;
  effects: Effect[];
}

/** 灵魂分身动画时长（秒）。 */
const SOUL_LIFE = 0.5;

/** 长按悬浮高度（playerR 的倍数）—— 与 `player.ts` 的 `-s * 1.15` 一致。 */
const HOLD_HOVER_R = 1.15;

/** 一次「本轨命中结算」的结果。 */
interface LaneOutcome {
  state: GameState;
  effects: Effect[];
  /** 是否打到了东西（双生补齐 / 普通怪 / 挂起中的双生都算命中）。 */
  hit: boolean;
  /** 是否落在暴击区。 */
  crit: boolean;
}

/**
 * 结算「这一轨打中了什么」—— **本体与灵魂共用**。
 *
 * 只做目标选择与伤害 / 计分，不含身体动作、刀光与空挥反馈。
 */
function resolveLane(state: GameState, lane: Lane): LaneOutcome {
  const { layout } = state;
  const effects: Effect[] = [];
  let s = state;
  const tol = layout.zoneHalf;
  const laneYv = layout.laneY[lane];

  // 双生补齐优先：另一轨已挂起，这一击要尽快接上
  let pendingMate: Monster | null = null;
  let pmDist = Infinity;
  for (const m of s.monsters) {
    if (!isTwinMonster(m) || m.removed || !m.pairPending || m.partnerId === null) continue;
    const partner = findMonster(s.monsters, m.partnerId);
    if (!partner || partner.removed) continue;
    if (partner.lane !== lane) continue;
    const d = Math.abs(partner.x - layout.hitX);
    if (d <= tol && d < pmDist) {
      pmDist = d;
      pendingMate = partner;
    }
  }
  if (pendingMate) {
    const crit = pmDist <= layout.critHalf;
    const completed = completePair(s, pendingMate.id, crit);
    return {
      state: completed.state,
      effects: [...effects, ...completed.effects],
      hit: true,
      crit,
    };
  }

  // 找出该轨道、位于打击判定区内的最近怪物
  let target: Monster | null = null;
  let bestDist = Infinity;
  for (const m of s.monsters) {
    if (m.removed || isHoldMonster(m) || m.lane !== lane) continue;
    const d = Math.abs(m.x - layout.hitX);
    if (d <= tol && d < bestDist) {
      bestDist = d;
      target = m;
    }
  }

  if (!target) return { state: s, effects, hit: false, crit: false };

  const targetId = target.id;
  if (isTwinMonster(target) && target.partnerId !== null) {
    if (target.pairPending) {
      // 这一只已挂起，重复点击不刷新时间窗
      effects.push({
        type: 'burst',
        x: layout.hitX,
        y: laneYv,
        color: PAIR_COLOR,
        count: 8,
        power: 0.65,
      });
      return { state: s, effects, hit: true, crit: false };
    }
    // 第一击：挂起等待另一轨；窗口内补齐才算同时击破
    const pairCrit = bestDist <= layout.critHalf;
    s = {
      ...s,
      monsters: s.monsters.map((x) =>
        x.id === targetId && isTwinMonster(x)
          ? { ...x, pairPending: true, pairT: PAIR_WINDOW, pairCrit }
          : x,
      ),
    };
    effects.push({
      type: 'burst',
      x: target.x,
      y: target.y,
      color: PAIR_COLOR,
      count: 16,
      power: 0.95,
    });
    effects.push({
      type: 'ring',
      x: target.x,
      y: target.y,
      life: 0.26,
      r0: 6,
      r1: 36,
      color: PAIR_COLOR,
    });
    effects.push({ type: 'vibrate', pattern: 18 });
    return { state: s, effects, hit: true, crit: pairCrit };
  }

  const crit = bestDist <= layout.critHalf;
  const killed = killMonster(s, target.id, crit);
  return { state: killed.state, effects: [...effects, ...killed.effects], hit: true, crit };
}

/**
 * 对某条轨道挥刀 —— `source.html:861-927`。
 *
 * 不消耗 PRNG。
 */
export function strike(state: GameState, lane: Lane): StrikeResult {
  if (state.phase !== 'running') return { state, effects: [] };

  const { layout } = state;
  const effects: Effect[] = [];

  // 出招动作：同一挥击期间连点不重置，换轨则重新出招。
  // 角色默认驻守下轨；打上轨会跳进天空，约 1 秒后落回下轨。
  let s = state;
  if (s.attackT <= ATTACK_DUR * 0.42 || s.attackLane !== lane) {
    s = { ...s, attackT: ATTACK_DUR, attackLane: lane };
  }
  // 已经在空中时再打上轨不刷新滞空（重力不会因为挥棒重置）；
  // 从下轨起跳才给满 1 秒。
  const airT = lane === 'top' ? (s.playerLane === 'top' ? s.airT : TOP_AIR_TIME) : 0;
  s = { ...s, playerLane: lane, airT };

  // 轨道受击高亮（旧实现给轨道 DOM 节点加 class）
  effects.push({ type: 'lane-flash', lane });

  // 刀光：从角色身前划向打击点
  const laneYv = layout.laneY[lane];
  effects.push({
    type: 'slash',
    x: layout.hitX,
    x0: layout.playerX + layout.playerR * 1.05,
    y: laneYv,
    life: 0.3,
    lane,
  });

  const outcome = resolveLane(s, lane);
  if (!outcome.hit) {
    // 空挥
    effects.push({
      type: 'burst',
      x: layout.hitX,
      y: laneYv,
      color: LANE[lane].color,
      count: 7,
      power: 0.6,
    });
  }

  return { state: outcome.state, effects: [...effects, ...outcome.effects] };
}

/**
 * 正在被按住的长条怪所在轨道（没有有效长按 = `null`）。
 *
 * 只认「起手成功、尚未逃脱、未被移除」的长按怪 —— 与 `player.ts` 的悬浮条件一致。
 */
function heldLane(state: GameState): Lane | null {
  if (state.holdMonsterId === null) return null;
  const h = findMonster(state.monsters, state.holdMonsterId);
  if (!h || !isHoldMonster(h) || h.removed || h.escaped || !h.anchored) return null;
  return h.lane;
}

/**
 * 灵魂代打 —— 按住长条怪时点另一条轨。
 *
 * **结算与本体完全相同**：同一个 `layout.hitX` / `zoneHalf` / `critHalf`，
 * 同样的击杀、计分、连击、FEVER。区别只有两点：
 *
 * 1. 身体留在长按怪上（不改 `playerLane` / `attackT` / `airT`），长按不中断；
 * 2. 刀光换成 `soul-strike` 效果 —— 灵魂从角色身上分离、飞到落点、挥棒。
 *
 * 没打到就是空挥：不额外扣血，怪物继续走，该漏的怪照样漏。
 * 双生同破时的 `pair-smash`（本体跳起下砸）会去掉 —— 身体还在长按，不能跳。
 */
function soulStrike(state: GameState, lane: Lane): StrikeResult {
  const { layout } = state;
  const from = heldLane(state) ?? state.playerLane ?? 'bottom';
  const laneYv = layout.laneY[lane];
  const effects: Effect[] = [{ type: 'lane-flash', lane }];

  const outcome = resolveLane(state, lane);

  effects.push({
    type: 'soul-strike',
    from,
    lane,
    x0: layout.playerX,
    y0: layout.laneY[from] - layout.playerR * HOLD_HOVER_R,
    x: layout.hitX,
    y: laneYv,
    life: SOUL_LIFE,
    hit: outcome.hit,
    crit: outcome.crit,
  });

  if (!outcome.hit) {
    // 空挥：和本体一样只有一点火花，不扣血
    effects.push({
      type: 'burst',
      x: layout.hitX,
      y: laneYv,
      color: LANE[lane].color,
      count: 7,
      power: 0.6,
    });
  }

  // 本体在长按时不能播「跳起下砸」，双生同破的冲击仍由灵魂与粒子表达。
  const soulEffects = outcome.effects.filter((e) => e.type !== 'pair-smash');

  return { state: outcome.state, effects: [...effects, ...soulEffects] };
}

/**
 * 按下半屏 —— `source.html:1061-1080`。
 *
 * 优先级：**长按怪优先**，没有长按怪才挥刀。
 */
export function pressLane(state: GameState, lane: Lane, inputId: string): StrikeResult {
  if (state.phase !== 'running') return { state, effects: [] };

  const m = findLongInLane(state.monsters, lane);
  if (!m) {
    // 正在长按另一条轨的怪物 → 灵魂分身代打，身体不离位
    if (heldLane(state) !== null) return soulStrike(state, lane);
    return strike(state, lane);
  }

  if (state.holdMonsterId !== null || m.escaped) return { state, effects: [] };

  if (m.anchored) {
    // 暂停后重新起手
    return startHold(state, m.id, inputId);
  }

  const headX = longHeadX(m);
  const { hitX, zoneHalf } = state.layout;
  if (headX < hitX - zoneHalf) {
    // 头已越过判定区 → 漏怪
    return missLong(state, m.id);
  }
  if (headX > hitX + zoneHalf) {
    // 头还没进圈：不挥空刀
    // 旧实现写的是 `now - (m.tipT || -9) > 0.6`（`||` 而非 `??`）—— 逐字保持
    if (state.now - (m.tipT || -9) > 0.6) {
      const s: GameState = {
        ...state,
        monsters: state.monsters.map((x) => (x.id === m.id ? { ...x, tipT: state.now } : x)),
      };
      return {
        state: s,
        effects: [
          { type: 'floater', x: headX, y: m.y - m.h * 1.45, text: '太早', color: '#9fb0cf' },
        ],
      };
    }
    return { state, effects: [] };
  }
  return startHold(state, m.id, inputId);
}
