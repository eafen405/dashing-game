/**
 * 怪物生成 —— `source.html:748-858` 的纯函数化。
 *
 * **随机数消费顺序是保真的命门**（见 `legacy-semantics.md` §9）。
 * 本文件里的每一次 `rng.next()` / `rng.range()` 都与旧实现一一对应，
 * 顺序也必须一一对应 —— 少一次、多一次、换个位置，整条 trace 就废了。
 *
 * 逐条对照（行号 = `source.html`）：
 *   735  rand(-0.12, 0.16)     → `spawnInterval()`（在 `rules/difficulty.ts`）
 *   752  Math.random() < 0.28  → 长按怪判定，**在 `clearLane()` 之后**
 *   754  rand(14, 18)          → 长按怪冷却
 *   760  Math.random() < 0.20  → 双生判定
 *   762  rand(5.0, 8.0)        → 双生冷却
 *   766  Math.random() < 0.5   → 普通怪选轨
 *   775  rand(0.97, 1.03)      → 普通怪速度系数
 *   779  rand(-6, 6)           → 普通怪 y 抖动
 *   789  rand(0, 2π)           → 普通怪 phase
 *   790  rand(0.8, 1.6)        → 普通怪 wob
 *   806  Math.random() < 0.5   → `clearLane()` 选轨
 *   823  rand(0, 2π)           → 长按怪 phase
 *   835  rand(0.97, 1.03)      → 双生 sf
 *   841  rand(0, 2π)           → 双生 phase
 *   846  rand(0.8, 1.6) ×2     → 双生两只的 wob
 */

import { LONG_COLOR, LONG_ESCAPE_SPEED, LONG_WAIT, PAIR_COLOR } from '../constants';
import type { Effect } from '../effects';
import { clamp } from '../math';
import type { Rng } from '../rng';
import type { GameState, HoldMonster, Lane, Monster, NormalMonster, TwinMonster } from '../types';
import { speedNow } from './difficulty';

/* ------------------------------------------------------------------ *
 * 轨道占用判断
 * ------------------------------------------------------------------ */

/**
 * 场上是否有**长按怪** —— `source.html:794-796`。
 *
 * 新语义：用统一的 `removed` 标志（旧实现用的是长按怪专属的 `done`）。
 */
export function hasActiveLong(monsters: readonly Monster[]): boolean {
  return monsters.some((m) => m.kind === 'hold' && !m.removed);
}

/**
 * 场上是否有**双生** —— `source.html:797-799`。
 *
 * 新语义：双生怪靠 `partnerId` 互指；`removed` 是统一的离场标志。
 * （旧实现的 `!m.done` 对双生怪恒为真，等价于「场上有任何带 partner 的怪」，
 *  与 `clearLane()` 的口径不一致 —— 见 D4。）
 */
export function hasActivePair(monsters: readonly Monster[]): boolean {
  return monsters.some(
    (m) =>
      m.kind === 'twin' &&
      !m.removed &&
      m.partnerId !== null &&
      monsters.some((p) => p.id === m.partnerId && !p.removed),
  );
}

/**
 * 该轨道是否被**长按怪**占用 —— `source.html:800-802`。
 */
export function laneBlocked(monsters: readonly Monster[], lane: Lane): boolean {
  return monsters.some((m) => m.kind === 'hold' && !m.removed && m.lane === lane);
}

/**
 * 找一条没有被长按怪占用的轨道 —— `source.html:803-810`。
 *
 * **修 Bug 1（已知差异 D1）**：旧实现用 `!m.done` 判占用，但 `done` 只在长按怪上
 * 赋值，普通怪与双生怪的 `done` 永远是 `undefined`（falsy）→ 只要场上有任何普通怪，
 * 两轨都判「占用」→ 本函数恒返回 `null` → 长按怪几乎刷不出来。
 * 新语义：**只有长按怪算占用**。
 *
 * 随机数消费：两轨都空时消耗**一次** PRNG（`Math.random() < 0.5` 选轨）；
 * 只有一轨被占时直接返回那一条空轨，**不**消耗 PRNG。
 */
export function clearLane(monsters: readonly Monster[], rng: Rng): Lane | null {
  const topBusy = monsters.some((m) => m.kind === 'hold' && !m.removed && m.lane === 'top');
  const botBusy = monsters.some((m) => m.kind === 'hold' && !m.removed && m.lane === 'bottom');
  if (!topBusy && !botBusy) return rng.next() < 0.5 ? 'top' : 'bottom';
  if (!topBusy) return 'top';
  if (!botBusy) return 'bottom';
  return null;
}

/**
 * 找某条轨道上的长按怪 —— `source.html:1082-1087`。
 *
 * 长按怪 escaped 但还没滑出屏幕时 `removed` 仍是 `false`，
 * 所以它**依然会被找到**、依然吞掉该轨的输入。
 */
export function findLongInLane(monsters: readonly Monster[], lane: Lane): HoldMonster | null {
  for (const m of monsters) {
    if (m.kind === 'hold' && !m.removed && m.lane === lane) return m;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 生成
 * ------------------------------------------------------------------ */

/** 生成一只长按怪 —— `source.html:812-831`。 */
export function spawnLong(
  state: GameState,
  lane: Lane,
  rng: Rng,
): { state: GameState; effects: Effect[] } {
  const { layout } = state;
  const len = clamp(layout.width * 0.26, 180, 300);
  const monster: HoldMonster = {
    kind: 'hold',
    id: state.nextMonsterId,
    lane,
    x: layout.width + 30,
    y: layout.laneY[lane],
    len,
    h: clamp(layout.height * 0.1, 26, 44),
    w: len,
    removed: false,
    phase: rng.range(0, Math.PI * 2),
    anchored: false,
    escaped: false,
    holdT: 0,
    headAwarded: false,
    midAwarded: false,
    waitT: LONG_WAIT,
    holding: false,
    tipT: null,
    escSpeed: LONG_ESCAPE_SPEED,
  };

  const effects: Effect[] = [];
  let next = state;
  if (!next.longHintShown) {
    next = { ...next, longHintShown: true };
    effects.push({ type: 'toast', text: '长按敌人！头进判定框后点击', color: LONG_COLOR });
  }

  return {
    state: { ...next, monsters: [...next.monsters, monster], nextMonsterId: monster.id + 1 },
    effects,
  };
}

/** 生成一组双生怪 —— `source.html:833-858`。 */
export function spawnPair(state: GameState, rng: Rng): { state: GameState; effects: Effect[] } {
  const { layout } = state;
  const scale = Math.max(layout.width, 1) / 900;
  const sf = clamp(scale, 0.8, 1.9) * rng.range(0.97, 1.03);
  const spd = speedNow(state.now, state.diffLevel) * sf;
  const startX = layout.width + 60;
  const w = clamp(layout.width * 0.055, 40, 62);
  const h = clamp(layout.height * 0.17, 40, 78);
  const pairId = state.pairSeq + 1;
  const phase = rng.range(0, Math.PI * 2); // 同步浮动，锁链保持水平

  const aId = state.nextMonsterId;
  const bId = aId + 1;
  const a: TwinMonster = {
    kind: 'twin',
    id: aId,
    lane: 'top',
    x: startX,
    y: layout.laneY.top,
    vx: -spd,
    sf,
    w,
    h,
    removed: false,
    phase,
    wob: rng.range(0.8, 1.6),
    pairId,
    partnerId: bId,
    pairPending: false,
    pairT: 0,
    pairCrit: false,
  };
  // 两只各自抽一次浮动系数（旧实现 `mk()` 被调用两次，各抽一次）
  const b: TwinMonster = {
    ...a,
    id: bId,
    lane: 'bottom',
    y: layout.laneY.bottom,
    wob: rng.range(0.8, 1.6),
    partnerId: aId,
  };

  const effects: Effect[] = [];
  let next = state;
  if (!next.pairHintShown) {
    next = { ...next, pairHintShown: true };
    effects.push({ type: 'toast', text: '双生敌人！上下轨同时击破 +700', color: PAIR_COLOR });
  }

  return {
    state: {
      ...next,
      monsters: [...next.monsters, a, b],
      pairSeq: pairId,
      nextMonsterId: bId + 1,
    },
    effects,
  };
}

/**
 * 生成一只怪物 —— `source.html:748-792`。
 *
 * 判定顺序必须照抄：**长按怪 → 双生 → 普通怪**。
 */
export function spawnMonster(state: GameState, rng: Rng): { state: GameState; effects: Effect[] } {
  // 长按敌人：独占一条空轨，出现后该轨不再刷新其他怪
  if (
    state.now > 8 &&
    state.longCooldown <= 0 &&
    !hasActiveLong(state.monsters) &&
    !hasActivePair(state.monsters)
  ) {
    // 关键：`clearLane()` 的求值（及其内部的 PRNG 消耗）发生在 0.28 判定**之前**。
    // 旧实现写的是 `if (lane && Math.random() < 0.28)`，短路语义保持不变：
    // `lane` 为 null 时不消耗这一次 PRNG。
    const lane = clearLane(state.monsters, rng);
    if (lane !== null && rng.next() < 0.28) {
      const spawned = spawnLong(state, lane, rng);
      // 旧实现的顺序：`spawnLong(lane)` 之后才掷 `rand(14, 18)`
      const longCooldown = rng.range(14, 18);
      return { state: { ...spawned.state, longCooldown }, effects: spawned.effects };
    }
  }

  // 双生敌人：开局数秒后按概率成对出现；长按敌人存在时不会刷新双生
  if (
    !hasActiveLong(state.monsters) &&
    !hasActivePair(state.monsters) &&
    state.now > 6 &&
    state.pairCooldown <= 0 &&
    rng.next() < 0.2
  ) {
    const spawned = spawnPair(state, rng);
    const pairCooldown = rng.range(5.0, 8.0);
    return { state: { ...spawned.state, pairCooldown }, effects: spawned.effects };
  }

  // 普通怪
  let lane: Lane = rng.next() < 0.5 ? 'top' : 'bottom';
  if (laneBlocked(state.monsters, lane)) {
    const other: Lane = lane === 'top' ? 'bottom' : 'top';
    if (laneBlocked(state.monsters, other)) return { state, effects: [] }; // 两条轨道都被长按敌人占用
    lane = other;
  }
  const vw = Math.max(state.layout.width, 1);
  // 以 900 宽为基准换算速度，保证不同分辨率体验一致
  const scale = vw / 900;
  const sf = clamp(scale, 0.8, 1.9) * rng.range(0.97, 1.03);
  const spd = speedNow(state.now, state.diffLevel) * sf;
  const startX = state.layout.width + 60;
  const y = state.layout.laneY[lane] + rng.range(-6, 6);

  const monster: NormalMonster = {
    kind: 'normal',
    id: state.nextMonsterId,
    lane,
    x: startX,
    y,
    vx: -spd,
    sf,
    w: clamp(state.layout.width * 0.055, 40, 62),
    h: clamp(state.layout.height * 0.17, 40, 78),
    removed: false,
    phase: rng.range(0, Math.PI * 2),
    wob: rng.range(0.8, 1.6),
  };

  return {
    state: { ...state, monsters: [...state.monsters, monster], nextMonsterId: monster.id + 1 },
    effects: [],
  };
}
