/**
 * Canvas 2D 渲染器的契约测试。
 *
 * 测的是**已约定的 seam**：`BattlefieldRenderer` 接口本身
 * （`mount` / `unmount` / `resize(layout)` / `render(frame)`）。
 *
 * 视觉一致性由人工并排截图验收（票里明确说渲染快照跳过），
 * 这里只断言**行为契约**：不抛错、能重复挂载、真的画出了东西。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeLayout } from '../../../game/layout';
import type { HoldMonster, NormalMonster, TwinMonster } from '../../../game/types';
import type { Effects, FrameView } from '../../types';
import { createCanvas2dRenderer } from '../index';
import { FakeCanvas, FakeHost } from './fake-canvas';

const LAYOUT = computeLayout(900, 500, 1);

function normalMonster(overrides: Partial<NormalMonster> = {}): NormalMonster {
  return {
    kind: 'normal',
    id: 1,
    lane: 'top',
    x: 385.9,
    y: LAYOUT.laneY.top,
    vx: -165,
    sf: 1,
    w: 49.5,
    h: 78,
    removed: false,
    phase: 0.3,
    wob: 1,
    ...overrides,
  };
}

function twinMonster(overrides: Partial<TwinMonster> = {}): TwinMonster {
  return {
    kind: 'twin',
    id: 10,
    lane: 'top',
    x: 500,
    y: LAYOUT.laneY.top,
    vx: -165,
    sf: 1,
    w: 49.5,
    h: 78,
    removed: false,
    phase: 0.3,
    wob: 1,
    pairId: 1,
    partnerId: 11,
    pairPending: false,
    pairT: 0,
    pairCrit: false,
    ...overrides,
  };
}

function holdMonster(overrides: Partial<HoldMonster> = {}): HoldMonster {
  return {
    kind: 'hold',
    id: 20,
    lane: 'bottom',
    x: 300,
    y: LAYOUT.laneY.bottom,
    w: 234,
    h: 44,
    len: 234,
    removed: false,
    anchored: false,
    escaped: false,
    holdT: 1.2,
    headAwarded: false,
    midAwarded: false,
    waitT: 0,
    holding: false,
    tipT: null,
    escSpeed: 980,
    phase: 0,
    ...overrides,
  };
}

const NO_EFFECTS: Effects = { particles: [], slashes: [], rings: [], floaters: [] };

function frame(overrides: Partial<FrameView> = {}): FrameView {
  return {
    layout: LAYOUT,
    phase: 'running',
    hp: 200,
    score: 1200,
    combo: 7,
    maxCombo: 9,
    kills: 3,
    critCount: 1,
    normalCount: 2,
    frenzyActive: false,
    feverT: 0,
    now: 12.5,
    scrollSpeed: 165,
    visualTime: 30.25,
    monsters: [],
    attackT: 0,
    attackLane: null,
    playerLane: 'bottom',
    playerAirT: 0,
    effects: NO_EFFECTS,
    shake: 0,
    playerFlash: 0,
    pairSmash: 0,
    ...overrides,
  };
}

/** 取挂上去的画布（没有就报错，避免用 `!` 断言掩盖问题）。 */
function canvasOf(host: FakeHost): FakeCanvas {
  const c = host.children[0];
  if (!c) throw new Error('渲染器没有挂上画布');
  return c;
}

let host: FakeHost;

beforeEach(() => {
  host = new FakeHost();
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`不支持的元素：${tag}`);
      return new FakeCanvas();
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Canvas 2D 渲染器', () => {
  it('mount → resize → render 不抛错', () => {
    const renderer = createCanvas2dRenderer();

    renderer.mount(host as unknown as HTMLElement);
    renderer.resize(LAYOUT);
    renderer.render(frame());

    expect(host.children).toHaveLength(1);
    expect(renderer).toBeDefined();
  });

  it('unmount 之后可以重复 mount', () => {
    const renderer = createCanvas2dRenderer();

    renderer.mount(host as unknown as HTMLElement);
    renderer.render(frame());
    renderer.unmount();
    expect(host.children).toHaveLength(0);

    renderer.mount(host as unknown as HTMLElement);
    renderer.resize(LAYOUT);
    renderer.render(frame());
    expect(host.children).toHaveLength(1);

    renderer.unmount();
    expect(host.children).toHaveLength(0);
  });

  it('render 真的画出了东西（不是空帧）', () => {
    const renderer = createCanvas2dRenderer();
    renderer.mount(host as unknown as HTMLElement);
    renderer.resize(LAYOUT);

    renderer.render(frame());

    const ctx = canvasOf(host).ctx;
    expect(ctx.count('clearRect')).toBe(1);
    expect(ctx.count('arc')).toBeGreaterThan(0);
    expect(ctx.count('fill')).toBeGreaterThan(0);
    expect(ctx.count('stroke')).toBeGreaterThan(0);
    // 判定区的「暴击」「普攻」标注与轨道标签
    expect(ctx.count('fillText')).toBeGreaterThan(0);
  });

  it('画布尺寸按 DPR 放大', () => {
    const renderer = createCanvas2dRenderer();
    renderer.mount(host as unknown as HTMLElement);

    renderer.resize(computeLayout(900, 500, 2));

    const canvas = canvasOf(host);
    expect(canvas.width).toBe(1800);
    expect(canvas.height).toBe(1000);
  });

  it('在场的普通怪 / 双生 / 长按怪都会被画出来', () => {
    const renderer = createCanvas2dRenderer();
    renderer.mount(host as unknown as HTMLElement);
    renderer.resize(LAYOUT);

    renderer.render(
      frame({
        monsters: [
          normalMonster(),
          twinMonster({ id: 10, lane: 'top', partnerId: 11 }),
          twinMonster({ id: 11, lane: 'bottom', y: LAYOUT.laneY.bottom, partnerId: 10 }),
          holdMonster(),
        ],
      }),
    );

    const ctx = canvasOf(host).ctx;
    // 锁链只画一条（两��双生共享一条）→ 节点圆点画 2 个
    // 角色、怪物、刀光各贡献圆弧，这里只断言「画了很多」
    expect(ctx.count('arc')).toBeGreaterThan(20);
    expect(ctx.count('fillText')).toBeGreaterThan(2);
  });

  it('已离场的怪物不画（旧代码靠「死怪已被移出数组」隐式实现）', () => {
    const renderer = createCanvas2dRenderer();
    renderer.mount(host as unknown as HTMLElement);
    renderer.resize(LAYOUT);

    const ctx = canvasOf(host).ctx;
    const alive = frame({ monsters: [normalMonster({ id: 1 })] });
    const dead = frame({ monsters: [normalMonster({ id: 1, removed: true })] });

    // 假上下文是累计计数的，所以比的是**单帧增量**
    let before = ctx.count('arc');
    renderer.render(alive);
    const aliveArcs = ctx.count('arc') - before;

    before = ctx.count('arc');
    renderer.render(dead);
    const deadArcs = ctx.count('arc') - before;

    // 死怪不画 → 圆弧数比活怪那一帧少（活怪多出身体与眼睛的圆弧）
    expect(aliveArcs).toBeGreaterThan(0);
    expect(deadArcs).toBeLessThan(aliveArcs);
  });

  it('震动会把画面整体平移', () => {
    const renderer = createCanvas2dRenderer();
    renderer.mount(host as unknown as HTMLElement);
    renderer.resize(LAYOUT);

    const ctx = canvasOf(host).ctx;
    let before = ctx.count('translate');
    renderer.render(frame({ shake: 0 }));
    const still = ctx.count('translate') - before;

    before = ctx.count('translate');
    renderer.render(frame({ shake: 8 }));
    const shaken = ctx.count('translate') - before;

    // 角色 / 怪物视图本来也会 translate，所以比的是**差值**：
    // 震动多一次 translate 调用（`ctx.translate(rand(...), rand(...))` 一次调用、
    // 两个独立取随机 —— 旧 `source.html:1463` 就是这样）
    expect(shaken).toBe(still + 1);
  });

  it('角色上跳 / 下砸 / 长按悬浮的帧都能画出来', () => {
    const renderer = createCanvas2dRenderer();
    renderer.mount(host as unknown as HTMLElement);
    renderer.resize(LAYOUT);

    renderer.render(
      frame({ playerLane: 'top', playerAirT: 0.5, attackLane: 'top', attackT: 0.2 }),
    );
    renderer.render(
      frame({ playerLane: 'bottom', attackLane: 'bottom', attackT: 0.2, pairSmash: 0.5 }),
    );
    renderer.render(
      frame({
        playerLane: 'bottom',
        monsters: [
          holdMonster({ lane: 'bottom', anchored: true, holding: true, headAwarded: true }),
        ],
      }),
    );

    expect(canvasOf(host).ctx.count('fill')).toBeGreaterThan(0);
  });

  it('FEVER 时轨道配色切换，判定区会多画一层', () => {
    const renderer = createCanvas2dRenderer();
    renderer.mount(host as unknown as HTMLElement);
    renderer.resize(LAYOUT);

    const ctx = canvasOf(host).ctx;
    let before = ctx.count('fill');
    renderer.render(frame({ frenzyActive: false }));
    const normalFills = ctx.count('fill') - before;

    before = ctx.count('fill');
    renderer.render(frame({ frenzyActive: true }));
    const frenzyFills = ctx.count('fill') - before;

    // FEVER 叠层是整屏洗色 + 两条能量带
    expect(frenzyFills).toBeGreaterThan(normalFills);
  });
});
