/**
 * 黄金轨迹（golden trace）的**共享格式**与**事件剧本**。
 *
 * 这个文件是票 03「保真门禁」的中枢：旧版 `source.html` 的 harness 与新规则层
 * 的回放器**必须产出同格式的逐帧快照**，并且**必须喂同一份事件流**。
 * 于是格式与剧本都写在这里，两边共用同一份源码：
 *
 * - 新规则层：直接 `import`（本文件在规则层内，只 import 规则层自己的类型，
 *   不碰 DOM / Pixi / React，lint 的 `src/game/**` 段能过）。
 * - 旧版 harness：`scripts/legacy/patch-legacy.mjs` 用 `typescript.transpileModule`
 *   把本文件转成 JS 内联进生成的 `legacy-harness.html`，运行时挂在
 *   `window.__traceScript` 上。
 *
 * **为什么要共享事件剧本**：如果两边各自决定「什么时候按」，一旦规则有差异，
 * 事件流就会跟着分叉，diff 报出来的会是「怪的位置不一样」，而根因其实是
 * 「事件流不一样」—— 极具迷惑性。共享剧本把事件流变成快照的**纯函数**，
 * 于是「快照一致 ⇒ 事件流一致」，diff 报出来的差异一定来自规则本身。
 *
 * **剧本覆盖的结算路径**（见 `legacy-semantics.md` §6）：
 * 普通怪普攻 / 普通怪暴击 / 双生补齐 `killPair` / 双生窗口过期
 * `resolvePairSolo` + `pairBlast` 扣血 / 双生双轨同时触线 / 长按怪完整贯穿
 * `completeLong` / 长按不足 3 秒 `failLong` / 长按怪漏过 `missLong` /
 * 普通怪触线漏怪 `hurtPlayer` / FEVER 触发。
 */

import type { GameState, Lane, Monster } from './types';

/* ------------------------------------------------------------------ *
 * 快照格式
 * ------------------------------------------------------------------ */

/** 轨道：上轨 / 下轨。 */
export type TraceLane = Lane;

/** 怪物类别（与规则层的 `Monster['kind']` 对齐）。 */
export type TraceMonsterKind = 'normal' | 'twin' | 'hold';

/**
 * 怪物在快照里的**规范状态**。
 *
 * 判定规则见 {@link canonicalMonsterState}。旧版怪物的字段名与新规则层不同
 * （旧版 `m.long` / `m.pairPending` / `m.holding` / `m.anchored` / `m.escaped`），
 * 所以两边都先归一化成 {@link TraceMonsterFlags} 再调用同一个函数，
 * 保证「同一只怪在同一帧」在两边得到同一个字符串。
 */
export type TraceMonsterState =
  | 'normal'
  | 'twin'
  | 'twin-pending'
  | 'hold'
  | 'hold-anchored'
  | 'hold-holding'
  | 'hold-escaped';

/** 归一化后的怪物标志（两边各自的原始字段映射到这里）。 */
export interface TraceMonsterFlags {
  kind: TraceMonsterKind;
  pairPending: boolean;
  holding: boolean;
  anchored: boolean;
  escaped: boolean;
}

/** 快照里的一只怪物。 */
export interface TraceMonster {
  kind: TraceMonsterKind;
  lane: TraceLane;
  x: number;
  y: number;
  w: number;
  h: number;
  state: TraceMonsterState;
}

/**
 * 推导怪物的规范状态。
 *
 * 优先级（旧版 `source.html` 的字段语义见 `legacy-semantics.md` §6.4）：
 *
 * ```
 * 长按怪：holding → "hold-holding"    （最高：startHold 同时置 holding 与 anchored）
 *         anchored → "hold-anchored"
 *         escaped  → "hold-escaped"
 *         否则     → "hold"
 * 普通 / 双生：pairPending → "twin-pending"
 *             双生怪   → "twin"
 *             否则     → "normal"
 * ```
 *
 * `holding` 必须排在 `anchored` 前面：`startHold()` 一次性把两个标志都置上，
 * 两个条件同时为真时必须有唯一答案。
 */
export function canonicalMonsterState(flags: TraceMonsterFlags): TraceMonsterState {
  if (flags.kind === 'hold') {
    if (flags.holding) return 'hold-holding';
    if (flags.anchored) return 'hold-anchored';
    if (flags.escaped) return 'hold-escaped';
    return 'hold';
  }
  if (flags.kind === 'twin') {
    if (flags.pairPending) return 'twin-pending';
    return 'twin';
  }
  return 'normal';
}

/* ------------------------------------------------------------------ *
 * 事件剧本状态
 * ------------------------------------------------------------------ */

/** 长按怪的处置方式。 */
export type LongPlan = 'complete' | 'fail' | 'miss';

/** 双生组的处置方式。 */
export type PairPlan = 'fill' | 'expire' | 'breach';

/** 剧本阶段。 */
export type TraceStage = 'fever' | 'wait-fever' | 'scenarios';

/**
 * 事件剧本的内部状态。
 *
 * **它必须进快照**（`TraceFrame.script`）：一旦两边的事件流开始分叉，
 * diff 会第一眼指向这个字段，而不是误导到怪物坐标上。
 */
export interface TraceScriptState {
  /** 当前阶段。 */
  stage: TraceStage;
  /** 当前长按怪的处置方式（`null` = 场上还没有长按怪）。 */
  longPlan: LongPlan | null;
  /** 长按怪处置方式的轮转游标（场景阶段每遇到一只长按怪 +1）。 */
  longCursor: number;
  /** 当前长按怪已按住多少帧（`fail` 场景据此决定何时松手）。 */
  holdFrames: number;
  /** 当前长按怪是否已经起手（避免重复按下）。 */
  longStarted: boolean;
  /** 当前双生组的处置方式（`null` = 场上还没有双生怪）。 */
  pairPlan: PairPlan | null;
  /** 双生组处置方式的轮转游标。 */
  pairCursor: number;
  /** 当前双生组已经按过几次（重试计数）。 */
  pairTries: number;
  /** 当前双生组是否已经挂起（挂起后不再按任何一轨）。 */
  pairPending: boolean;
  /** 「放走一只普通怪」场景：被封禁的轨道（`null` = 当前没有）。 */
  leakLane: TraceLane | null;
  /** 「放走一只普通怪」场景：还要封禁多少帧。 */
  leakFramesLeft: number;
  /** 「放走一只普通怪」场景是否已经做过。 */
  leakDone: boolean;
  /** 普攻 / 暴击交替开关（`true` = 下一刀等暴击区）。 */
  critNext: boolean;
  /** 是否已经观察到 FEVER。 */
  feverSeen: boolean;
}

/** 剧本的初始状态。 */
export function createScriptState(): TraceScriptState {
  return {
    stage: 'scenarios',
    longPlan: null,
    longCursor: 0,
    holdFrames: 0,
    longStarted: false,
    pairPlan: null,
    pairCursor: 0,
    pairTries: 0,
    pairPending: false,
    leakLane: null,
    leakFramesLeft: 0,
    leakDone: false,
    critNext: false,
    feverSeen: false,
  };
}

/* ------------------------------------------------------------------ *
 * 事件
 * ------------------------------------------------------------------ */

/**
 * 脚本化输入事件 —— 旧 harness 与新回放器共用的**唯一**输入格式。
 *
 * - `press` → 旧版 `pressLane(lane, id)`；新规则层 `{type:'Press', lane, inputId: id}`
 * - `release` → 旧版 `releaseHold(id)`；新规则层 `{type:'Release', inputId: id}`
 * - `cancel-hold` → 旧版 `cancelHold()`；新规则层 `{type:'CancelHold'}`
 */
export type TraceEvent =
  | { type: 'press'; lane: TraceLane; id: string }
  | { type: 'release'; id: string }
  | { type: 'cancel-hold' };

/* ------------------------------------------------------------------ *
 * 快照
 * ------------------------------------------------------------------ */

/** 一帧快照。 */
export interface TraceFrame {
  frame: number;
  dt: number;
  /**
   * **截至本帧为止，规则 PRNG 被消费的次数**（累计值）。
   *
   * 这是「PRNG 一致性」的直接证据：两边在每一帧都必须消费**同样多**个规则随机数。
   * 一旦某个调用点漏改 / 多抽一次，这个计数器会在**那一帧**开始错位 ——
   * 比等到怪物坐标漂移几秒之后才发现，要早得多、也准得多。
   */
  rulesDraws: number;
  phase: string;
  hp: number;
  score: number;
  combo: number;
  maxCombo: number;
  kills: number;
  critCount: number;
  normalCount: number;
  frenzyActive: boolean;
  feverT: number;
  nextFeverAt: number;
  now: number;
  hitX: number;
  zoneHalf: number;
  critHalf: number;
  monsters: TraceMonster[];
  script: TraceScriptState;
}

/** 构造快照所需的原始字段（两边各自填好后交给 {@link makeTraceFrame}）。 */
export interface TraceFrameInput {
  frame: number;
  dt: number;
  rulesDraws: number;
  phase: string;
  hp: number;
  score: number;
  combo: number;
  maxCombo: number;
  kills: number;
  critCount: number;
  normalCount: number;
  frenzyActive: boolean;
  feverT: number;
  nextFeverAt: number;
  now: number;
  hitX: number;
  zoneHalf: number;
  critHalf: number;
  monsters: TraceMonster[];
  script: TraceScriptState;
}

/**
 * 按**固定字段顺序**构造快照。
 *
 * 两边都走这个函数，字段名与顺序就一定一致 —— 这是「格式契约」的落点。
 */
export function makeTraceFrame(input: TraceFrameInput): TraceFrame {
  return {
    frame: input.frame,
    dt: input.dt,
    rulesDraws: input.rulesDraws,
    phase: input.phase,
    hp: input.hp,
    score: input.score,
    combo: input.combo,
    maxCombo: input.maxCombo,
    kills: input.kills,
    critCount: input.critCount,
    normalCount: input.normalCount,
    frenzyActive: input.frenzyActive,
    feverT: input.feverT,
    nextFeverAt: input.nextFeverAt,
    now: input.now,
    hitX: input.hitX,
    zoneHalf: input.zoneHalf,
    critHalf: input.critHalf,
    monsters: input.monsters,
    script: input.script,
  };
}

/**
 * 从规则层状态构造快照。
 *
 * **「在场」谓词**：新规则层把被移除的怪保留到下一次 tick 开头才回收
 * （`removed === true`），旧版是当场从数组里删掉 → 旧版天然没有滞留，
 * 新版必须在这里过滤掉 `removed` 的怪，两边才对称
 * （见 `legacy-patch-spec.md` §4.4 / T14）。
 */
export function traceFrameFromState(
  state: GameState,
  frame: number,
  dt: number,
  script: TraceScriptState,
  rulesDraws = 0,
): TraceFrame {
  const monsters: TraceMonster[] = [];
  for (const m of state.monsters) {
    if (m.removed) continue;
    monsters.push({
      kind: m.kind,
      lane: m.lane,
      x: m.x,
      y: m.y,
      w: m.w,
      h: m.h,
      state: canonicalMonsterState({
        kind: m.kind,
        pairPending: m.kind === 'twin' ? m.pairPending : false,
        holding: m.kind === 'hold' ? m.holding : false,
        anchored: m.kind === 'hold' ? m.anchored : false,
        escaped: m.kind === 'hold' ? m.escaped : false,
      }),
    });
  }
  return makeTraceFrame({
    frame,
    dt,
    rulesDraws,
    phase: state.phase,
    hp: state.hp,
    score: state.score,
    combo: state.combo,
    maxCombo: state.maxCombo,
    kills: state.kills,
    critCount: state.critCount,
    normalCount: state.normalCount,
    frenzyActive: state.frenzyActive,
    feverT: state.feverT,
    nextFeverAt: state.nextFeverAt,
    now: state.now,
    hitX: state.layout.hitX,
    zoneHalf: state.layout.zoneHalf,
    critHalf: state.layout.critHalf,
    monsters,
    script,
  });
}

/* ------------------------------------------------------------------ *
 * 事件剧本
 * ------------------------------------------------------------------ */

/** 「放走一只普通怪」要封禁的帧数（1.5 秒，足够让目标怪触线）。 */
const LEAK_FRAMES = 90;
/** 「长按不足 3 秒」场景按住多少帧后松手（0.4 秒 ≪ 3 秒）。 */
const FAIL_HOLD_FRAMES = 24;
/** 场景阶段里长按怪的处置顺序：先「不足 3 秒」再「漏过」。 */
const LONG_SCENARIO_PLANS: readonly LongPlan[] = ['fail', 'miss'];
/** 场景阶段里双生组的处置顺序：先「窗口过期」再「双轨同时触线」。 */
const PAIR_SCENARIO_PLANS: readonly PairPlan[] = ['expire', 'breach'];
/** 场景阶段的最长时限（秒）—— 超时也必须让位给 FEVER 阶段。 */
const SCENARIO_DEADLINE = 55;

/** 事件剧本的输出。 */
export interface TraceEventsResult {
  events: TraceEvent[];
  script: TraceScriptState;
}

/** 怪物离判定区中心的距离。 */
function distToCenter(m: TraceMonster, hitX: number): number {
  return Math.abs(m.x - hitX);
}

/**
 * 生成下一帧的事件。
 *
 * **纯函数**：输入是「上一帧的快照 + 剧本状态」，输出是「本帧的事件 + 新的剧本状态」。
 * 两边喂同一份快照就得到同一份事件 —— 事件流是快照的函数，不是「各自判断」。
 *
 * ### 决策模型
 *
 * **逐轨决策**：对每条轨道，找出「落在判定区内、离判定区中心最近的那只怪」
 * （长按怪除外 —— 它独占该轨，`pressLane` 会先走长按分支）。
 * 这一只怪决定该轨按什么：
 *
 * | 最近的那只 | 该轨的动作 |
 * |---|---|
 * | 普通怪 | 按（普攻 / 暴击交替；`放走` 场景与 `窗口过期` 场景除外） |
 * | 双生怪 | 交给双生剧本：`fill` 第一击 / `fill` 补齐 / `expire` 第一击 / `breach` 不按 |
 * | 没有 | 不按 |
 *
 * **为什么按「最近的那只」而不是「有没有怪」**：旧版 `strike()` 命中的就是
 * 「该轨判定区内离中心最近的那只怪」。生成器必须和它看同一只怪，
 * 否则「以为打到了双生怪、其实打到了普通怪」，剧本就跑偏了。
 *
 * @param snapshot 上一帧的快照（`null` = 第 0 帧，还没有快照）。
 * @param script 当前剧本状态。
 */
export function nextEvents(
  snapshot: TraceFrame | null,
  script: TraceScriptState,
): TraceEventsResult {
  const s: TraceScriptState = { ...script };
  const events: TraceEvent[] = [];
  if (!snapshot || snapshot.phase !== 'running') return { events, script: s };

  // ── 阶段推进 ────────────────────────────────────────────────
  //
  // 顺序是「**先场景、后 FEVER**」，理由：
  //
  // - FEVER 需要**连续 50 连击**（1★ 约 51 秒、2★ 约 28 秒的连续击杀），
  //   而连续击杀会被「长按怪独占一轨 → 该轨普通怪必然触线漏怪」打断
  //   （实测 1★ 每 ~18 秒一次长按怪，每次平均漏 1 只 → 最长无漏窗口 ~36 秒）。
  // - 场景阶段（长按 fail / 长按 miss / 双生过期 / 双生双轨触线 / 主动漏怪）
  //   需要**等**长按怪（~18 秒一只）与双生组（~6.5 秒一组），本身要花 ~40 秒。
  //
  // 所以先跑场景（把必须「故意不做」的分支走完），再留尽可能长的窗口去攒 FEVER。
  // `SCENARIO_DEADLINE` 是兜底：场景再没走完也必须让位给 FEVER。
  if (s.stage === 'scenarios') {
    const done =
      s.longCursor >= LONG_SCENARIO_PLANS.length &&
      s.pairCursor >= PAIR_SCENARIO_PLANS.length &&
      s.leakDone &&
      s.leakFramesLeft === 0;
    if (done || snapshot.now > SCENARIO_DEADLINE) s.stage = 'fever';
  } else if (s.stage === 'fever') {
    if (snapshot.frenzyActive) {
      s.feverSeen = true;
      s.stage = 'wait-fever';
    }
  } else if (s.stage === 'wait-fever') {
    if (!snapshot.frenzyActive) s.stage = 'fever';
  }

  const inScenarioStage = s.stage === 'scenarios';
  const longs = snapshot.monsters.filter((m) => m.kind === 'hold');
  const twins = snapshot.monsters.filter((m) => m.kind === 'twin');

  // ── 长按怪 ──────────────────────────────────────────────────
  const longMonster = longs.length > 0 ? longs[0] : undefined;
  if (longMonster) {
    if (s.longPlan === null) {
      // 新长按怪 → 分配处置方式
      s.longPlan = inScenarioStage
        ? (LONG_SCENARIO_PLANS[s.longCursor % LONG_SCENARIO_PLANS.length] ?? 'complete')
        : 'complete';
      if (inScenarioStage) s.longCursor += 1;
      s.holdFrames = 0;
      s.longStarted = false;
    }
    const plan = s.longPlan;
    if (plan === 'complete' || plan === 'fail') {
      const headX = longMonster.x + longMonster.h * 0.46;
      const headInZone =
        headX >= snapshot.hitX - snapshot.zoneHalf &&
        headX <= snapshot.hitX + snapshot.zoneHalf;
      if (!s.longStarted && headInZone && longMonster.state === 'hold') {
        events.push({ type: 'press', lane: longMonster.lane, id: 'hold' });
        s.longStarted = true;
      }
      if (s.longStarted && longMonster.state === 'hold-holding') {
        s.holdFrames += 1;
        if (plan === 'fail' && s.holdFrames >= FAIL_HOLD_FRAMES) {
          events.push({ type: 'release', id: 'hold' });
          s.longStarted = false;
        }
      }
    }
    // plan === 'miss' → 一次都不按，等它漏过（`missLong`）
  } else {
    // 长按怪离场 → 复位（下一只长按怪重新分配处置方式）
    s.longPlan = null;
    s.longStarted = false;
    s.holdFrames = 0;
  }

  // ── 双生组：分配处置方式 ────────────────────────────────────
  if (twins.length > 0) {
    if (s.pairPlan === null) {
      s.pairPlan = inScenarioStage
        ? (PAIR_SCENARIO_PLANS[s.pairCursor % PAIR_SCENARIO_PLANS.length] ?? 'fill')
        : 'fill';
      if (inScenarioStage) s.pairCursor += 1;
    }
  } else {
    s.pairPlan = null;
  }

  // ── 每轨「判定区内最近的那只怪」（长按怪不参与：它独占该轨） ──
  const laneNearest = new Map<TraceLane, { monster: TraceMonster; dist: number }>();
  for (const lane of ['top', 'bottom'] as const) {
    let best: TraceMonster | undefined;
    let bestDist = Infinity;
    for (const m of snapshot.monsters) {
      if (m.lane !== lane || m.kind === 'hold') continue;
      const d = distToCenter(m, snapshot.hitX);
      if (d <= snapshot.zoneHalf && d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    if (best) laneNearest.set(lane, { monster: best, dist: bestDist });
  }

  // ── 「放走一只普通怪」场景 ──────────────────────────────────
  if (s.leakFramesLeft > 0) {
    s.leakFramesLeft -= 1;
    if (s.leakFramesLeft === 0) s.leakLane = null;
  } else if (
    inScenarioStage &&
    !s.leakDone &&
    s.leakLane === null &&
    longs.length === 0 &&
    twins.length === 0
  ) {
    // 挑「判定区内、离中心最近」的那只普通怪所在轨道 —— 它最先触线。
    let targetLane: TraceLane | null = null;
    let bestDist = Infinity;
    for (const lane of ['top', 'bottom'] as const) {
      const near = laneNearest.get(lane);
      if (!near || near.monster.kind !== 'normal') continue;
      if (near.dist < bestDist) {
        bestDist = near.dist;
        targetLane = lane;
      }
    }
    if (targetLane !== null) {
      s.leakLane = targetLane;
      s.leakFramesLeft = LEAK_FRAMES;
      s.leakDone = true;
    }
  }

  // ── 逐轨决策 ────────────────────────────────────────────────
  const lanesWithLong = new Set(longs.map((m) => m.lane));
  const pendingTwin = twins.find((m) => m.state === 'twin-pending');
  /** 挂起中的双生怪的 partner 所在轨道（同一时刻只有一组双生，另一轨即 partner）。 */
  const partnerLane: TraceLane | null = pendingTwin
    ? pendingTwin.lane === 'top'
      ? 'bottom'
      : 'top'
    : null;

  //
  // **两遍式**：第一遍只「决定每轨做什么」，第二遍消解双生冲突，第三遍才发事件。
  //
  // 为什么必须分遍：**同一帧里不能按两轨双生怪**。
  // 旧版 `strike()` 的「双生补齐优先」分支会在同一帧看到刚挂起的那一只 →
  // 第二击直接 `completePair` → 于是「窗口过期」这条路径**永远走不到**，
  // 「挂起态」也来不及进快照。两遍式保证：挂起那一帧只按一轨，
  // 补齐（或过期）发生在**下一帧**。
  type LaneAction = 'twin' | 'normal' | 'none';
  const laneAction = new Map<TraceLane, LaneAction>();
  for (const lane of ['top', 'bottom'] as const) {
    laneAction.set(lane, 'none');
    if (lanesWithLong.has(lane)) continue; // 长按怪独占该轨（`laneBlocked`）
    const near = laneNearest.get(lane);
    if (!near) continue;

    if (near.monster.kind === 'twin') {
      // ── 双生怪接管该轨 ──
      const plan = s.pairPlan ?? 'fill';
      if (plan === 'fill') {
        if (pendingTwin) {
          // 上一帧已挂起 → 这一帧补齐 partner 轨（`completePair` → `killPair`）
          if (lane === partnerLane) laneAction.set(lane, 'twin');
        } else {
          // 第一击：挂起等待另一轨（窗口 0.18 秒）
          laneAction.set(lane, 'twin');
        }
      } else if (plan === 'expire') {
        if (!pendingTwin) {
          // 第一击：挂起；之后两轨都不按 → 窗口过期（`resolvePairSolo` + `pairBlast`）
          laneAction.set(lane, 'twin');
        }
      }
      // 'breach' → 不按 → 双生怪双轨同时触线（只结算一次伤害）
      continue;
    }

    // ── 普通怪 ──
    if (s.leakLane === lane) continue; // 放走场景：该轨不按
    if (s.pairPlan === 'expire' && pendingTwin && lane === partnerLane) {
      // 挂起后不能再按 partner 轨 —— 那一击会直接补齐，窗口就不会过期
      continue;
    }
    const threshold = s.critNext ? snapshot.critHalf : snapshot.zoneHalf;
    if (near.dist <= threshold) laneAction.set(lane, 'normal');
  }

  // 第二遍：双生冲突消解 —— 同一帧只按一轨
  let twinPressLane: TraceLane | null = null;
  for (const lane of ['top', 'bottom'] as const) {
    if (laneAction.get(lane) === 'twin') {
      twinPressLane = lane;
      break;
    }
  }
  if (twinPressLane !== null) {
    for (const lane of ['top', 'bottom'] as const) {
      if (lane !== twinPressLane) laneAction.set(lane, 'none');
    }
  }

  // 第三遍：发事件
  for (const lane of ['top', 'bottom'] as const) {
    const action = laneAction.get(lane);
    if (action === 'none') continue;
    if (action === 'twin') {
      events.push({ type: 'press', lane, id: 'pair' });
    } else {
      events.push({ type: 'press', lane, id: 'tap' });
      s.critNext = !s.critNext;
    }
  }

  return { events, script: s };
}


/** 旧版怪物的字段 → 归一化标志（供旧 harness 用）。 */
export function legacyMonsterFlags(m: {
  long?: boolean;
  __kind?: string;
  pairPending?: boolean;
  holding?: boolean;
  anchored?: boolean;
  escaped?: boolean;
}): TraceMonsterFlags {
  const kind: TraceMonsterKind = m.long ? 'hold' : m.__kind === 'twin' ? 'twin' : 'normal';
  return {
    kind,
    pairPending: kind === 'twin' ? !!m.pairPending : false,
    holding: kind === 'hold' ? !!m.holding : false,
    anchored: kind === 'hold' ? !!m.anchored : false,
    escaped: kind === 'hold' ? !!m.escaped : false,
  };
}

/** 规则层怪物 → 归一化标志（供新回放器 / 单测用）。 */
export function stateMonsterFlags(m: Monster): TraceMonsterFlags {
  return {
    kind: m.kind,
    pairPending: m.kind === 'twin' ? m.pairPending : false,
    holding: m.kind === 'hold' ? m.holding : false,
    anchored: m.kind === 'hold' ? m.anchored : false,
    escaped: m.kind === 'hold' ? m.escaped : false,
  };
}
