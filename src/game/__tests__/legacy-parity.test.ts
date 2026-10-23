/**
 * 与旧实现的对照（characterization test）。
 *
 * 旧实现原样摘录在下面，作为**独立的事实来源**：
 * 新实现的生成路径必须与它逐字一致 —— 同样的随机数消费顺序、同样的字段取值。
 *
 * 唯一的例外是 D2：`computeLayout()` 按正确顺序重算 playerX → hitX。
 * `clearLane()` 保持旧实现的「空轨」语义（D1 的误判已在票 11 回退），
 * 所以下面的对照基准就是旧实现原样。
 */

import { describe, expect, it } from 'vitest';

import { DIFFS } from '../constants';
import { createRng, type Rng } from '../rng';
import { spawnMonster } from '../rules/spawn';
import { makeState } from './fixtures';

/* ------------------------------------------------------------------ *
 * 旧实现原样摘录
 * ------------------------------------------------------------------ */

interface LegacyMonster {
  lane: 'top' | 'bottom';
  x: number;
  y: number;
  w: number;
  h: number;
  phase: number;
  /** 普通怪 / 双生怪才有 */
  vx?: number;
  sf?: number;
  wob?: number;
  /** 长按怪才有 */
  long?: boolean;
  len?: number;
  /** 双生怪才有 */
  pairId?: number;
  partner?: LegacyMonster | null;
  done?: boolean;
}

interface LegacyState {
  now: number;
  diffLevel: 1 | 2;
  longCooldown: number;
  pairCooldown: number;
  W: number;
  H: number;
  laneY: { top: number; bottom: number };
  monsters: LegacyMonster[];
  pairSeq: number;
}

/** `source.html:493` */
function legacyRand(a: number, b: number, rng: Rng): number {
  return a + rng.next() * (b - a);
}

/** `source.html:494` */
function legacyClamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/** `source.html:740-746` */
function legacySpeedNow(now: number, diffLevel: 1 | 2): number {
  const t = legacyClamp(now / 75, 0, 1);
  const k = t * t * (3 - 2 * t);
  return (165 + (300 - 165) * k) * DIFFS[diffLevel].speedMul;
}

/** `source.html:794-796` */
function legacyHasActiveLong(st: LegacyState): boolean {
  return st.monsters.some((m) => m.long && !m.done);
}

/** `source.html:797-799` */
function legacyHasActivePair(st: LegacyState): boolean {
  return st.monsters.some((m) => !!m.partner && !m.done);
}

/** `source.html:800-802` */
function legacyLaneBlocked(st: LegacyState, lane: 'top' | 'bottom'): boolean {
  return st.monsters.some((m) => m.long && !m.done && m.lane === lane);
}

/**
 * `source.html:803-810` —— 原样保留：一条轨道上**有任何在场怪物**就算占用。
 *
 * 长按怪必须独占一条空轨，否则会吞掉同轨普通怪的输入（见票 11）。
 */
function legacyClearLane(st: LegacyState, rng: Rng): 'top' | 'bottom' | null {
  const topBusy = st.monsters.some((m) => m.lane === 'top' && !m.done);
  const botBusy = st.monsters.some((m) => m.lane === 'bottom' && !m.done);
  if (!topBusy && !botBusy) return rng.next() < 0.5 ? 'top' : 'bottom';
  if (!topBusy) return 'top';
  if (!botBusy) return 'bottom';
  return null;
}

/** `source.html:812-831` */
function legacySpawnLong(st: LegacyState, lane: 'top' | 'bottom', rng: Rng): void {
  const len = legacyClamp(st.W * 0.26, 180, 300);
  st.monsters.push({
    lane,
    x: st.W + 30,
    y: st.laneY[lane],
    len,
    h: legacyClamp(st.H * 0.1, 26, 44),
    w: len,
    phase: legacyRand(0, Math.PI * 2, rng),
    long: true,
    done: false,
  });
}

/** `source.html:833-858` */
function legacySpawnPair(st: LegacyState, rng: Rng): void {
  const scale = Math.max(st.W, 1) / 900;
  const sf = legacyClamp(scale, 0.8, 1.9) * legacyRand(0.97, 1.03, rng);
  const spd = legacySpeedNow(st.now, st.diffLevel) * sf;
  const startX = st.W + 60;
  const w = legacyClamp(st.W * 0.055, 40, 62);
  const h = legacyClamp(st.H * 0.17, 40, 78);
  const id = ++st.pairSeq;
  const phase = legacyRand(0, Math.PI * 2, rng);
  const mk = (lane: 'top' | 'bottom'): LegacyMonster => ({
    lane,
    x: startX,
    y: st.laneY[lane],
    vx: -spd,
    sf,
    w,
    h,
    phase,
    wob: legacyRand(0.8, 1.6, rng),
    pairId: id,
    partner: null,
  });
  const a = mk('top');
  const b = mk('bottom');
  a.partner = b;
  b.partner = a;
  st.monsters.push(a, b);
}

/** `source.html:748-792` */
function legacySpawnMonster(st: LegacyState, rng: Rng): void {
  // 长按敌人：独占一条空轨，出现后该轨不再刷新其他怪
  if (st.now > 8 && st.longCooldown <= 0 && !legacyHasActiveLong(st) && !legacyHasActivePair(st)) {
    const lane = legacyClearLane(st, rng);
    if (lane && rng.next() < 0.28) {
      legacySpawnLong(st, lane, rng);
      st.longCooldown = legacyRand(14, 18, rng);
      return;
    }
  }

  // 双生敌人
  if (
    !legacyHasActiveLong(st) &&
    !legacyHasActivePair(st) &&
    st.now > 6 &&
    st.pairCooldown <= 0 &&
    rng.next() < 0.2
  ) {
    legacySpawnPair(st, rng);
    st.pairCooldown = legacyRand(5, 8, rng);
    return;
  }

  // 普通怪
  let lane: 'top' | 'bottom' = rng.next() < 0.5 ? 'top' : 'bottom';
  if (legacyLaneBlocked(st, lane)) {
    const other = lane === 'top' ? 'bottom' : 'top';
    if (legacyLaneBlocked(st, other)) return;
    lane = other;
  }
  const vw = Math.max(st.W, 1);
  const scale = vw / 900;
  const sf = legacyClamp(scale, 0.8, 1.9) * legacyRand(0.97, 1.03, rng);
  const spd = legacySpeedNow(st.now, st.diffLevel) * sf;
  const startX = st.W + 60;
  const y = st.laneY[lane] + legacyRand(-6, 6, rng);
  st.monsters.push({
    lane,
    x: startX,
    y,
    vx: -spd,
    sf,
    w: legacyClamp(st.W * 0.055, 40, 62),
    h: legacyClamp(st.H * 0.17, 40, 78),
    phase: legacyRand(0, Math.PI * 2, rng),
    wob: legacyRand(0.8, 1.6, rng),
  });
}

/* ------------------------------------------------------------------ *
 * 对照测试
 * ------------------------------------------------------------------ */

describe('生成路径与旧实现逐字一致', () => {
  it('连续 200 次生成的怪物字段与冷却值完全一致', () => {
    // 两个**独立但同种子**的随机源：任一方多消耗或少消耗一次随机数，
    // 后续所有抽样都会错位，字段比对立刻失败。
    const rngNew = createRng(20240521);
    const rngLegacy = createRng(20240521);

    let state = makeState();
    const legacy: LegacyState = {
      now: 0,
      diffLevel: 1,
      longCooldown: 6,
      pairCooldown: 4.5,
      W: 900,
      H: 500,
      laneY: { top: 140, bottom: 360 },
      monsters: [],
      pairSeq: 0,
    };

    for (let i = 0; i < 200; i++) {
      const next = spawnMonster(state, rngNew);
      state = next.state;
      legacySpawnMonster(legacy, rngLegacy);

      // 怪物的数量与顺序必须一致
      expect(state.monsters.length).toBe(legacy.monsters.length);

      // 逐只比对字段
      for (let k = 0; k < legacy.monsters.length; k++) {
        const actual = state.monsters[k];
        const expected = legacy.monsters[k];
        if (!actual || !expected) throw new Error('怪物数量不一致');

        expect(actual.lane).toBe(expected.lane);
        expect(actual.x).toBe(expected.x);
        expect(actual.y).toBe(expected.y);
        if (actual.kind === 'hold') {
          expect(actual.len).toBe(expected.len);
        } else {
          expect(actual.vx).toBe(expected.vx);
          expect(actual.sf).toBe(expected.sf);
          expect(actual.w).toBe(expected.w);
          expect(actual.h).toBe(expected.h);
          expect(actual.phase).toBe(expected.phase);
          expect(actual.wob).toBe(expected.wob);
        }
      }

      // 冷却值必须一致
      expect(state.longCooldown).toBe(legacy.longCooldown);
      expect(state.pairCooldown).toBe(legacy.pairCooldown);
      expect(state.pairSeq).toBe(legacy.pairSeq);

      // 推进时间与冷却（模拟主循环）
      const step = 1;
      state = { ...state, now: state.now + step };
      legacy.now += step;
      state = {
        ...state,
        longCooldown: state.longCooldown > 0 ? state.longCooldown - step : state.longCooldown,
        pairCooldown: state.pairCooldown > 0 ? state.pairCooldown - step : state.pairCooldown,
      };
      legacy.longCooldown =
        legacy.longCooldown > 0 ? legacy.longCooldown - step : legacy.longCooldown;
      legacy.pairCooldown =
        legacy.pairCooldown > 0 ? legacy.pairCooldown - step : legacy.pairCooldown;
    }
  });
});
