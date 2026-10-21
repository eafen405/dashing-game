import { describe, expect, it } from 'vitest';

import {
  cancelHold,
  completeLong,
  completePair,
  failLong,
  gameOver,
  hurtPlayer,
  killMonster,
  killPair,
  longAward,
  longPenalty,
  missLong,
  pairBlast,
  releaseHold,
  resolvePairSolo,
  startHold,
} from '../rules/resolve';
import { holdMonster, makeState, normalMonster, twinPair } from './fixtures';

const HIT_X = 345.9;

describe('击破普通怪', () => {
  it('普攻 200 分，连击 +1，计入普攻数', () => {
    const state = makeState({ monsters: [normalMonster()] });

    const { state: next, gain } = killMonster(state, 1, false);

    expect(gain).toBe(200);
    expect(next.score).toBe(200);
    expect(next.combo).toBe(1);
    expect(next.kills).toBe(1);
    expect(next.normalCount).toBe(1);
    expect(next.critCount).toBe(0);
  });

  it('暴击 300 分，计入暴击数', () => {
    const state = makeState({ monsters: [normalMonster()] });

    const { state: next, gain } = killMonster(state, 1, true);

    expect(gain).toBe(300);
    expect(next.critCount).toBe(1);
    expect(next.normalCount).toBe(0);
  });

  it('静默结算仍然加分计连击，只是不弹提示', () => {
    const state = makeState({ monsters: [normalMonster()] });

    const { state: next, effects } = killMonster(state, 1, false, true);

    expect(next.score).toBe(200);
    expect(next.combo).toBe(1);
    expect(effects.some((e) => e.type === 'toast')).toBe(false);
  });

  it('触发 FEVER 的那一次击破就享受 1.5 倍（gain 在触发之后计算）', () => {
    const state = makeState({ monsters: [normalMonster()], combo: 49, nextFeverAt: 50 });

    const { state: next, gain } = killMonster(state, 1, false);

    expect(next.combo).toBe(50);
    expect(next.frenzyActive).toBe(true);
    expect(next.feverT).toBe(10);
    expect(next.nextFeverAt).toBe(100);
    expect(gain).toBe(300); // 200 × 1.5
    expect(next.score).toBe(300);
  });

  it('已在 FEVER 中时不再重复触发', () => {
    const state = makeState({
      monsters: [normalMonster()],
      combo: 60,
      nextFeverAt: 100,
      frenzyActive: true,
      feverT: 5,
    });

    const { state: next, gain } = killMonster(state, 1, false);

    expect(next.frenzyActive).toBe(true);
    expect(next.feverT).toBe(5);
    expect(next.nextFeverAt).toBe(100);
    expect(gain).toBe(300);
  });
});

describe('双生结算', () => {
  it('同时击破双生 700 分，一次算 2 连击', () => {
    const [a, b] = twinPair();
    const state = makeState({ monsters: [a, b] });

    const { state: next } = killPair(state, a.id, b.id, false);

    expect(next.score).toBe(700);
    expect(next.kills).toBe(2);
    expect(next.combo).toBe(2);
    expect(next.normalCount).toBe(2);
  });

  it('双生暴击 1000 分', () => {
    const [a, b] = twinPair();
    const state = makeState({ monsters: [a, b] });

    const { state: next } = killPair(state, a.id, b.id, true);

    expect(next.score).toBe(1000);
    expect(next.critCount).toBe(2);
  });

  it('双生一次算 2 连击会影响 FEVER 触发点', () => {
    const [a, b] = twinPair();
    const state = makeState({ monsters: [a, b], combo: 48, nextFeverAt: 50 });

    const { state: next } = killPair(state, a.id, b.id, false);

    expect(next.combo).toBe(50);
    expect(next.frenzyActive).toBe(true);
    expect(next.score).toBe(1050); // 700 × 1.5
  });

  it('补齐时只有双方都暴击才算双生暴击', () => {
    const [a, b] = twinPair();
    a.pairPending = true;
    a.pairCrit = true;
    const state = makeState({ monsters: [a, b] });

    const { state: next } = completePair(state, b.id, false);

    expect(next.score).toBe(700);
    expect(next.critCount).toBe(0);
  });

  it('补齐时双方都暴击 → 1000 分', () => {
    const [a, b] = twinPair();
    a.pairPending = true;
    a.pairCrit = true;
    const state = makeState({ monsters: [a, b] });

    const { state: next } = completePair(state, b.id, true);

    expect(next.score).toBe(1000);
    expect(next.critCount).toBe(2);
  });

  it('时间窗过期：先中的那只按普攻计分，另一只自爆扣 20 血', () => {
    const [a, b] = twinPair();
    a.pairPending = true;
    const state = makeState({ monsters: [a, b] });

    const { state: next } = resolvePairSolo(state, a.id);

    expect(next.score).toBe(200);
    expect(next.kills).toBe(1);
    expect(next.hp).toBe(230);
    expect(next.monsters.every((m) => m.removed)).toBe(true);
  });

  it('时间窗过期：先中的那一击是暴击就按暴击计分', () => {
    const [a, b] = twinPair();
    a.pairPending = true;
    a.pairCrit = true;
    const state = makeState({ monsters: [a, b] });

    const { state: next } = resolvePairSolo(state, a.id);

    expect(next.score).toBe(300);
    expect(next.critCount).toBe(1);
    expect(next.hp).toBe(230);
  });

  it('自爆直接扣 20 血（与旧实现一致：自爆不清连击）', () => {
    const [a, b] = twinPair();
    const state = makeState({ monsters: [a, b], combo: 9 });

    const { state: next } = pairBlast(state, b.id, 200);

    expect(next.hp).toBe(230);
    expect(next.combo).toBe(9);
  });
});

describe('长按怪结算', () => {
  it('起手按住：头部得分 200，但不增加连击与击杀', () => {
    const state = makeState({ monsters: [holdMonster()] });

    const { state: next } = startHold(state, 1, 'p1');

    expect(next.score).toBe(200);
    expect(next.combo).toBe(0);
    expect(next.kills).toBe(0);
    expect(next.holdMonsterId).toBe(1);
    expect(next.holdInputId).toBe('p1');
  });

  it('重复起手不重复发放头部得分', () => {
    const state = makeState({ monsters: [holdMonster({ headAwarded: true })] });

    const { state: next } = startHold(state, 1, 'p1');

    expect(next.score).toBe(0);
  });

  it('长按的得分点不增加连击与击杀', () => {
    const state = makeState({ monsters: [holdMonster()] });

    const { state: next, gain } = longAward(state, 1, 200, '头部', 300);

    expect(gain).toBe(200);
    expect(next.score).toBe(200);
    expect(next.combo).toBe(0);
    expect(next.kills).toBe(0);
  });

  it('松开发起长按的那根指针 → 判定长按失败（连击清零，不扣血）', () => {
    const state = makeState({ monsters: [holdMonster()], combo: 12 });
    const held = startHold(state, 1, 'p1').state;

    const { state: next } = releaseHold(held, 'p1');

    expect(next.combo).toBe(0);
    expect(next.hp).toBe(250);
    expect(next.holdMonsterId).toBeNull();
  });

  it('松开别的指针不判定长按失败', () => {
    const state = makeState({ monsters: [holdMonster()], combo: 12 });
    const held = startHold(state, 1, 'p1').state;

    const { state: next } = releaseHold(held, 'p2');

    expect(next.combo).toBe(12);
    expect(next.holdMonsterId).toBe(1);
  });

  it('长按失败：连击清零 + FEVER 中断 + 怪物滑出屏幕，但不扣血', () => {
    const state = makeState({
      monsters: [holdMonster()],
      combo: 20,
      frenzyActive: true,
      feverT: 4,
      nextFeverAt: 60,
    });

    const { state: next } = longPenalty(state, 1, '长按不足 3 秒');

    expect(next.combo).toBe(0);
    expect(next.frenzyActive).toBe(false);
    expect(next.feverT).toBe(0);
    expect(next.nextFeverAt).toBe(50);
    expect(next.hp).toBe(250);
    const long = next.monsters.find((m) => m.id === 1);
    expect(long?.kind).toBe('hold');
    if (long?.kind !== 'hold') throw new Error('应当是长按怪');
    expect(long.escaped).toBe(true);
    expect(long.anchored).toBe(false);
    expect(long.removed).toBe(false); // 还没滑出屏幕，仍在场上
  });

  it('按住不足 3 秒 → failLong', () => {
    const state = makeState({ monsters: [holdMonster()] });

    const { state: next } = failLong(state, 1);

    expect(next.combo).toBe(0);
  });

  it('已逃逸的长按怪不再重复判罚', () => {
    const state = makeState({ monsters: [holdMonster({ escaped: true })], combo: 5 });

    expect(failLong(state, 1).state.combo).toBe(5);
    expect(missLong(state, 1).state.combo).toBe(5);
  });

  it('长按贯穿：尾部 200 分 + 击杀 +1 + 连击 +1，计入普攻（不是暴击）', () => {
    const state = makeState({ monsters: [holdMonster({ headAwarded: true })] });

    const { state: next } = completeLong(state, 1);

    expect(next.score).toBe(200);
    expect(next.kills).toBe(1);
    expect(next.combo).toBe(1);
    expect(next.normalCount).toBe(1);
    expect(next.critCount).toBe(0);
    expect(next.holdMonsterId).toBeNull();
  });

  it('取消长按不惩罚：怪物保持锚定，等待续按', () => {
    const state = makeState({ monsters: [holdMonster()], combo: 7 });
    const held = startHold(state, 1, 'p1').state;

    const { state: next } = cancelHold(held);

    expect(next.holdMonsterId).toBeNull();
    expect(next.holdInputId).toBeNull();
    expect(next.combo).toBe(7);
    const long = next.monsters.find((m) => m.id === 1);
    if (long?.kind !== 'hold') throw new Error('应当是长按怪');
    expect(long.anchored).toBe(true);
    expect(long.holding).toBe(false);
  });
});

describe('受伤与结束', () => {
  it('漏怪扣 20 血，连击清零，FEVER 中断', () => {
    const state = makeState({
      monsters: [normalMonster()],
      combo: 8,
      frenzyActive: true,
      feverT: 3,
      nextFeverAt: 70,
    });

    const { state: next } = hurtPlayer(state, 1);

    expect(next.hp).toBe(230);
    expect(next.combo).toBe(0);
    expect(next.frenzyActive).toBe(false);
    expect(next.feverT).toBe(0);
    expect(next.nextFeverAt).toBe(50);
  });

  it('血量归零 → 游戏结束', () => {
    const state = makeState({ monsters: [normalMonster()], hp: 20 });

    const { state: next, effects } = hurtPlayer(state, 1);

    expect(next.hp).toBe(0);
    expect(next.phase).toBe('over');
    expect(effects.some((e) => e.type === 'game-over')).toBe(true);
  });

  it('擦身而过：不扣血、不闪红，但连击 / FEVER 清零', () => {
    const state = makeState({
      monsters: [normalMonster()],
      combo: 12,
      frenzyActive: true,
      feverT: 4,
      nextFeverAt: 100,
    });

    const { state: next, effects } = hurtPlayer(state, 1, false);

    expect(next.hp).toBe(250);
    expect(next.combo).toBe(0);
    expect(next.frenzyActive).toBe(false);
    expect(next.feverT).toBe(0);
    expect(next.nextFeverAt).toBe(50);
    expect(next.monsters[0]?.removed).toBe(true);
    expect(effects.some((e) => e.type === 'player-flash')).toBe(false);
    expect(effects.some((e) => e.type === 'hurt')).toBe(false);
    expect(effects.some((e) => e.type === 'toast')).toBe(true);
  });

  it('游戏结束会取消长按', () => {
    const state = makeState({ monsters: [holdMonster()] });
    const held = startHold(state, 1, 'p1').state;

    const { state: next } = gameOver(held);

    expect(next.phase).toBe('over');
    expect(next.holdMonsterId).toBeNull();
  });

  it('已结束的局面重复结束不产生额外效果', () => {
    const state = makeState({ phase: 'over' });

    const { effects } = gameOver(state);

    expect(effects).toEqual([]);
  });
});

describe('规则层不产生视觉副作用', () => {
  it('击破怪物只产出效果事件，不直接操作任何宿主对象', () => {
    const state = makeState({ monsters: [normalMonster({ x: HIT_X })] });

    const { effects } = killMonster(state, 1, true);

    expect(effects.length).toBeGreaterThan(0);
    for (const effect of effects) {
      expect(['burst', 'ring', 'toast', 'shake-add', 'player-flash', 'vibrate']).toContain(
        effect.type,
      );
    }
  });
});
