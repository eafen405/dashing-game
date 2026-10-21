/**
 * 结算 —— `source.html:929-1232` 的纯函数化。
 *
 * 本文件包含旧实现里所有「决定胜负」的结算函数：
 *   普通怪击破 / 双生补齐与自爆 / 长按怪的起手·放弃·贯穿 / 角色受伤 / 游戏结束。
 *
 * 三条必须保持的时序（`legacy-semantics.md` §6）：
 *   1. **FEVER 触发在算分之前** —— 触发 FEVER 的那一次击破就享受 1.5 倍。
 *   2. **双生一次算 2 连击**（`killPair` 里 `combo += 2`）—— 影响 FEVER 触发点。
 *   3. **长按怪的三个得分点（头部 / 满 1 秒 / 尾部）都不增加 combo / kills**；
 *      只有 `completeLong` 才 `kills++; combo++;` 且计入**普攻**（不是暴击）。
 *
 * 视觉副作用全部改成效果事件，规则层自己什么都不画。
 */

import {
  ATTACK_DUR,
  BASE_GAIN,
  CRIT_GAIN,
  FEVER_COMBO,
  FEVER_MULT,
  FRENZY_LANE,
  GOLD,
  HIT_DAMAGE,
  LANE,
  LONG_COLOR,
  LONG_ESCAPE_SPEED,
  LONG_HEAD_GAIN,
  LONG_HOLD_TIME,
  LONG_TAIL_GAIN,
  LONG_WAIT,
  PAIR_COLOR,
  PAIR_CRIT_GAIN,
  PAIR_GAIN,
} from '../constants';
import type { Effect } from '../effects';
import type { GameState, HoldMonster, Lane, Monster } from '../types';
import { triggerFever } from './fever';

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

/** 按 id 找怪物。 */
export function findMonster(monsters: readonly Monster[], id: number): Monster | undefined {
  return monsters.find((m) => m.id === id);
}

/** 按 id 替换怪物（返回新数组，不改传入的数组）。 */
function patch(monsters: readonly Monster[], id: number, fn: (m: Monster) => Monster): Monster[] {
  return monsters.map((m) => (m.id === id ? fn(m) : m));
}

/** 轨道颜色 —— `source.html:1507-1509`。FEVER 时两轨仍保留区分度。 */
export function laneColorOf(lane: Lane, frenzyActive: boolean): string {
  return frenzyActive ? FRENZY_LANE[lane] : LANE[lane].color;
}

/** 长按怪头部横坐标 —— `source.html:1089-1091`。 */
export function longHeadX(m: HoldMonster): number {
  return m.x + m.h * 0.46;
}

/* ------------------------------------------------------------------ *
 * 普通怪击破
 * ------------------------------------------------------------------ */

/**
 * 击破一只怪物 —— `source.html:929-980`。
 *
 * @param crit 是否暴击。
 * @param silent 静默结算（不弹击杀提示，但仍然加分 / 计连击）。
 */
export function killMonster(
  state: GameState,
  monsterId: number,
  crit: boolean,
  silent = false,
): { state: GameState; effects: Effect[]; gain: number } {
  const m = findMonster(state.monsters, monsterId);
  if (!m || m.removed) return { state, effects: [], gain: 0 };

  let s: GameState = {
    ...state,
    monsters: patch(state.monsters, monsterId, (x) => ({ ...x, removed: true })),
  };

  // kills++; combo++; maxCombo = max(maxCombo, combo)
  const combo = s.combo + 1;
  s = {
    ...s,
    kills: s.kills + 1,
    combo,
    maxCombo: Math.max(s.maxCombo, combo),
    critCount: s.critCount + (crit ? 1 : 0),
    normalCount: s.normalCount + (crit ? 0 : 1),
  };

  // 每累计 50 连击进入 FEVER（持续 10 秒，可重复触发）
  const fever = triggerFever(s, combo);
  s = fever.state;
  const effects: Effect[] = [...fever.effects];

  // 中心暴击区 300 分，外围普攻 200 分；FEVER 期间 ×1.5
  const gain = Math.round((crit ? CRIT_GAIN : BASE_GAIN) * (s.frenzyActive ? FEVER_MULT : 1));
  s = { ...s, score: s.score + gain };

  const critCol = s.frenzyActive ? '#ffffff' : GOLD;
  const c = crit ? critCol : laneColorOf(m.lane, s.frenzyActive);
  effects.push({
    type: 'burst',
    x: m.x,
    y: m.y,
    color: c,
    count: crit ? 36 : 26,
    power: crit ? 1.5 : 1.25,
  });
  effects.push({
    type: 'burst',
    x: m.x,
    y: m.y,
    color: '#ffffff',
    count: crit ? 16 : 10,
    power: 0.9,
  });
  effects.push({
    type: 'ring',
    x: m.x,
    y: m.y,
    life: crit ? 0.5 : 0.4,
    r0: 10,
    r1: crit ? 88 : s.frenzyActive ? 74 : 58,
    color: c,
  });
  if (crit) {
    effects.push({ type: 'ring', x: m.x, y: m.y, life: 0.34, r0: 6, r1: 46, color: GOLD });
  }
  if (!fever.triggered && !silent) {
    if (crit) {
      effects.push({
        type: 'toast',
        text: '暴击' + (combo >= 5 ? ' x' + combo : '') + '  +' + gain,
        color: critCol,
      });
    } else {
      const text = s.frenzyActive
        ? 'FEVER x' + combo + '  +' + gain
        : combo >= 5
          ? '连击 x' + combo + '  +' + gain
          : '命中  +' + gain;
      effects.push({ type: 'toast', text, color: c });
    }
  }
  effects.push({ type: 'shake-add', amount: crit ? 11 : s.frenzyActive ? 7 : 5, cap: 17 });

  // 击杀双生中的一只：解除与另一只的锁链，避免留下悬挂引用
  if (m.kind === 'twin' && m.partnerId !== null) {
    const partnerId = m.partnerId;
    s = {
      ...s,
      monsters: s.monsters.map((x) => {
        if (x.kind !== 'twin') return x;
        if (x.id === partnerId) {
          return { ...x, partnerId: null, pairPending: false, pairT: 0, pairCrit: false };
        }
        if (x.id === monsterId) return { ...x, partnerId: null };
        return x;
      }),
    };
  }

  return { state: s, effects, gain };
}

/* ------------------------------------------------------------------ *
 * 双生结算
 * ------------------------------------------------------------------ */

/**
 * 双生补齐 —— `source.html:983-988`。
 *
 * @param struckId 刚刚被击中、位于本轨的那只（尚未挂起）。
 * @param crit 这一击是否落在暴击区。
 */
export function completePair(
  state: GameState,
  struckId: number,
  crit: boolean,
): { state: GameState; effects: Effect[] } {
  const struck = findMonster(state.monsters, struckId);
  if (!struck || struck.kind !== 'twin' || struck.partnerId === null) return { state, effects: [] };
  const pending = findMonster(state.monsters, struck.partnerId);
  if (!pending || pending.removed || pending.kind !== 'twin' || !pending.pairPending) {
    return { state, effects: [] };
  }
  const s: GameState = {
    ...state,
    monsters: patch(state.monsters, pending.id, (x) =>
      x.kind === 'twin' ? { ...x, pairPending: false } : x,
    ),
  };
  // 双方都暴击才算双生暴击
  return killPair(s, pending.id, struck.id, pending.pairCrit && crit);
}

/**
 * 同时击破双生 —— `source.html:990-1026`。
 *
 * 双生一次算 **2 连击**（`combo += 2`），直接影响 FEVER 触发点。
 */
export function killPair(
  state: GameState,
  aId: number,
  bId: number,
  critPair: boolean,
): { state: GameState; effects: Effect[] } {
  const a = findMonster(state.monsters, aId);
  const b = findMonster(state.monsters, bId);
  if (!a || !b) return { state, effects: [] };

  let s: GameState = {
    ...state,
    monsters: state.monsters.map((x) => {
      if (x.kind !== 'twin') return x;
      if (x.id === aId || x.id === bId) {
        return { ...x, removed: true, partnerId: null, pairPending: false };
      }
      return x;
    }),
  };

  const combo = s.combo + 2;
  s = {
    ...s,
    kills: s.kills + 2,
    combo,
    maxCombo: Math.max(s.maxCombo, combo),
    critCount: s.critCount + (critPair ? 2 : 0),
    normalCount: s.normalCount + (critPair ? 0 : 2),
  };

  const fever = triggerFever(s, combo);
  s = fever.state;
  const effects: Effect[] = [...fever.effects];

  const gain = Math.round(
    (critPair ? PAIR_CRIT_GAIN : PAIR_GAIN) * (s.frenzyActive ? FEVER_MULT : 1),
  );
  s = { ...s, score: s.score + gain };

  const col = critPair ? (s.frenzyActive ? '#ffffff' : GOLD) : PAIR_COLOR;
  for (const m of [a, b]) {
    effects.push({
      type: 'burst',
      x: m.x,
      y: m.y,
      color: col,
      count: critPair ? 34 : 28,
      power: critPair ? 1.5 : 1.3,
    });
    effects.push({ type: 'burst', x: m.x, y: m.y, color: '#ffffff', count: 12, power: 0.9 });
    effects.push({
      type: 'ring',
      x: m.x,
      y: m.y,
      life: 0.52,
      r0: 10,
      r1: critPair ? 92 : 72,
      color: col,
    });
  }
  effects.push({
    type: 'ring',
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    life: 0.5,
    r0: 20,
    r1: 150,
    color: PAIR_COLOR,
  });
  if (!fever.triggered) {
    effects.push({
      type: 'toast',
      text: (critPair ? '双生暴击' : '双生击破') + '  +' + gain,
      color: col,
    });
  }
  effects.push({ type: 'shake-add', amount: critPair ? 16 : 13, cap: 20 });
  effects.push({ type: 'vibrate', pattern: critPair ? [0, 30, 40, 60] : 40 });
  // 双生击破：角色做一次大幅度的跳起下砸
  effects.push({ type: 'pair-smash' });

  return { state: s, effects };
}

/**
 * 时间窗内只打到一只 —— `source.html:1029-1042`。
 *
 * 先打中的那只按普攻 / 暴击正常计分，另一只自爆并扣 20 血。
 */
export function resolvePairSolo(
  state: GameState,
  monsterId: number,
): { state: GameState; effects: Effect[] } {
  const m = findMonster(state.monsters, monsterId);
  if (!m || m.removed) return { state, effects: [] };
  const partnerId = m.kind === 'twin' ? m.partnerId : null;
  const crit = m.kind === 'twin' ? m.pairCrit : false;

  let s: GameState = {
    ...state,
    monsters: patch(state.monsters, monsterId, (x) =>
      x.kind === 'twin' ? { ...x, pairPending: false, partnerId: null } : x,
    ),
  };
  if (partnerId !== null) {
    s = {
      ...s,
      monsters: patch(s.monsters, partnerId, (x) =>
        x.kind === 'twin' ? { ...x, partnerId: null, pairPending: false, pairT: 0 } : x,
      ),
    };
  }

  const killed = killMonster(s, monsterId, crit, true);
  s = killed.state;
  const effects: Effect[] = [...killed.effects];

  if (partnerId !== null) {
    const p = findMonster(s.monsters, partnerId);
    if (p && !p.removed) {
      const blasted = pairBlast(s, partnerId, killed.gain);
      s = blasted.state;
      effects.push(...blasted.effects);
    }
  }
  return { state: s, effects };
}

/**
 * 双生自爆 —— `source.html:1044-1058`。另一只自爆并直接造成 20 伤害。
 */
export function pairBlast(
  state: GameState,
  monsterId: number,
  gain: number,
): { state: GameState; effects: Effect[] } {
  const p = findMonster(state.monsters, monsterId);
  if (!p || p.removed) return { state, effects: [] };

  let s: GameState = {
    ...state,
    monsters: patch(state.monsters, monsterId, (x) => ({ ...x, removed: true })),
  };
  const hp = Math.max(0, s.hp - HIT_DAMAGE);
  s = { ...s, hp };

  const effects: Effect[] = [
    { type: 'player-flash' },
    { type: 'shake-max', amount: 13 },
    { type: 'hurt' },
    { type: 'burst', x: p.x, y: p.y, color: '#ff4d6d', count: 26, power: 1.25 },
    { type: 'burst', x: p.x, y: p.y, color: PAIR_COLOR, count: 18, power: 1.0 },
    { type: 'ring', x: p.x, y: p.y, life: 0.45, r0: 10, r1: 80, color: '#ff4d6d' },
    { type: 'toast', text: '单破 +' + gain + ' · 另一只自爆 -' + HIT_DAMAGE, color: '#ff6b81' },
    { type: 'vibrate', pattern: 60 },
  ];

  if (hp <= 0) {
    const over = gameOver(s);
    s = over.state;
    effects.push(...over.effects);
  }
  return { state: s, effects };
}

/* ------------------------------------------------------------------ *
 * 长按怪结算
 * ------------------------------------------------------------------ */

/**
 * 长按怪的得分点 —— `source.html:1093-1101`。
 *
 * **长按的三个分数点都不增加 combo / kills**（头部 / 满 1 秒 / 尾部）。
 */
export function longAward(
  state: GameState,
  monsterId: number,
  points: number,
  tag: string,
  atX: number,
  atY?: number,
): { state: GameState; effects: Effect[]; gain: number } {
  const m = findMonster(state.monsters, monsterId);
  if (!m) return { state, effects: [], gain: 0 };
  const gain = Math.round(points * (state.frenzyActive ? FEVER_MULT : 1));
  const s: GameState = { ...state, score: state.score + gain };
  const y = atY != null ? atY : m.y - m.h * 0.85;
  const effects: Effect[] = [
    {
      type: 'floater',
      x: atX,
      y,
      text: '+' + gain + (tag ? ' ' + tag : ''),
      color: state.frenzyActive ? '#ffffff' : LONG_COLOR,
    },
    { type: 'burst', x: atX, y: m.y, color: LONG_COLOR, count: 10, power: 0.8 },
    { type: 'ring', x: atX, y: m.y, life: 0.3, r0: 5, r1: 28, color: LONG_COLOR },
  ];
  return { state: s, effects, gain };
}

/**
 * 起手按住长按怪 —— `source.html:1103-1123`。
 */
export function startHold(
  state: GameState,
  monsterId: number,
  inputId: string,
): { state: GameState; effects: Effect[] } {
  if (state.holdMonsterId !== null) return { state, effects: [] };
  const m = findMonster(state.monsters, monsterId);
  if (!m || m.removed || m.kind !== 'hold') return { state, effects: [] };

  let s: GameState = {
    ...state,
    holdMonsterId: m.id,
    holdInputId: inputId,
    attackT: ATTACK_DUR,
    attackLane: m.lane,
    playerLane: m.lane,
    // 长按是悬浮，不受滞空时间约束；结束后（下一次 tick）落回下轨
    airT: 0,
    monsters: patch(state.monsters, monsterId, (x) =>
      x.kind === 'hold' ? { ...x, holding: true, anchored: true, waitT: LONG_WAIT } : x,
    ),
  };

  const effects: Effect[] = [
    { type: 'lane-flash', lane: m.lane },
    {
      type: 'slash',
      x: longHeadX(m),
      x0: state.layout.playerX + state.layout.playerR * 1.05,
      y: m.y,
      life: 0.3,
      lane: m.lane,
    },
  ];

  const held = findMonster(s.monsters, monsterId);
  if (held && held.kind === 'hold' && !held.headAwarded) {
    s = {
      ...s,
      monsters: patch(s.monsters, monsterId, (x) =>
        x.kind === 'hold' ? { ...x, headAwarded: true } : x,
      ),
    };
    const awarded = longAward(s, monsterId, LONG_HEAD_GAIN, '头部', longHeadX(held));
    s = awarded.state;
    effects.push(...awarded.effects);
  }

  effects.push({
    type: 'toast',
    text: '长按中… 保持 ' + LONG_HOLD_TIME + ' 秒',
    color: LONG_COLOR,
  });
  effects.push({ type: 'vibrate', pattern: 20 });
  return { state: s, effects };
}

/**
 * 松开手指 —— `source.html:1125-1128`。
 *
 * 只有松开的正是发起长按的那根指针才会判定中断。
 */
export function releaseHold(
  state: GameState,
  inputId: string,
): { state: GameState; effects: Effect[] } {
  if (state.holdMonsterId === null || state.holdInputId !== inputId) {
    return { state, effects: [] };
  }
  return failLong(state, state.holdMonsterId);
}

/**
 * 长按失败的统一处理 —— `source.html:1130-1145`。
 *
 * **不扣血**，只是连击清零 + FEVER 中断 + 怪物滑出屏幕。
 */
export function longPenalty(
  state: GameState,
  monsterId: number,
  msg: string,
): { state: GameState; effects: Effect[] } {
  const m = findMonster(state.monsters, monsterId);
  if (!m || m.removed || m.kind !== 'hold') return { state, effects: [] };

  const s: GameState = {
    ...state,
    holdMonsterId: null,
    holdInputId: null,
    combo: 0,
    frenzyActive: false,
    feverT: 0,
    nextFeverAt: FEVER_COMBO,
    monsters: patch(state.monsters, monsterId, (x) =>
      x.kind === 'hold'
        ? { ...x, holding: false, escaped: true, anchored: false, escSpeed: LONG_ESCAPE_SPEED }
        : x,
    ),
  };

  const effects: Effect[] = [
    { type: 'toast', text: msg + ' · COMBO 清零', color: '#ff6b81' },
    { type: 'burst', x: longHeadX(m), y: m.y, color: '#ff4d6d', count: 22, power: 1.0 },
    { type: 'shake-max', amount: 8 },
    { type: 'vibrate', pattern: 60 },
  ];
  return { state: s, effects };
}

/** 按住不足 2 秒 —— `source.html:1147-1150`。 */
export function failLong(
  state: GameState,
  monsterId: number,
): { state: GameState; effects: Effect[] } {
  const m = findMonster(state.monsters, monsterId);
  if (!m || m.removed || m.kind !== 'hold' || m.escaped) return { state, effects: [] };
  return longPenalty(state, monsterId, '长按不足 ' + LONG_HOLD_TIME + ' 秒');
}

/** 头已越过判定区还没点 —— `source.html:1153-1156`。 */
export function missLong(
  state: GameState,
  monsterId: number,
): { state: GameState; effects: Effect[] } {
  const m = findMonster(state.monsters, monsterId);
  if (!m || m.removed || m.kind !== 'hold' || m.escaped) return { state, effects: [] };
  return longPenalty(state, monsterId, '漏掉了');
}

/**
 * 长按贯穿完成 —— `source.html:1158-1191`。
 *
 * 只有这里才 `kills++; combo++;`，且计入**普攻**（`normalCount++`），不是暴击。
 */
export function completeLong(
  state: GameState,
  monsterId: number,
): { state: GameState; effects: Effect[] } {
  const m = findMonster(state.monsters, monsterId);
  if (!m || m.removed) return { state, effects: [] };

  let s: GameState = {
    ...state,
    holdMonsterId: null,
    holdInputId: null,
    monsters: patch(state.monsters, monsterId, (x) =>
      x.kind === 'hold' ? { ...x, removed: true, anchored: false, holding: false } : x,
    ),
  };

  const combo = s.combo + 1;
  s = {
    ...s,
    kills: s.kills + 1,
    combo,
    maxCombo: Math.max(s.maxCombo, combo),
    normalCount: s.normalCount + 1,
  };

  const fever = triggerFever(s, combo);
  s = fever.state;
  const effects: Effect[] = [...fever.effects];

  const held = findMonster(s.monsters, monsterId);
  if (held && held.kind === 'hold') {
    const awarded = longAward(s, monsterId, LONG_TAIL_GAIN, '尾部', held.x + held.len - 10);
    s = awarded.state;
    effects.push(...awarded.effects);
  }
  if (!fever.triggered) {
    effects.push({ type: 'toast', text: '长按贯穿！', color: LONG_COLOR });
  }

  // 沿整条身体爆开
  if (held && held.kind === 'hold') {
    for (let i = 0; i < 6; i++) {
      const px = held.x + held.len * (i / 5);
      effects.push({ type: 'burst', x: px, y: held.y, color: LONG_COLOR, count: 9, power: 0.95 });
      effects.push({ type: 'burst', x: px, y: held.y, color: '#ffffff', count: 4, power: 0.6 });
    }
    effects.push({
      type: 'ring',
      x: held.x + held.len / 2,
      y: held.y,
      life: 0.46,
      r0: 20,
      r1: Math.max(held.len * 0.42, 70),
      color: LONG_COLOR,
    });
  }
  effects.push({ type: 'shake-add', amount: 12, cap: 18 });
  effects.push({ type: 'vibrate', pattern: [0, 40, 50, 60] });
  return { state: s, effects };
}

/**
 * 暂停 / 切后台时取消长按 —— `source.html:1193-1198`。
 *
 * **不惩罚**：`anchored` 保持 true，怪物停住等待续按。
 */
export function cancelHold(state: GameState): { state: GameState; effects: Effect[] } {
  if (state.holdMonsterId === null) return { state, effects: [] };
  const id = state.holdMonsterId;
  const s: GameState = {
    ...state,
    holdMonsterId: null,
    holdInputId: null,
    monsters: patch(state.monsters, id, (x) =>
      x.kind === 'hold' && !x.removed ? { ...x, holding: false } : x,
    ),
  };
  return { state: s, effects: [] };
}

/* ------------------------------------------------------------------ *
 * 受伤与结束
 * ------------------------------------------------------------------ */

/**
 * 角色受伤（漏怪）—— `source.html:1215-1232`。
 *
 * @param collides 角色是否**碰到**了这只怪。角色只驻守一条轨道，
 *   另一轨漏过来的怪会从身边擦过：不扣血、不闪红，但连击 / FEVER 照样清零。
 *   双生怪两轨各有一只，触线时必定撞上角色（调用方传 `true`）。
 */
export function hurtPlayer(
  state: GameState,
  monsterId: number,
  collides = true,
): { state: GameState; effects: Effect[] } {
  const m = findMonster(state.monsters, monsterId);
  if (!m || m.removed) return { state, effects: [] };

  // 擦身而过：只断连击，不扣血
  if (!collides) {
    const s: GameState = {
      ...state,
      combo: 0,
      frenzyActive: false,
      feverT: 0,
      nextFeverAt: FEVER_COMBO,
      monsters: patch(state.monsters, monsterId, (x) => ({ ...x, removed: true })),
    };
    const effects: Effect[] = [
      { type: 'burst', x: m.x, y: m.y, color: '#9fb0cf', count: 12, power: 0.7 },
      { type: 'ring', x: m.x, y: m.y, life: 0.3, r0: 6, r1: 30, color: '#9fb0cf' },
      { type: 'toast', text: '错过 · COMBO 清零', color: '#ffcf6b' },
    ];
    return { state: s, effects };
  }

  const hp = Math.max(0, state.hp - HIT_DAMAGE);
  let s: GameState = {
    ...state,
    hp,
    combo: 0,
    frenzyActive: false,
    feverT: 0,
    nextFeverAt: FEVER_COMBO,
    monsters: patch(state.monsters, monsterId, (x) => ({ ...x, removed: true })),
  };

  // 受击反馈画在角色驻守的轨道上（默认下轨）
  const playerY = state.layout.laneY[state.playerLane ?? 'bottom'];
  const effects: Effect[] = [
    { type: 'player-flash' },
    { type: 'shake-set', amount: 14 },
    { type: 'hurt' },
    { type: 'burst', x: m.x, y: m.y, color: '#ff4d6d', count: 22, power: 1.15 },
    {
      type: 'ring',
      x: s.layout.playerX + s.layout.playerR,
      y: playerY,
      life: 0.45,
      r0: 14,
      r1: 70,
      color: '#ff4d6d',
    },
    { type: 'toast', text: '-' + HIT_DAMAGE, color: '#ff4d6d' },
    { type: 'vibrate', pattern: 60 },
  ];

  if (hp <= 0) {
    const over = gameOver(s);
    s = over.state;
    effects.push(...over.effects);
  }
  return { state: s, effects };
}

/**
 * 游戏结束 —— `source.html:715-730`。
 *
 * 最高分（`best`）的跨局持久化属于 HUD / 存储层，不在规则层。
 */
export function gameOver(state: GameState): { state: GameState; effects: Effect[] } {
  if (state.phase === 'over') return { state, effects: [] };
  const cancelled = cancelHold(state);
  return {
    state: { ...cancelled.state, phase: 'over' },
    effects: [{ type: 'game-over' }],
  };
}
