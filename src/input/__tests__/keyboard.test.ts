/**
 * 键盘输入接线的单测 —— DOM 事件 → 规则层事件。
 *
 * 对照旧实现 `source.html:2566-2583`。
 */

import { describe, expect, it } from 'vitest';

import { attachKeyboardInput } from '../keyboard';
import type { InputSink } from '../types';
import { FakeWindow, makeEvent } from './fakes';

function makeSink(): InputSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    press: (lane, inputId) => calls.push(`press:${lane}:${inputId}`),
    release: (inputId) => calls.push(`release:${inputId}`),
    cancelHold: () => calls.push('cancelHold'),
  };
}

interface Harness {
  win: FakeWindow;
  sink: InputSink & { calls: string[] };
  started: () => number;
  toggles: () => number;
  restarts: () => number;
  detach: () => void;
}

function attach(options: { isStartScreen?: boolean; isOver?: boolean } = {}): Harness {
  const win = new FakeWindow();
  const sink = makeSink();
  let started = 0;
  let toggles = 0;
  let restarts = 0;
  const detach = attachKeyboardInput({
    sink,
    isStartScreen: () => options.isStartScreen ?? false,
    isOver: () => options.isOver ?? false,
    onStartFromTap: () => {
      started += 1;
    },
    onTogglePause: () => {
      toggles += 1;
    },
    onRestart: () => {
      restarts += 1;
    },
    win: win as unknown as Window,
  });
  return {
    win,
    sink,
    started: () => started,
    toggles: () => toggles,
    restarts: () => restarts,
    detach,
  };
}

describe('键盘输入接线', () => {
  it('↑ 出上轨刀，↓ 出下轨刀', () => {
    const h = attach();
    h.win.dispatch('keydown', makeEvent({ code: 'ArrowUp' }));
    h.win.dispatch('keydown', makeEvent({ code: 'ArrowDown' }));
    expect(h.sink.calls).toEqual(['press:top:key-top', 'press:bottom:key-bottom']);
    h.detach();
  });

  it('keyup 也要发 release（长按怪靠它判失败）', () => {
    const h = attach();
    h.win.dispatch('keyup', makeEvent({ code: 'ArrowUp' }));
    h.win.dispatch('keyup', makeEvent({ code: 'KeyS' }));
    expect(h.sink.calls).toEqual(['release:key-top', 'release:key-bottom']);
    h.detach();
  });

  it('长按不重复触发', () => {
    const h = attach();
    h.win.dispatch('keydown', makeEvent({ code: 'ArrowUp', repeat: true }));
    expect(h.sink.calls).toEqual([]);
    h.detach();
  });

  it('开始界面上按 ↑ 是「开始游戏」', () => {
    const h = attach({ isStartScreen: true });
    h.win.dispatch('keydown', makeEvent({ code: 'ArrowUp' }));
    expect(h.started()).toBe(1);
    expect(h.sink.calls).toEqual([]);
    h.detach();
  });

  it('P 键切换暂停', () => {
    const h = attach();
    h.win.dispatch('keydown', makeEvent({ code: 'KeyP' }));
    expect(h.toggles()).toBe(1);
    h.detach();
  });

  it('结算界面上按 Enter 是「再来一局」', () => {
    const h = attach({ isOver: true });
    h.win.dispatch('keydown', makeEvent({ code: 'Enter' }));
    expect(h.restarts()).toBe(1);
    h.detach();
  });

  it('解绑后不再响应', () => {
    const h = attach();
    h.detach();
    h.win.dispatch('keydown', makeEvent({ code: 'ArrowUp' }));
    expect(h.sink.calls).toEqual([]);
    expect(h.win.listenerCount('keydown')).toBe(0);
  });
});
