/**
 * 菜单子路由 —— 单测。
 *
 * 与 `screenMachine.test.ts` 同样的形状：合法转换表 + 非法转换被拒。
 * 区别在于**这一层管的是屏内导航**（主页面 / 难度 / 玩法说明），
 * 规则层的 `Phase` 不参与（见 `docs/adr/0006-menu-route-decoupled-from-rules-phase.md`）。
 */

import { describe, expect, it } from 'vitest';

import { canTransition, transition, type MenuAction, type MenuRoute } from '../menuRoute';

describe('菜单子路由', () => {
  it('home → difficulty：进难度屏', () => {
    expect(canTransition('home', 'openDifficulty')).toBe(true);
    expect(transition('home', 'openDifficulty')).toBe('difficulty');
  });

  it('home → help：进玩法说明屏', () => {
    expect(canTransition('home', 'openHelp')).toBe(true);
    expect(transition('home', 'openHelp')).toBe('help');
  });

  it('home → keys：进按键设置屏', () => {
    expect(canTransition('home', 'openKeys')).toBe(true);
    expect(transition('home', 'openKeys')).toBe('keys');
  });

  it('home → characters：进角色屏', () => {
    expect(canTransition('home', 'openCharacters')).toBe(true);
    expect(transition('home', 'openCharacters')).toBe('characters');
  });

  it('characters → home：选定角色 / 返回都回主页面', () => {
    expect(transition('characters', 'confirmCharacter')).toBe('home');
    expect(transition('characters', 'backHome')).toBe('home');
  });

  it('keys → home：返回', () => {
    expect(transition('keys', 'backHome')).toBe('home');
  });

  it('difficulty → home：返回', () => {
    expect(transition('difficulty', 'backHome')).toBe('home');
  });

  it('help → home：返回', () => {
    expect(transition('help', 'backHome')).toBe('home');
  });

  it('difficulty → home：选定某档后回主页面', () => {
    expect(canTransition('difficulty', 'confirmDifficulty')).toBe(true);
    expect(transition('difficulty', 'confirmDifficulty')).toBe('home');
  });

  describe('非法转换被拒（路由保持不变）', () => {
    const illegal: readonly (readonly [MenuRoute, MenuAction])[] = [
      ['home', 'backHome'],
      ['home', 'confirmDifficulty'],
      ['home', 'confirmCharacter'],
      ['difficulty', 'openDifficulty'],
      ['difficulty', 'openHelp'],
      ['difficulty', 'openCharacters'],
      ['characters', 'openCharacters'],
      ['characters', 'openHelp'],
      ['characters', 'openDifficulty'],
      ['help', 'openDifficulty'],
      ['help', 'openHelp'],
      ['help', 'confirmDifficulty'],
      ['help', 'openKeys'],
      ['help', 'openCharacters'],
      ['keys', 'openDifficulty'],
      ['keys', 'openHelp'],
      ['keys', 'openKeys'],
      ['keys', 'openCharacters'],
      ['keys', 'confirmDifficulty'],
    ];

    for (const [from, action] of illegal) {
      it(`${from} --${action}--> 保持 ${from}`, () => {
        expect(canTransition(from, action)).toBe(false);
        expect(transition(from, action)).toBe(from);
      });
    }
  });

  it('从任意路由都到不了表外的路由（无隐藏边）', () => {
    const all: readonly MenuRoute[] = ['home', 'difficulty', 'characters', 'help', 'keys'];
    const actions: readonly MenuAction[] = [
      'openDifficulty',
      'openCharacters',
      'openHelp',
      'openKeys',
      'backHome',
      'confirmDifficulty',
      'confirmCharacter',
    ];
    for (const from of all) {
      for (const action of actions) {
        const next = transition(from, action);
        expect(all).toContain(next);
        if (!canTransition(from, action)) expect(next).toBe(from);
      }
    }
  });

  it('难度屏与玩法说明屏之间不能直接跳（必须回主页面）', () => {
    expect(transition('difficulty', 'openHelp')).toBe('difficulty');
    expect(transition('help', 'openDifficulty')).toBe('help');
  });

  it('按键设置屏只能从主页面进（不能从难度 / 玩法说明横跳）', () => {
    expect(transition('difficulty', 'openKeys')).toBe('difficulty');
    expect(transition('help', 'openKeys')).toBe('help');
    expect(transition('home', 'openKeys')).toBe('keys');
  });
});
