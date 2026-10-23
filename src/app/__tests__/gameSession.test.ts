/**
 * 会话层的单测 —— 双时钟语义与阶段门禁。
 *
 * 对照 `legacy-semantics.md` §0：
 *   - `now` 只在 running 时推进
 *   - `visualTime`（旧 `vt`）**所有阶段**都推进
 *   - `attackT` 在 paused 时**不**衰减
 *   - 粒子 / 环 / 刀光 / 飘字在 paused 时**继续**衰减
 */

import { describe, expect, it } from 'vitest';

import type { BattlefieldRenderer, FrameView } from '../../battlefield/types';
import { computeLayout } from '../../game/layout';
import type { Phase } from '../../game/types';
import { GameSession } from '../GameSession';
import { createPresentation } from '../presentation';

/** 只记录不画的渲染器。 */
class StubRenderer implements BattlefieldRenderer {
  readonly frames: FrameView[] = [];
  host: HTMLElement | null = null;
  unmounted = false;
  resizedTo: number | null = null;

  mount(host: HTMLElement): void {
    this.host = host;
  }

  unmount(): void {
    this.unmounted = true;
  }

  resize(layout: { width: number }): void {
    this.resizedTo = layout.width;
  }

  render(frame: FrameView): void {
    this.frames.push(frame);
  }

  get last(): FrameView {
    const frame = this.frames[this.frames.length - 1];
    if (!frame) throw new Error('还没有渲染过任何一帧');
    return frame;
  }
}

/** 可手动推进的假时钟（按 16ms 一帧派发，像 rAF）。 */
function makeClock(): {
  schedule: (cb: (ts: number) => void) => number;
  cancel: (handle: number) => void;
  advance: (ms: number) => void;
} {
  let now = 0;
  let handle = 0;
  const queue = new Map<number, (ts: number) => void>();
  return {
    schedule(cb) {
      handle += 1;
      queue.set(handle, cb);
      return handle;
    },
    cancel(h) {
      queue.delete(h);
    },
    advance(ms) {
      let remaining = ms;
      while (remaining > 0) {
        const delta = Math.min(16, remaining);
        now += delta;
        const due = [...queue.values()];
        queue.clear();
        for (const cb of due) cb(now);
        remaining -= delta;
      }
    },
  };
}

/** 造一个会话。 */
function makeSession(): {
  session: GameSession;
  renderer: StubRenderer;
  clock: ReturnType<typeof makeClock>;
  presentation: ReturnType<typeof createPresentation>;
  phases: Phase[];
} {
  const renderer = new StubRenderer();
  const clock = makeClock();
  const presentation = createPresentation();
  const phases: Phase[] = [];
  const session = new GameSession({
    renderer,
    host: { tagName: 'DIV' } as unknown as HTMLElement,
    diffLevel: 1,
    seed: 20240601,
    layout: computeLayout(800, 400, 1),
    presentation,
    onPhaseChange: (phase) => phases.push(phase),
    scheduleFrame: clock.schedule,
    cancelFrame: clock.cancel,
  });
  return { session, renderer, clock, presentation, phases };
}

describe('GameSession', () => {
  it('挂载后开始出帧', async () => {
    const { session, renderer, clock } = makeSession();
    await session.mount();
    clock.advance(16);

    expect(renderer.host).not.toBeNull();
    expect(renderer.frames.length).toBe(1);
    expect(renderer.last.phase).toBe('idle');
    session.dispose();
  });

  it('dispose 之后不再出帧，并卸载渲染器', async () => {
    const { session, renderer, clock } = makeSession();
    await session.mount();
    clock.advance(16);
    session.dispose();
    clock.advance(16);

    expect(renderer.frames.length).toBe(1);
    expect(renderer.unmounted).toBe(true);
  });

  it('开始一局后进入 running', async () => {
    const { session, renderer, clock, phases } = makeSession();
    await session.mount();
    session.start();
    clock.advance(16);

    expect(session.phase).toBe('running');
    expect(renderer.last.phase).toBe('running');
    expect(phases).toEqual(['running']);
    session.dispose();
  });

  it('running 时规则时钟 now 推进', async () => {
    const { session, renderer, clock } = makeSession();
    await session.mount();
    session.start();
    clock.advance(100);

    expect(renderer.last.now).toBeGreaterThan(0);
    session.dispose();
  });

  it('暂停时 now 不推进，但视觉时钟 visualTime 继续推进', async () => {
    const { session, renderer, clock } = makeSession();
    await session.mount();
    session.start();
    clock.advance(100);

    const before = renderer.last;
    session.pause();
    clock.advance(1000);
    const after = renderer.last;

    expect(after.phase).toBe('paused');
    expect(after.now).toBe(before.now);
    expect(after.visualTime).toBeGreaterThan(before.visualTime);
    session.dispose();
  });

  it('暂停时出招动作 attackT 不衰减', async () => {
    const { session, renderer, clock } = makeSession();
    await session.mount();
    session.start();
    session.press('top', 'p1');
    clock.advance(16);

    const before = renderer.last.attackT;
    expect(before).toBeGreaterThan(0);

    session.pause();
    clock.advance(1000);

    expect(renderer.last.attackT).toBe(before);
    session.dispose();
  });

  it('暂停时粒子 / 刀光继续衰减', async () => {
    const { session, renderer, clock, presentation } = makeSession();
    await session.mount();
    session.start();
    session.press('top', 'p1');
    clock.advance(16);

    expect(presentation.snapshot.slashes.length).toBeGreaterThan(0);

    session.pause();
    clock.advance(1000);

    expect(presentation.snapshot.slashes.length).toBe(0);
    expect(renderer.last.phase).toBe('paused');
    session.dispose();
  });

  it('恢复后规则时钟继续推进', async () => {
    const { session, renderer, clock } = makeSession();
    await session.mount();
    session.start();
    clock.advance(100);
    session.pause();
    clock.advance(1000);
    const paused = renderer.last.now;
    session.resume();
    clock.advance(100);

    expect(renderer.last.now).toBeGreaterThan(paused);
    session.dispose();
  });

  it('非法转换被拒：idle 时不能暂停', async () => {
    const { session, phases } = makeSession();
    await session.mount();
    session.pause();

    expect(session.phase).toBe('idle');
    expect(phases).toEqual([]);
    session.dispose();
  });

  it('非法转换被拒：running 时不能重复开始', async () => {
    const { session, phases } = makeSession();
    await session.mount();
    session.start();
    session.start();

    expect(phases).toEqual(['running']);
    session.dispose();
  });

  it('暂停 → 回主页面 → idle', async () => {
    const { session, phases } = makeSession();
    await session.mount();
    session.start();
    session.pause();
    session.quitToHome();

    expect(session.phase).toBe('idle');
    expect(phases).toEqual(['running', 'paused', 'idle']);
    session.dispose();
  });

  it('出刀产生规则层效果（连击 / 攻击状态变化）', async () => {
    const { session, clock } = makeSession();
    await session.mount();
    session.start();
    session.press('top', 'p1');
    clock.advance(16);

    const state = session.getState();
    expect(state.attackLane).toBe('top');
    expect(state.attackT).toBeGreaterThan(0);
    session.dispose();
  });

  it('非 running 时按下不做任何事', async () => {
    const { session, clock } = makeSession();
    await session.mount();
    session.press('top', 'p1');
    clock.advance(16);

    expect(session.getState().attackT).toBe(0);
    session.dispose();
  });

  it('resize 会更新布局并通知渲染器', async () => {
    const { session, renderer } = makeSession();
    await session.mount();
    const next = computeLayout(1024, 600, 2);
    session.resize(next);

    expect(session.getState().layout.width).toBe(1024);
    expect(renderer.resizedTo).toBe(1024);
    session.dispose();
  });
});
