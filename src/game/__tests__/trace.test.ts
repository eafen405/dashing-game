/**
 * Golden trace 共享模块（`src/game/trace.ts`）的行为测试。
 *
 * 这个模块是票 03 的「格式契约 + 事件剧本」落点：
 * - 旧 harness 与新回放器**共用** `canonicalMonsterState` / `makeTraceFrame` /
 *   `nextEvents` —— 共用才能保证「快照一致 ⇒ 事件流一致」。
 * - `nextEvents` 必须是**快照的纯函数**：同样的输入必须给出同样的事件。
 */

import { describe, expect, it } from 'vitest';

import {
  canonicalMonsterState,
  createScriptState,
  legacyMonsterFlags,
  makeTraceFrame,
  nextEvents,
  shouldRecordPhase,
  traceFrameFromState,
  type TraceFrame,
  type TraceScriptState,
} from '../trace';
import { computeLayout } from '../layout';
import { createGameState } from '../state';

/** 造一帧快照（默认值够用，测试只关心相关字段）。 */
function frame(overrides: Partial<TraceFrame> = {}): TraceFrame {
  return makeTraceFrame({
    frame: 0,
    dt: 1 / 60,
    rulesDraws: 0,
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
    nextFeverAt: 50,
    now: 1 / 60,
    hitX: 345.9,
    zoneHalf: 58.5,
    critHalf: 29.25,
    monsters: [],
    script: createScriptState(),
    ...overrides,
  });
}

/** 造一只普通怪（x 离判定区中心的距离 = `dist`）。 */
function normal(lane: 'top' | 'bottom', dist: number) {
  return {
    kind: 'normal' as const,
    lane,
    x: 345.9 + dist,
    y: 0,
    w: 49.5,
    h: 78,
    state: 'normal' as const,
  };
}

/** 造一只双生怪。 */
function twin(lane: 'top' | 'bottom', dist: number, state: 'twin' | 'twin-pending' = 'twin') {
  return { kind: 'twin' as const, lane, x: 345.9 + dist, y: 0, w: 49.5, h: 78, state };
}

/** 造一只长按怪（`x` 是身体左边缘，头在 `x + h*0.46`）。 */
function hold(lane: 'top' | 'bottom', headDist: number, state: 'hold' | 'hold-holding' = 'hold') {
  const h = 44;
  return {
    kind: 'hold' as const,
    lane,
    x: 345.9 + headDist - h * 0.46,
    y: 0,
    w: 234,
    h,
    state,
  };
}

/** 剧本状态（可覆写）。 */
function script(overrides: Partial<TraceScriptState> = {}): TraceScriptState {
  return { ...createScriptState(), ...overrides };
}

describe('怪物规范状态', () => {
  it('holding 优先于 anchored（startHold 同时置两个标志，必须有唯一答案）', () => {
    expect(
      canonicalMonsterState({
        kind: 'hold',
        pairPending: false,
        holding: true,
        anchored: true,
        escaped: false,
      }),
    ).toBe('hold-holding');
    expect(
      canonicalMonsterState({
        kind: 'hold',
        pairPending: false,
        holding: false,
        anchored: true,
        escaped: false,
      }),
    ).toBe('hold-anchored');
  });

  it('长按怪漏过之后是 hold-escaped', () => {
    expect(
      canonicalMonsterState({
        kind: 'hold',
        pairPending: false,
        holding: false,
        anchored: false,
        escaped: true,
      }),
    ).toBe('hold-escaped');
  });

  it('双生怪挂起后是 twin-pending，普通怪恒为 normal', () => {
    expect(
      canonicalMonsterState({
        kind: 'twin',
        pairPending: true,
        holding: false,
        anchored: false,
        escaped: false,
      }),
    ).toBe('twin-pending');
    expect(
      canonicalMonsterState({
        kind: 'normal',
        pairPending: false,
        holding: false,
        anchored: false,
        escaped: false,
      }),
    ).toBe('normal');
  });

  it('旧版怪物的字段映射到同一套标志', () => {
    expect(legacyMonsterFlags({ long: true, holding: true })).toEqual({
      kind: 'hold',
      pairPending: false,
      holding: true,
      anchored: false,
      escaped: false,
    });
    expect(legacyMonsterFlags({ __kind: 'twin', pairPending: true }).kind).toBe('twin');
    expect(legacyMonsterFlags({}).kind).toBe('normal');
  });
});

describe('快照格式契约', () => {
  it('字段名与顺序固定（两边共用 makeTraceFrame）', () => {
    const f = frame();
    expect(Object.keys(f)).toEqual([
      'frame',
      'dt',
      'rulesDraws',
      'phase',
      'hp',
      'score',
      'combo',
      'maxCombo',
      'kills',
      'critCount',
      'normalCount',
      'frenzyActive',
      'feverT',
      'nextFeverAt',
      'now',
      'hitX',
      'zoneHalf',
      'critHalf',
      'monsters',
      'script',
    ]);
  });
});

describe('事件剧本是快照的纯函数', () => {
  it('同样的输入给出同样的事件', () => {
    const f = frame({ monsters: [normal('top', 10)] });
    const a = nextEvents(f, script());
    const b = nextEvents(f, script());
    expect(a.events).toEqual(b.events);
    expect(a.script).toEqual(b.script);
  });

  it('不修改传入的剧本状态', () => {
    const s = script();
    const before = JSON.stringify(s);
    nextEvents(frame({ monsters: [normal('top', 10)] }), s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('没有快照（第 0 帧）时不产事件', () => {
    expect(nextEvents(null, script()).events).toEqual([]);
  });

  it('游戏不在 running 时不产事件', () => {
    const f = frame({ phase: 'over', monsters: [normal('top', 10)] });
    expect(nextEvents(f, script()).events).toEqual([]);
  });
});

describe('普通怪', () => {
  it('怪在判定区里就按', () => {
    // 用 'fever' 阶段：'scenarios' 阶段会故意「放走」一只普通怪（那是另一条分支）
    const f = frame({ monsters: [normal('top', 50)] });
    expect(nextEvents(f, script({ stage: 'fever' })).events).toEqual([
      { type: 'press', lane: 'top', id: 'tap' },
    ]);
  });

  it('怪不在判定区里不按', () => {
    const f = frame({ monsters: [normal('top', 59)] });
    expect(nextEvents(f, script({ stage: 'fever' })).events).toEqual([]);
  });

  it('暴击档要等到暴击区才按（普攻 / 暴击交替）', () => {
    const s = script({ stage: 'fever', critNext: true });
    const outside = frame({ monsters: [normal('top', 40)] });
    expect(nextEvents(outside, s).events).toEqual([]);
    const inside = frame({ monsters: [normal('top', 20)] });
    expect(nextEvents(inside, s).events).toEqual([{ type: 'press', lane: 'top', id: 'tap' }]);
  });
});

describe('长按怪', () => {
  it('头部进圈就按（起手）', () => {
    const f = frame({ monsters: [hold('top', 0)] });
    expect(nextEvents(f, script()).events).toEqual([{ type: 'press', lane: 'top', id: 'hold' }]);
  });

  it('头部没进圈不按', () => {
    const f = frame({ monsters: [hold('top', 70)] });
    expect(nextEvents(f, script()).events).toEqual([]);
  });

  it('长按怪独占该轨：该轨的普通怪不会被按', () => {
    const f = frame({ monsters: [hold('top', 70), normal('top', 10)] });
    expect(nextEvents(f, script()).events).toEqual([]);
  });

  it('「不足 3 秒」场景：按住若干帧后松手', () => {
    let s = script({ stage: 'scenarios' });
    // 第一帧：头部进圈 → 起手
    const press = nextEvents(frame({ monsters: [hold('top', 0)] }), s);
    expect(press.events).toEqual([{ type: 'press', lane: 'top', id: 'hold' }]);
    s = press.script;

    // 之后若干帧：持续按住，不发 release
    for (let i = 0; i < 5; i++) {
      const r = nextEvents(frame({ monsters: [hold('top', 0, 'hold-holding')] }), s);
      expect(r.events).toEqual([]);
      s = r.script;
    }

    // 攒够帧数后松手（failLong 的输入）
    let released = false;
    for (let i = 0; i < 60 && !released; i++) {
      const r = nextEvents(frame({ monsters: [hold('top', 0, 'hold-holding')] }), s);
      s = r.script;
      if (r.events.some((e) => e.type === 'release')) {
        expect(r.events).toEqual([{ type: 'release', id: 'hold' }]);
        released = true;
      }
    }
    expect(released).toBe(true);
  });

  it('「漏过」场景：一次都不按', () => {
    // 先让场景阶段拿到一只长按怪（分配到 fail），再手动改成 miss
    const first = nextEvents(frame({ monsters: [hold('top', 0)] }), script({ stage: 'scenarios' }));
    const s = script({ stage: 'scenarios', longPlan: 'miss', longCursor: 1 });
    const r = nextEvents(frame({ monsters: [hold('top', 0)] }), s);
    expect(r.events).toEqual([]);
    void first;
  });
});

describe('双生组', () => {
  it('「补齐」：上轨第一击挂起 → 下一帧下轨补齐', () => {
    const s = script({ pairPlan: 'fill' });
    const first = nextEvents(frame({ monsters: [twin('top', 20), twin('bottom', 20)] }), s);
    expect(first.events).toEqual([{ type: 'press', lane: 'top', id: 'pair' }]);

    const second = nextEvents(
      frame({ monsters: [twin('top', 20, 'twin-pending'), twin('bottom', 20)] }),
      first.script,
    );
    expect(second.events).toEqual([{ type: 'press', lane: 'bottom', id: 'pair' }]);
  });

  it('同一帧只按一轨双生（否则挂起态来不及进快照、窗口也无法过期）', () => {
    const s = script({ pairPlan: 'expire' });
    const r = nextEvents(frame({ monsters: [twin('top', 20), twin('bottom', 20)] }), s);
    expect(r.events).toEqual([{ type: 'press', lane: 'top', id: 'pair' }]);
  });

  it('「窗口过期」：挂起之后 partner 轨不再被按', () => {
    const s = script({ pairPlan: 'expire' });
    const pending = nextEvents(
      frame({ monsters: [twin('top', 20, 'twin-pending'), twin('bottom', 20)] }),
      s,
    );
    expect(pending.events).toEqual([]);
  });

  it('「双轨同时触线」：双生怪在场时两轨都不按', () => {
    const s = script({ pairPlan: 'breach' });
    const r = nextEvents(frame({ monsters: [twin('top', 20), twin('bottom', 20)] }), s);
    expect(r.events).toEqual([]);
  });
});

describe('零输入模式（idle）', () => {
  it('默认是 active 模式', () => {
    expect(createScriptState().mode).toBe('active');
  });

  it('idle 模式一个键都不按（哪怕怪就在判定区里）', () => {
    const f = frame({ monsters: [normal('top', 10), hold('bottom', 0)] });
    expect(nextEvents(f, script({ mode: 'idle' })).events).toEqual([]);
  });

  it('idle 模式下剧本状态原样返回（不推进阶段、不轮转游标）', () => {
    const s = script({ mode: 'idle', stage: 'scenarios', longCursor: 1, pairCursor: 1 });
    const r = nextEvents(frame({ monsters: [normal('top', 10)] }), s);
    expect(r.script).toEqual(s);
  });
});

describe('终态帧契约', () => {
  it('over 阶段的帧也要被记录（否则 game over 路径没有保真保护）', () => {
    expect(shouldRecordPhase('running')).toBe(true);
    expect(shouldRecordPhase('over')).toBe(true);
    expect(shouldRecordPhase('paused')).toBe(false);
    expect(shouldRecordPhase('idle')).toBe(false);
  });

  it('终态帧的字段：phase=over、hp=0 逐字进快照', () => {
    const layout = computeLayout(900, 600, 1);
    const state = {
      ...createGameState({ diffLevel: 1, seed: 1, layout }),
      phase: 'over' as const,
      hp: 0,
    };
    const f = traceFrameFromState(state, 42, 1 / 60, createScriptState(), 7);
    expect(f.phase).toBe('over');
    expect(f.hp).toBe(0);
    expect(f.frame).toBe(42);
    expect(f.rulesDraws).toBe(7);
  });
});
