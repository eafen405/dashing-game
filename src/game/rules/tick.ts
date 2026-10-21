/**
 * 主推进 —— `source.html:1276-1398` 的 running 分支。
 *
 * **四段的先后顺序不能换**（`legacy-semantics.md` §7）：
 *
 *   1. 怪物推进（移动 + 逃逸滑出 + 长按怪漏怪判定）
 *   2. 长按计时（按住累积 / 宽限倒计时）
 *   3. 双生挂起计时（窗口过期 → 按单只结算）
 *   4. 触线伤害（漏怪扣血）
 *
 * 双生挂起过期在触线判定**之前**处理；`completeLong` / `failLong` 用 `break`
 * 跳出长按循环（一次 tick 只处理一只）；`resolvePairSolo` 循环里血量归零会
 * 触发 game over 并中断后续结算。
 */

import { LONG_1S_GAIN, LONG_HOLD_TIME, PAIR_COLOR } from '../constants';
import type { Effect } from '../effects';
import type { Rng } from '../rng';
import type { GameState, HoldMonster, Monster } from '../types';
import { difficultyAt, spawnInterval, speedNow } from './difficulty';
import { endFever } from './fever';
import {
  completeLong,
  failLong,
  findMonster,
  hurtPlayer,
  longAward,
  longHeadX,
  missLong,
  resolvePairSolo,
} from './resolve';
import { spawnMonster } from './spawn';

/** 单帧最大步长 —— `source.html:1282` 的 `dt = Math.min(dt, 0.05)`。 */
export const MAX_DT = 0.05;

/** 更新长按怪的几个字段（返回新数组，不改传入状态）。 */
function setHoldFields(state: GameState, id: number, fields: Partial<HoldMonster>): GameState {
  return {
    ...state,
    monsters: state.monsters.map((x) =>
      x.id === id && x.kind === 'hold' ? { ...x, ...fields } : x,
    ),
  };
}

/**
 * 推进一帧。
 *
 * @param dt 距上一帧的秒数。超过 {@link MAX_DT} 会被钳制 —— 旧实现里 dt 的
 *   钳制点是唯一的 `loop()` 入口，纯函数化后收进 `tick()`，任何调用方都绕不过去。
 */
export function tick(
  state: GameState,
  dt: number,
  rng: Rng,
): { state: GameState; effects: Effect[] } {
  const step = Math.min(dt, MAX_DT);

  // 非 running：只保留出招动作的衰减（`source.html:1400-1411`）
  // 暂停时出招动作**不**衰减。
  if (state.phase !== 'running') {
    if (state.phase === 'paused') return { state, effects: [] };
    return { state: { ...state, attackT: Math.max(0, state.attackT - step) }, effects: [] };
  }

  const effects: Effect[] = [];

  // 回收上一帧之前已离场的怪物。
  // `removed` 是统一的离场标志，被移除的怪物保留到下一次 tick 开头再回收，
  // 这样它在存续期间仍可被观察到（`removed === true`），同时不会无限堆积。
  let s: GameState = {
    ...state,
    now: state.now + step,
    monsters: state.monsters.filter((m) => !m.removed),
  };
  const difficulty = difficultyAt(s.now);

  // ── 生成 ───────────────────────────────────────────────
  s = { ...s, spawnTimer: s.spawnTimer - step };
  if (s.spawnTimer <= 0) {
    const spawned = spawnMonster(s, rng);
    s = spawned.state;
    effects.push(...spawned.effects);
    s = { ...s, spawnTimer: spawnInterval(difficulty, s.diffLevel, rng) };
  }
  if (s.pairCooldown > 0) s = { ...s, pairCooldown: s.pairCooldown - step };
  if (s.longCooldown > 0) s = { ...s, longCooldown: s.longCooldown - step };

  // ── 1. 怪物推进 ─────────────────────────────────────────
  const reachX = s.layout.playerX + s.layout.playerR * 1.15 + 8;
  const breached: number[] = [];
  const moved: Monster[] = [];
  for (const m of s.monsters) {
    if (m.kind === 'hold') {
      if (m.escaped) {
        const x = m.x - m.escSpeed * step;
        moved.push({ ...m, x, removed: x + m.len < -60 });
        continue;
      }
      if (!m.anchored) {
        const x = m.x - speedNow(s.now, s.diffLevel) * 0.8 * step;
        // 头部越过判定圈仍未点击：判定漏怪
        if (longHeadX({ ...m, x }) < s.layout.hitX - s.layout.zoneHalf) {
          const penalized = missLong(s, m.id);
          s = penalized.state;
          effects.push(...penalized.effects);
          const missed = findMonster(s.monsters, m.id);
          if (missed) moved.push(missed);
          continue;
        }
        moved.push({ ...m, x });
        continue;
      }
      moved.push(m);
      continue;
    }
    // 在场怪物跟随全局移速曲线，保证整体节奏一致（到上限即恒定）
    const vx = -speedNow(s.now, s.diffLevel) * m.sf;
    const x = m.x + vx * step;
    const next = { ...m, vx, x, phase: m.phase + step * m.wob * 4 };
    if (x - m.w / 2 <= reachX) breached.push(m.id);
    moved.push(next);
  }
  s = { ...s, monsters: moved };

  // ── 2. 长按计时 ─────────────────────────────────────────
  // 长按敌人：连续长按计时；暂停中断后留出续按宽限（不造成伤害）
  for (const m of s.monsters) {
    if (m.kind !== 'hold' || m.removed || m.escaped || !m.anchored) continue;
    if (s.holdMonsterId === m.id) {
      const holdT = Math.min(m.holdT + step, LONG_HOLD_TIME);
      s = setHoldFields(s, m.id, { holdT });
      if (!m.midAwarded && holdT >= 1) {
        s = setHoldFields(s, m.id, { midAwarded: true });
        const awarded = longAward(s, m.id, LONG_1S_GAIN, '1 秒', m.x + m.len / 3, m.y - m.h * 1.45);
        s = awarded.state;
        effects.push(...awarded.effects);
        effects.push({ type: 'vibrate', pattern: 15 });
      }
      if (holdT >= LONG_HOLD_TIME) {
        const done = completeLong(s, m.id);
        s = done.state;
        effects.push(...done.effects);
        break;
      }
    } else {
      const waitT = m.waitT - step;
      s = setHoldFields(s, m.id, { waitT });
      if (waitT <= 0) {
        const failed = failLong(s, m.id);
        s = failed.state;
        effects.push(...failed.effects);
        break;
      }
    }
  }

  // ── 3. 双生挂起计时 ─────────────────────────────────────
  // 窗口内没等到另一轨，就按单只结算
  const pairExpired: number[] = [];
  for (const m of s.monsters) {
    if (m.kind !== 'twin' || m.removed || !m.pairPending) continue;
    const pairT = m.pairT - step;
    s = {
      ...s,
      monsters: s.monsters.map((x) => (x.id === m.id && x.kind === 'twin' ? { ...x, pairT } : x)),
    };
    if (pairT <= 0) pairExpired.push(m.id);
  }
  for (const id of pairExpired) {
    const resolved = resolvePairSolo(s, id);
    s = resolved.state;
    effects.push(...resolved.effects);
    if (s.phase !== 'running') break;
  }

  // ── 4. 触线伤害 ─────────────────────────────────────────
  for (const id of breached) {
    if (s.phase !== 'running') break;
    const m = findMonster(s.monsters, id);
    if (!m || m.removed) continue;
    // 双生一同触线：只结算一次伤害，另一只随锁链自毁
    const mateId = m.kind === 'twin' ? m.partnerId : null;
    if (mateId !== null) {
      const mate = findMonster(s.monsters, mateId);
      if (mate && !mate.removed) {
        s = {
          ...s,
          monsters: s.monsters.map((x) => {
            if (x.kind !== 'twin') return x;
            if (x.id === mateId) return { ...x, removed: true, partnerId: null };
            if (x.id === id) return { ...x, partnerId: null };
            return x;
          }),
        };
        effects.push({
          type: 'burst',
          x: mate.x,
          y: mate.y,
          color: PAIR_COLOR,
          count: 20,
          power: 1.1,
        });
        effects.push({
          type: 'ring',
          x: mate.x,
          y: mate.y,
          life: 0.4,
          r0: 8,
          r1: 64,
          color: PAIR_COLOR,
        });
      }
    }
    const hurt = hurtPlayer(s, id);
    s = hurt.state;
    effects.push(...hurt.effects);
    if (s.phase !== 'running') break;
  }

  // ── 表现层衰减里的规则部分 ──────────────────────────────
  // `emitFrenzy(dt)` 是纯视觉（且不消耗 PRNG），归表现层。
  if (s.frenzyActive) {
    const feverT = s.feverT - step;
    s = { ...s, feverT };
    if (feverT <= 0) {
      const ended = endFever(s);
      s = ended.state;
      effects.push(...ended.effects);
    }
  }
  s = { ...s, attackT: Math.max(0, s.attackT - step) };

  return { state: s, effects };
}
