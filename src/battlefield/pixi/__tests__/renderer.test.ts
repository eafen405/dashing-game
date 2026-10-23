/**
 * Pixi 渲染器的**主 seam** 契约测试 —— `BattlefieldRenderer` 接口。
 *
 * 测的是**已约定的 seam**（brief-06 §「已约定的测试 seam」第 1 条）：
 * `PixiRenderer` 必须满足 `BattlefieldRenderer`
 * （`mount` / `unmount` / `resize(layout)` / `render(frame)`）。
 *
 * 视觉一致性由**并排截图**验收（不是快照测试）——
 * 这里只断言**行为契约**：形状对得上、异步挂载、未挂载时不炸。
 *
 * 运行环境是 Node（`vitest.config.ts` 的 `environment: 'node'`），
 * 所以**不能真的初始化 WebGL** —— 断言集中在「不依赖 GPU 的那一半契约」。
 */

import { describe, expect, it } from 'vitest';

import { computeLayout } from '../../../game/layout';
import type { FrameView } from '../../types';
import { PixiRenderer, createPixiRenderer } from '../index';

const LAYOUT = computeLayout(900, 500, 1);

/** 一个最小的 `FrameView`（渲染层只读，不改它）。 */
function emptyFrame(overrides: Partial<FrameView> = {}): FrameView {
  return {
    layout: LAYOUT,
    phase: 'running',
    hp: 250,
    score: 0,
    combo: 0,
    maxCombo: 0,
    kills: 0,
    critCount: 0,
    normalCount: 0,
    frenzyActive: false,
    feverT: 0,
    now: 0,
    visualTime: 0,
    monsters: [],
    attackT: 0,
    attackLane: null,
    playerLane: 'bottom',
    playerAirT: 0,
    scrollSpeed: 165,
    effects: { particles: [], slashes: [], rings: [], floaters: [], souls: [] },
    shake: 0,
    playerFlash: 0,
    pairSmash: 0,
    screenFx: { rgbSplit: 0, shockAge: 0, shockLevel: 0, shockX: 0, shockY: 0 },
    ...overrides,
  };
}

describe('BattlefieldRenderer 接口 —— Pixi 实现', () => {
  it('createPixiRenderer() 造出满足 BattlefieldRenderer 契约的渲染器', () => {
    const renderer = createPixiRenderer();

    expect(typeof renderer.mount).toBe('function');
    expect(typeof renderer.unmount).toBe('function');
    expect(typeof renderer.resize).toBe('function');
    expect(typeof renderer.render).toBe('function');
  });

  it('mount() 声明为 async —— Pixi 要等 GPU 初始化，接口才保留 void | Promise<void>', () => {
    // 这是接口契约的一部分：`BattlefieldRenderer.mount` 允许返回 Promise，
    // 而 Pixi 版**必须**是异步的（`await app.init()`）。
    expect(PixiRenderer.prototype.mount.constructor.name).toBe('AsyncFunction');
  });

  it('mount() 在没有 DOM 的环境里以 rejected Promise 失败，而不是同步抛出', async () => {
    const renderer = createPixiRenderer();
    const fakeHost = {} as HTMLElement;

    let pending: unknown;
    expect(() => {
      pending = renderer.mount(fakeHost);
    }).not.toThrow();
    expect(pending).toBeInstanceOf(Promise);

    // Node 环境没有 WebGL / canvas —— 挂载必然失败，但必须是**异步**失败。
    const settled = await (pending as Promise<void>).then(
      () => 'resolved',
      () => 'rejected',
    );
    expect(settled).toBe('rejected');
  });

  it('未挂载时 unmount() / resize() / render() 都不抛错', () => {
    const renderer = createPixiRenderer();

    expect(() => renderer.unmount()).not.toThrow();
    expect(() => renderer.unmount()).not.toThrow();
    expect(() => renderer.resize(LAYOUT)).not.toThrow();
    expect(() => renderer.render(emptyFrame())).not.toThrow();
  });

  it('render() 不修改传入的 FrameView（渲染层只读快照）', () => {
    const renderer = createPixiRenderer();
    const frame = emptyFrame();
    const snapshot = JSON.stringify(frame);

    renderer.render(frame);

    expect(JSON.stringify(frame)).toBe(snapshot);
  });
});
