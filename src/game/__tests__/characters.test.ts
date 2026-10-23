/**
 * 角色系统 —— 规则层单测。
 *
 * 覆盖三块：
 *   1. 配置数值（哲 300 / 凛 125-250 / 旧版基线 250）
 *   2. 凛的命中回血与燃魂触发 / 烧血 / 退出
 *   3. 计分倍率（燃魂 ×2 与 FEVER ×1.5 叠乘）在各命中路径上的落点
 *
 * 判定 / 打击区一律不参与：角色只改生命与倍率。
 */

import { describe, expect, it } from 'vitest';

import { CHARACTERS, characterOf, healOnHit, scoreMultiplierOf, stepBurn } from '../characters';
import { createRng } from '../rng';
import { reduce } from '../reducer';
import { createGameState } from '../state';
import { makeCharacterState, normalMonster, twinPair, LAYOUT } from './fixtures';

describe('角色配置', () => {
  it('哲：300 / 300，无回复、无燃魂', () => {
    const zhe = CHARACTERS.zhe;
    expect(zhe.name).toBe('哲');
    expect(zhe.maxHp).toBe(300);
    expect(zhe.startHp).toBe(300);
    expect(zhe.healPerHit).toBe(0);
    expect(zhe.burnFloor).toBeNull();
  });

  it('凛：125 / 250，命中 +5，满血燃魂到 125 退出', () => {
    const rin = CHARACTERS.rin;
    expect(rin.name).toBe('凛');
    expect(rin.maxHp).toBe(250);
    expect(rin.startHp).toBe(125);
    expect(rin.healPerHit).toBe(5);
    expect(rin.burnFloor).toBe(125);
    expect(rin.burnDrain).toBe(12.5);
    expect(rin.burnScoreMult).toBe(2);
  });

  it('旧版基线（null）：250 / 250，无被动', () => {
    const legacy = characterOf(null);
    expect(legacy.maxHp).toBe(250);
    expect(legacy.startHp).toBe(250);
    expect(legacy.healPerHit).toBe(0);
    expect(legacy.burnFloor).toBeNull();
  });

  it('开局状态按角色派生生命字段', () => {
    const zhe = createGameState({ diffLevel: 1, seed: 1, layout: LAYOUT, characterId: 'zhe' });
    expect(zhe.hp).toBe(300);
    expect(zhe.maxHp).toBe(300);
    expect(zhe.burning).toBe(false);

    const rin = createGameState({ diffLevel: 1, seed: 1, layout: LAYOUT, characterId: 'rin' });
    expect(rin.hp).toBe(125);
    expect(rin.maxHp).toBe(250);

    const legacy = createGameState({ diffLevel: 1, seed: 1, layout: LAYOUT });
    expect(legacy.characterId).toBeNull();
    expect(legacy.hp).toBe(250);
    expect(legacy.maxHp).toBe(250);
  });

  it('Start 事件可以指定角色', () => {
    const { state } = reduce(
      makeCharacterState('zhe'),
      { type: 'Start', diffLevel: 1, seed: 7, layout: LAYOUT, characterId: 'rin' },
      createRng(7),
    );
    expect(state.characterId).toBe('rin');
    expect(state.hp).toBe(125);
    expect(state.maxHp).toBe(250);
  });
});

describe('得分倍率', () => {
  const base = makeCharacterState('rin');

  it('未燃魂 / 非 FEVER → ×1', () => {
    expect(scoreMultiplierOf(base)).toBe(1);
    expect(scoreMultiplierOf(makeCharacterState('zhe'))).toBe(1);
  });

  it('燃魂 → ×2', () => {
    expect(scoreMultiplierOf({ ...base, burning: true })).toBe(2);
  });

  it('燃魂 + FEVER → ×3（叠乘）', () => {
    expect(scoreMultiplierOf({ ...base, burning: true, frenzyActive: true })).toBe(3);
  });
});

describe('命中回血', () => {
  it('凛命中 +5，并飘一个 +5', () => {
    const low = makeCharacterState('rin', { hp: 125 });
    const result = healOnHit(low, 200, 140);
    expect(result.healed).toBe(5);
    expect(result.state.hp).toBe(130);
    expect(result.startedBurn).toBe(false);
    expect(result.effects).toContainEqual(
      expect.objectContaining({ type: 'floater', x: 200, y: 140, text: '+5' }),
    );
  });

  it('回血不会超过上限：248 + 5 → 250，只回 2', () => {
    const near = makeCharacterState('rin', { hp: 248 });
    const result = healOnHit(near, 200, 140);
    expect(result.healed).toBe(2);
    expect(result.state.hp).toBe(250);
  });

  it('回满的一击触发燃魂：状态 + 提示 + 震动', () => {
    const near = makeCharacterState('rin', { hp: 248 });
    const result = healOnHit(near, 200, 140);

    expect(result.startedBurn).toBe(true);
    expect(result.state.burning).toBe(true);
    expect(result.state.burnCarry).toBe(0);
    expect(result.effects).toContainEqual(
      expect.objectContaining({ type: 'toast', text: '燃魂！得分 ×2' }),
    );
    expect(result.effects).toContainEqual(expect.objectContaining({ type: 'vibrate' }));
  });

  it('燃魂期间命中不回血', () => {
    const burning = makeCharacterState('rin', { hp: 240, burning: true });
    const result = healOnHit(burning, 200, 140);
    expect(result.healed).toBe(0);
    expect(result.state).toBe(burning);
  });

  it('哲 / 旧版基线没有命中回复', () => {
    expect(healOnHit(makeCharacterState('zhe', { hp: 250 }), 0, 0).healed).toBe(0);
    expect(healOnHit(makeCharacterState('zhe', { hp: 250 }), 0, 0).state.hp).toBe(250);
  });
});

describe('燃魂烧血', () => {
  it('每秒 12.5：小数进位，4 × 0.1s 刚好扣 5', () => {
    let s = makeCharacterState('rin', { hp: 250, burning: true });
    for (let i = 0; i < 4; i++) {
      s = stepBurn(s, 0.1).state;
    }
    expect(s.hp).toBe(245);
    expect(s.burning).toBe(true);
    expect(s.burnCarry).toBeCloseTo(0, 10);
  });

  it('烧到下限（125）退出，并提示「燃魂结束」', () => {
    const result = stepBurn(makeCharacterState('rin', { hp: 130, burning: true }), 0.4);
    expect(result.state.hp).toBe(125);
    expect(result.state.burning).toBe(false);
    expect(result.state.burnCarry).toBe(0);
    expect(result.effects).toContainEqual(
      expect.objectContaining({ type: 'toast', text: '燃魂结束' }),
    );
  });

  it('单步烧过头也只到 125，不会烧穿下限', () => {
    const result = stepBurn(makeCharacterState('rin', { hp: 130, burning: true }), 2);
    expect(result.state.hp).toBe(125);
    expect(result.state.burning).toBe(false);
  });

  it('生命已被外部打到下限时也退出', () => {
    const result = stepBurn(makeCharacterState('rin', { hp: 120, burning: true }), 0.1);
    expect(result.state.burning).toBe(false);
    expect(result.state.hp).toBe(120); // 不回血
  });

  it('旧版基线若带 burning 字段，直接清掉', () => {
    const result = stepBurn(makeCharacterState('zhe', { burning: true }), 0.1);
    expect(result.state.burning).toBe(false);
    expect(result.effects).toEqual([]);
  });
});

describe('命中路径与计分时机', () => {
  it('回满的那一击按燃魂前倍率计分，下一击才 ×2', () => {
    const firstState = makeCharacterState('rin', {
      hp: 246,
      monsters: [normalMonster({ id: 1 })],
    });
    const first = reduce(
      firstState,
      { type: 'Press', lane: 'top', inputId: 'p1' },
      createRng(1),
    ).state;

    expect(first.hp).toBe(250);
    expect(first.burning).toBe(true);
    expect(first.score).toBe(200);

    const secondState = { ...first, monsters: [normalMonster({ id: 2 })] };
    const second = reduce(
      secondState,
      { type: 'Press', lane: 'top', inputId: 'p1' },
      createRng(1),
    ).state;

    expect(second.score).toBe(600); // 200 + 400
    expect(second.hp).toBe(250); // 燃魂期间不回血
  });

  it('普攻回血在计分之后：125 → 130 且得分正常', () => {
    const state = makeCharacterState('rin', {
      hp: 125,
      monsters: [normalMonster({ id: 1 })],
    });
    const next = reduce(state, { type: 'Press', lane: 'top', inputId: 'p1' }, createRng(1)).state;

    expect(next.hp).toBe(130);
    expect(next.score).toBe(200);
    expect(next.burning).toBe(false);
  });

  it('燃魂 + FEVER 普攻 → 600 分', () => {
    const state = makeCharacterState('rin', {
      hp: 250,
      burning: true,
      frenzyActive: true,
      monsters: [normalMonster({ id: 1 })],
    });
    const next = reduce(state, { type: 'Press', lane: 'top', inputId: 'p1' }, createRng(1)).state;

    expect(next.score).toBe(600);
  });

  it('双生第一击回血，重复点击挂起中的那只不再回血', () => {
    const [a, b] = twinPair();
    const state = makeCharacterState('rin', { hp: 125, monsters: [a, b] });

    const first = reduce(state, { type: 'Press', lane: 'top', inputId: 'p1' }, createRng(1)).state;
    expect(first.hp).toBe(130);

    const dup = reduce(first, { type: 'Press', lane: 'top', inputId: 'p1' }, createRng(1)).state;
    expect(dup.hp).toBe(130);
  });

  it('双生补齐：两只各算一次真实命中 → +10', () => {
    const [a, b] = twinPair();
    const state = makeCharacterState('rin', { hp: 125, monsters: [a, b] });

    const first = reduce(state, { type: 'Press', lane: 'top', inputId: 'p1' }, createRng(1)).state;
    const pair = reduce(
      first,
      { type: 'Press', lane: 'bottom', inputId: 'p2' },
      createRng(1),
    ).state;

    expect(pair.hp).toBe(135);
    expect(pair.score).toBe(700);
  });
});
