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
import type { CharacterId, Difficulty, Phase } from '../../game/types';
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
function makeSession(
  characterId?: CharacterId,
  diffLevel: Difficulty = 1,
): {
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
    diffLevel,
    seed: 20240601,
    layout: computeLayout(800, 400, 1),
    presentation,
    ...(characterId ? { characterId } : {}),
    onPhaseChange: (phase) => phases.push(phase),
    scheduleFrame: clock.schedule,
    cancelFrame: clock.cancel,
  });
  return { session, renderer, clock, presentation, phases };
}

describe('GameSession', () => {
  it('三星 FEVER 经规则结束后，色散和周身火花回落，不停留在页面上', async () => {
    const { session, renderer, clock, presentation } = makeSession('zhe', 3);
    await session.mount();
    session.start();
    session.setDebugFever(true);
    clock.advance(400);
    expect(renderer.last.frenzyActive).toBe(true);
    expect(presentation.screenFx.rgbSplit).toBe(1);

    // 不用调试开关关闭 FEVER：通过真实 Tick 的到期 / 漏怪路径结束。
    clock.advance(10_500);
    expect(session.getState().frenzyActive).toBe(false);
    expect(presentation.screenFx.rgbSplit).toBe(0);
    clock.advance(1_500);
    expect(presentation.snapshot.particles.some((p) => p.form === 'ember')).toBe(false);
    session.dispose();
  });

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

  it.each(['home', 'difficulty'] as const)(
    '多次 resize 后经 %s 返回 idle，待机与下一局都保留最新布局',
    async (route) => {
      const { session, renderer, clock } = makeSession();
      await session.mount();
      session.setDifficulty(4);
      session.start();
      session.resize(computeLayout(1024, 600, 2));
      const latest = computeLayout(844, 335, 1);
      session.resize(latest);

      if (route === 'home') {
        session.pause();
        session.quitToHome();
      } else {
        clock.advance(60_000);
        expect(session.phase).toBe('over');
        session.chooseDifficulty();
      }

      expect(session.phase).toBe('idle');
      expect(session.getState().layout).toEqual(latest);
      clock.advance(16);
      expect(renderer.last.layout).toEqual(latest);

      session.setCharacter('rin');
      session.start();
      clock.advance(16);
      expect(session.getState().layout).toEqual(latest);
      expect(renderer.last.layout).toEqual(latest);
      expect(session.getState().characterId).toBe('rin');
      expect(session.getState().diffLevel).toBe(4);
      session.dispose();
    },
  );

  it('默认角色是哲：300 / 300，帧里带角色字段', async () => {
    const { session, renderer, clock } = makeSession();
    await session.mount();
    clock.advance(16);

    expect(session.getState().characterId).toBe('zhe');
    expect(session.getState().hp).toBe(300);
    expect(session.getState().maxHp).toBe(300);
    expect(renderer.last.characterId).toBe('zhe');
    expect(renderer.last.hp).toBe(300);
    expect(renderer.last.maxHp).toBe(300);
    expect(renderer.last.burning).toBe(false);
    session.dispose();
  });

  it('idle 切换角色：立即按新角色重建待机状态，开局沿用', async () => {
    const { session, renderer, clock } = makeSession();
    await session.mount();
    session.setCharacter('rin');

    expect(session.getState().characterId).toBe('rin');
    expect(session.getState().hp).toBe(125);
    expect(session.getState().maxHp).toBe(250);

    session.start();
    clock.advance(16);
    expect(renderer.last.characterId).toBe('rin');
    expect(renderer.last.hp).toBe(125);
    expect(renderer.last.maxHp).toBe(250);
    session.dispose();
  });

  it('running 中切换角色只影响下一局，不中途换血', async () => {
    const { session, clock } = makeSession();
    await session.mount();
    session.start();
    session.setCharacter('rin');

    expect(session.getState().characterId).toBe('zhe');
    expect(session.getState().hp).toBe(300);

    session.pause();
    session.quitToHome();
    expect(session.getState().characterId).toBe('rin');
    expect(session.getState().hp).toBe(125);
    session.start();
    clock.advance(16);
    expect(session.getState().hp).toBe(125);
    session.dispose();
  });

  it('调试燃魂：满血进入，关闭后回到下限', async () => {
    const { session } = makeSession('rin');
    await session.mount();
    session.start();

    session.setDebugBurn(true);
    expect(session.getState().burning).toBe(true);
    expect(session.getState().hp).toBe(250);

    session.setDebugBurn(false);
    expect(session.getState().burning).toBe(false);
    expect(session.getState().hp).toBe(125);
    session.dispose();
  });
});
