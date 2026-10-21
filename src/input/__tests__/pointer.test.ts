/**
 * 指针输入接线的单测 —— DOM 事件 → 规则层事件。
 *
 * 对照旧实现 `source.html:2536-2563`。
 */

import { describe, expect, it } from 'vitest';

import { attachPointerInput, isExcludedTarget } from '../pointer';
import type { InputSink } from '../types';
import { FakeElement, FakeWindow, makeEvent, SOME_ELEMENT } from './fakes';

/** 记录收到的规则层事件。 */
function makeSink(): InputSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    press: (lane, inputId) => calls.push(`press:${lane}:${inputId}`),
    release: (inputId) => calls.push(`release:${inputId}`),
    cancelHold: () => calls.push('cancelHold'),
  };
}

describe('指针输入接线', () => {
  it('点击上半屏 → 上轨出刀', () => {
    const stage = new FakeElement({ top: 0, height: 400 });
    const win = new FakeWindow();
    const sink = makeSink();
    const detach = attachPointerInput({
      stage: stage as unknown as HTMLElement,
      sink,
      isStartScreen: () => false,
      onStartFromTap: () => undefined,
      win: win as unknown as Window,
    });

    stage.dispatch('pointerdown', makeEvent({ clientY: 100, pointerId: 3 }));

    expect(sink.calls).toEqual(['press:top:p3']);
    detach();
  });

  it('点击下半屏 → 下轨出刀', () => {
    const stage = new FakeElement({ top: 0, height: 400 });
    const win = new FakeWindow();
    const sink = makeSink();
    attachPointerInput({
      stage: stage as unknown as HTMLElement,
      sink,
      isStartScreen: () => false,
      onStartFromTap: () => undefined,
      win: win as unknown as Window,
    });

    stage.dispatch('pointerdown', makeEvent({ clientY: 350, pointerId: 4 }));

    expect(sink.calls).toEqual(['press:bottom:p4']);
  });

  it('以舞台矩形为基准换算半屏（舞台不在视口原点）', () => {
    const stage = new FakeElement({ top: 100, height: 400 });
    const win = new FakeWindow();
    const sink = makeSink();
    attachPointerInput({
      stage: stage as unknown as HTMLElement,
      sink,
      isStartScreen: () => false,
      onStartFromTap: () => undefined,
      win: win as unknown as Window,
    });

    // 视口 y=250 → 舞台内 y=150 → 上半
    stage.dispatch('pointerdown', makeEvent({ clientY: 250, pointerId: 1 }));
    // 视口 y=500 → 舞台内 y=400 → 下半
    stage.dispatch('pointerdown', makeEvent({ clientY: 500, pointerId: 2 }));

    expect(sink.calls).toEqual(['press:top:p1', 'press:bottom:p2']);
  });

  it('开始界面上点击 → 开始游戏，不出刀', () => {
    const stage = new FakeElement({ top: 0, height: 400 });
    const win = new FakeWindow();
    const sink = makeSink();
    let started = 0;
    attachPointerInput({
      stage: stage as unknown as HTMLElement,
      sink,
      isStartScreen: () => true,
      onStartFromTap: () => {
        started += 1;
      },
      win: win as unknown as Window,
    });

    const event = makeEvent({ clientY: 100, pointerId: 9 });
    stage.dispatch('pointerdown', event);

    expect(started).toBe(1);
    expect(sink.calls).toEqual([]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('命中排除目标（按钮 / 遮罩）→ 不出刀', () => {
    const stage = new FakeElement({ top: 0, height: 400 });
    const button = new FakeElement();
    button.closestResult = SOME_ELEMENT;
    const win = new FakeWindow();
    const sink = makeSink();
    attachPointerInput({
      stage: stage as unknown as HTMLElement,
      sink,
      isStartScreen: () => false,
      onStartFromTap: () => undefined,
      win: win as unknown as Window,
    });

    stage.dispatch('pointerdown', makeEvent({ clientY: 100, pointerId: 5, target: button }));

    expect(sink.calls).toEqual([]);
  });

  it('pointerup → release', () => {
    const stage = new FakeElement({ top: 0, height: 400 });
    const win = new FakeWindow();
    const sink = makeSink();
    attachPointerInput({
      stage: stage as unknown as HTMLElement,
      sink,
      isStartScreen: () => false,
      onStartFromTap: () => undefined,
      win: win as unknown as Window,
    });

    win.dispatch('pointerup', makeEvent({ pointerId: 3 }));

    expect(sink.calls).toEqual(['release:p3']);
  });

  it('pointercancel → release', () => {
    const stage = new FakeElement({ top: 0, height: 400 });
    const win = new FakeWindow();
    const sink = makeSink();
    attachPointerInput({
      stage: stage as unknown as HTMLElement,
      sink,
      isStartScreen: () => false,
      onStartFromTap: () => undefined,
      win: win as unknown as Window,
    });

    win.dispatch('pointercancel', makeEvent({ pointerId: 6 }));

    expect(sink.calls).toEqual(['release:p6']);
  });

  it('窗口失焦 → cancelHold', () => {
    const stage = new FakeElement({ top: 0, height: 400 });
    const win = new FakeWindow();
    const sink = makeSink();
    attachPointerInput({
      stage: stage as unknown as HTMLElement,
      sink,
      isStartScreen: () => false,
      onStartFromTap: () => undefined,
      win: win as unknown as Window,
    });

    win.dispatch('blur', {});

    expect(sink.calls).toEqual(['cancelHold']);
  });

  it('解绑后不再响应', () => {
    const stage = new FakeElement({ top: 0, height: 400 });
    const win = new FakeWindow();
    const sink = makeSink();
    const detach = attachPointerInput({
      stage: stage as unknown as HTMLElement,
      sink,
      isStartScreen: () => false,
      onStartFromTap: () => undefined,
      win: win as unknown as Window,
    });

    detach();
    stage.dispatch('pointerdown', makeEvent({ clientY: 100, pointerId: 3 }));
    win.dispatch('pointerup', makeEvent({ pointerId: 3 }));
    win.dispatch('blur', {});

    expect(sink.calls).toEqual([]);
    expect(stage.listenerCount('pointerdown')).toBe(0);
    expect(win.listenerCount('pointerup')).toBe(0);
  });
});

describe('排除目标判定', () => {
  it('没有 closest 的目标不算排除', () => {
    expect(isExcludedTarget(null)).toBe(false);
    expect(isExcludedTarget({} as unknown as EventTarget)).toBe(false);
  });

  it('closest 命中就算排除', () => {
    const el = new FakeElement();
    el.closestResult = SOME_ELEMENT;
    expect(isExcludedTarget(el as unknown as EventTarget)).toBe(true);
  });
});
