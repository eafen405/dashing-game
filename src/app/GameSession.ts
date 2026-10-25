/**
 * 会话层 —— 把规则层、表现层、渲染器接到一起。
 *
 * **职责**（`legacy-semantics.md` §0 的双时钟语义都落在这里）：
 *
 * 1. 持有规则层状态（**在字段里，不在 React state 里** —— 60fps 不能触发 React 协调）。
 * 2. 驱动 rAF 循环：`dt = min((ts - lastT)/1000, 0.05)` → `reduce(state, {type:'Tick', dt}, rng)`。
 * 3. 把规则层产出的 `effects` 交给表现层，组装 `FrameView` 交给渲染器。
 * 4. 维护**视觉时钟** `visualTime`（旧代码的 `vt`）—— **所有阶段都推进**，
 *    而规则层的 `now` 只在 running 推进（这条由规则层的 `tick()` 保证）。
 * 5. 表现层的衰减（粒子 / 环 / 刀光 / 飘字 / 震动 / 角色闪白）**所有阶段都推进**
 *    （旧代码 `stepVisualOnly`，`source.html:1400-1411`）——
 *    而 `attackT` 在 paused 时**不**衰减（这条同样由规则层的 `tick()` 保证）。
 *
 * **渲染器靠依赖注入**（`BattlefieldRenderer`）—— 会话层不 import 任何具体渲染实现，
 * 所以换渲染器（Canvas 2D / Pixi）不需要动会话层。
 *
 * **PRNG 由会话层持有并注入**：规则层要求「同一个状态 + 同一个事件 → 同一个结果」，
 * 所以随机源不能待在不可变状态里（`src/game/rng.ts` 的说明）。
 */

import type { BattlefieldRenderer, FrameView } from '../battlefield/types';
import type { Effect } from '../game/effects';
import { characterOf } from '../game/characters';
import { FEVER_TIME, GOLD } from '../game/constants';
import { createRng, type Rng } from '../game/rng';
import { reduce } from '../game/reducer';
import { speedNow } from '../game/rules/difficulty';
import { MAX_DT } from '../game/rules/tick';
import { createGameState } from '../game/state';
import type {
  CharacterId,
  Difficulty,
  GameState,
  Lane,
  Layout,
  Monster,
  Phase,
} from '../game/types';
import type { InputSink } from '../input/types';
import { canTransition } from './screenMachine';
import { createEffectSink, createPresentation, type PresentationPort } from './presentation';

/** 会话层的构造参数。 */
export interface GameSessionOptions {
  /** 渲染器（依赖注入 —— 会话层不认识任何具体实现）。 */
  renderer: BattlefieldRenderer;
  /** 渲染器的挂载点。 */
  host: HTMLElement;
  /** 难度星级。 */
  diffLevel: Difficulty;
  /** 本局角色（默认哲）。菜单里换人只影响下一局。 */
  characterId?: CharacterId;
  /** 本局种子（PRNG 用；同一颗种子必得同一局）。 */
  seed: number;
  /** 初始布局。 */
  layout: Layout;
  /** 表现层（默认用 04a 的 `PresentationState` 适配）。
   *
   * 传自定义实现时注意：DOM 副作用（toast / 闪屏 / 震动 / 结算）由表现层的
   * `EffectSink` 转交，自定义实现要自己接上，否则这些效果会被丢弃。 */
  presentation?: PresentationPort;
  /** 每帧回调（调试 / 观察用；不要在这里做重活）。 */
  onFrame?: (frame: FrameView) => void;
  /** 规则层效果回调（toast / 受击闪屏 / 震动 / 结算等 DOM 侧副作用）。 */
  onEffect?: (effect: Effect) => void;
  /** 局面阶段变化回调。 */
  onPhaseChange?: (phase: Phase) => void;
  /** 帧调度（默认 `requestAnimationFrame`；测试时注入假实现）。 */
  scheduleFrame?: (cb: (ts: number) => void) => number;
  /** 取消帧（默认 `cancelAnimationFrame`）。 */
  cancelFrame?: (handle: number) => void;
}

/**
 * 会话。
 *
 * 生命周期：`mount()` → （`start()` / `pause()` / `resume()` …）→ `dispose()`。
 */
export class GameSession implements InputSink {
  private readonly options: GameSessionOptions;
  private readonly renderer: BattlefieldRenderer;
  private readonly presentation: PresentationPort;
  private readonly host: HTMLElement;

  private state: GameState;
  private rng: Rng;
  private diffLevel: Difficulty;
  private characterId: CharacterId;
  private readonly seed: number;

  /** 视觉时钟（旧代码的 `vt`）—— 所有阶段都推进。 */
  private visualTime = 0;
  /** 上一帧时间戳（0 表示「还没开始」）。 */
  private lastT = 0;
  private rafHandle: number | null = null;
  private mounted = false;
  private disposed = false;

  /** 在场怪物的复用缓冲（避免每帧重建数组 —— ADR-0004）。 */
  private readonly monsterBuffer: Monster[] = [];

  constructor(options: GameSessionOptions) {
    this.options = options;
    this.renderer = options.renderer;
    this.host = options.host;
    this.diffLevel = options.diffLevel;
    this.characterId = options.characterId ?? 'zhe';
    this.seed = options.seed;
    this.presentation =
      options.presentation ??
      createPresentation(
        createEffectSink((effect) => {
          options.onEffect?.(effect);
        }),
      );
    this.rng = createRng(options.seed);
    this.state = { ...createGameState(this.initialStateOptions(options.layout)), phase: 'idle' };
    // 表现层要知道角色在哪 —— FEVER 周身火花绕着角色发射。
    this.presentation.setLayout(options.layout);
  }

  private initialStateOptions(layout: Layout): {
    diffLevel: Difficulty;
    seed: number;
    layout: Layout;
    characterId: CharacterId;
  } {
    return {
      diffLevel: this.diffLevel,
      seed: this.seed,
      layout,
      characterId: this.characterId,
    };
  }

  // ── 生命周期 ──────────────────────────────────────────────

  /**
   * 挂载渲染器并开始渲染循环。
   *
   * 循环**常驻**（旧实现也是常驻的 —— 空闲时背景星空照常流动），
   * 暂停时走「只推进表现层」的分支。
   *
   * 幂等：重复调用只会挂载一次。
   */
  async mount(): Promise<void> {
    if (this.disposed || this.mounted) return;
    this.mounted = true;
    await this.renderer.mount(this.host);
    if (this.disposed) return;
    this.rafHandle = this.schedule(this.tickFrame);
  }

  /** 释放资源（卸载组件时调用）。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafHandle !== null) {
      this.cancel(this.rafHandle);
      this.rafHandle = null;
    }
    this.renderer.unmount();
  }

  // ── 局面阶段 ──────────────────────────────────────────────

  /** 当前局面阶段。 */
  get phase(): Phase {
    return this.state.phase;
  }

  /** 当前规则层状态（只读快照）。 */
  getState(): GameState {
    return this.state;
  }

  /** 开始一局（idle → running）。非法转换被拒（静默）。 */
  start(): void {
    if (!canTransition(this.state.phase, 'start')) return;
    this.beginRound();
  }

  /** 重开一局（paused / over → running）。 */
  restart(): void {
    if (!canTransition(this.state.phase, 'restart')) return;
    this.beginRound();
  }

  /** 暂停（running → paused）。 */
  pause(): void {
    if (!canTransition(this.state.phase, 'pause')) return;
    // 旧实现的 `pauseGame()` **不**重置 `lastT`（只有 `resumeGame()` 重置）——
    // 暂停期间帧照走，表现层照常衰减。
    this.applyEvent({ type: 'Pause' });
  }

  /** 继续（paused → running）。 */
  resume(): void {
    if (!canTransition(this.state.phase, 'resume')) return;
    this.applyEvent({ type: 'Resume' });
    this.lastT = 0;
  }

  /** 回主页面（paused → idle）。 */
  quitToHome(): void {
    if (!canTransition(this.state.phase, 'quitToHome')) return;
    this.resetToIdle();
  }

  /** 回难度选择（over → idle）。 */
  chooseDifficulty(): void {
    if (!canTransition(this.state.phase, 'chooseDifficulty')) return;
    this.resetToIdle();
  }

  // ── 输入 ─────────────────────────────────────────────────

  /** 按下半屏。非 running 时由规则层拒绝（`pressLane` 首行判断）。 */
  press(lane: Lane, inputId: string): void {
    this.applyEvent({ type: 'Press', lane, inputId });
  }

  /** 松开输入。只有松开发起长按的那根输入才判定长按中断。 */
  release(inputId: string): void {
    this.applyEvent({ type: 'Release', inputId });
  }

  /** 取消长按但不惩罚（暂停 / 切后台）。 */
  cancelHold(): void {
    this.applyEvent({ type: 'CancelHold' });
  }

  // ── 布局 ─────────────────────────────────────────────────

  /** 尺寸变化：重新贴合轨道并通知渲染器。 */
  resize(layout: Layout): void {
    this.applyEvent({ type: 'Resize', layout });
    this.renderer.resize(layout);
    // 表现层也要知道角色在哪 —— FEVER 周身火花绕着角色发射。
    this.presentation.setLayout(layout);
  }

  /**
   * 切换难度星级。
   *
   * 难度是**跨局选择**（旧实现的 `diffLevel` 是模块级变量，`resetGame()` 不重置它），
   * 所以换难度不影响当前局的规则状态，但会影响**下一局**开局时的难度。
   */
  setDifficulty(diffLevel: Difficulty): void {
    this.diffLevel = diffLevel;
    this.applyEvent({ type: 'SetDifficulty', diffLevel });
  }

  /**
   * 切换角色 —— **下一局生效**。
   *
   * 菜单只在 `idle` 打开，所以实际效果就是「回主页面选人 → 点屏开打」。
   * 若在 running / paused 调用，只改字段，不碰当前局的 `hp / maxHp`（不能中途换血）。
   * `idle` 下同步重建待机状态，让主页面背景 / HUD 立刻显示新角色。
   */
  setCharacter(characterId: CharacterId): void {
    if (this.characterId === characterId) return;
    this.characterId = characterId;
    if (this.state.phase === 'idle') {
      this.state = {
        ...createGameState({
          diffLevel: this.diffLevel,
          seed: this.seed,
          layout: this.state.layout,
          characterId: this.characterId,
        }),
        phase: 'idle',
      };
    }
  }

  /**
   * 开发期钩子：把一批效果事件**直接灌进表现层**（`?debug` 专用）。
   *
   * 绕过规则层 —— 用来在端到端测试里**稳定复现**某个瞬间
   * （例如「一个暴击瞬间的画面」），而不用真的打到那一下。
   *
   * 画面仍然是**真的**：渲染层照常渲染，表现层照常推进。
   * 规则层（`src/game/**`）一行都没改。
   */
  applyDebugEffects(effects: readonly Effect[]): void {
    this.presentation.apply(effects);
  }

  /**
   * 开发期钩子：强制 FEVER 开关（`?debug` 专用）。
   *
   * 改的是**会话层持有的规则状态快照**（与规则层真实触发 FEVER 时的字段一致），
   * 规则层（`src/game/**`）一行都没改。
   *
   * 附带的事件与规则层 `rules/fever.ts` 的完全一致
   * （`fever-start` + toast + vibrate），所以画面与真实 FEVER 相同。
   */
  setDebugFever(on: boolean): void {
    this.state = { ...this.state, frenzyActive: on, feverT: on ? FEVER_TIME : 0 };
    if (on) {
      this.presentation.apply([
        { type: 'fever-start' },
        { type: 'toast', text: 'FEVER！10 秒 ×1.5', color: GOLD },
        { type: 'vibrate', pattern: [0, 40, 60, 90] },
      ]);
    } else {
      this.presentation.apply([{ type: 'fever-end' }]);
    }
  }

  /**
   * 开发期钩子：强制燃魂开关（`?debug` 专用）。
   *
   * 与 `setDebugFever` 同形：只改会话层持有的状态快照，用来稳定截出紫红燃魂画面。
   * 生产路径不可达。
   */
  setDebugBurn(on: boolean): void {
    if (on) {
      this.state = {
        ...this.state,
        hp: this.state.maxHp,
        burning: true,
        burnCarry: 0,
      };
      this.presentation.apply([
        { type: 'toast', text: '燃魂！得分 ×2', color: '#ff3b5c' },
        { type: 'vibrate', pattern: [0, 30, 40, 60] },
      ]);
    } else {
      const floor = characterOf(this.state.characterId).burnFloor ?? this.state.hp;
      this.state = {
        ...this.state,
        hp: Math.min(this.state.hp, floor),
        burning: false,
        burnCarry: 0,
      };
      this.presentation.apply([{ type: 'toast', text: '燃魂结束', color: '#ff6a8a' }]);
    }
  }

  // ── 内部 ─────────────────────────────────────────────────

  private beginRound(): void {
    // 每局都重置 PRNG —— 同一颗种子必得同一局（便于复现与对照）。
    this.rng = createRng(this.seed);
    this.state = createGameState({
      diffLevel: this.diffLevel,
      seed: this.seed,
      layout: this.state.layout,
      characterId: this.characterId,
    });
    this.presentation.reset();
    this.lastT = 0;
    this.notifyPhase();
  }

  private resetToIdle(): void {
    this.rng = createRng(this.seed);
    this.state = { ...createGameState(this.initialStateOptions(this.state.layout)), phase: 'idle' };
    this.presentation.reset();
    this.lastT = 0;
    this.notifyPhase();
  }

  /** 归约一个规则层事件，并把产生的效果交给表现层与上层。 */
  private applyEvent(event: Parameters<typeof reduce>[1]): void {
    const previousPhase = this.state.phase;
    const { state, effects } = reduce(this.state, event, this.rng);
    this.state = state;
    // 表现层消费效果事件；DOM 副作用由表现层的 `EffectSink` 转交给 `onEffect`。
    if (effects.length > 0) this.presentation.apply(effects);
    if (state.phase !== previousPhase) this.notifyPhase();
  }

  private notifyPhase(): void {
    this.options.onPhaseChange?.(this.state.phase);
  }

  private schedule(cb: (ts: number) => void): number {
    const scheduleFrame = this.options.scheduleFrame;
    if (scheduleFrame) return scheduleFrame(cb);
    return requestAnimationFrame(cb);
  }

  private cancel(handle: number): void {
    const cancelFrame = this.options.cancelFrame;
    if (cancelFrame) {
      cancelFrame(handle);
      return;
    }
    cancelAnimationFrame(handle);
  }

  /**
   * 一帧。
   *
   * 顺序照抄旧实现的 `loop()`（`source.html:1276-1398`）：
   *   1. 视觉时钟推进（**所有阶段**）
   *   2. 规则层推进（`now` 只在 running 推进；`attackT` 在 paused 不衰减 —— 规则层内部保证）
   *   3. 表现层衰减（**所有阶段**）
   *   4. 渲染
   */
  private readonly tickFrame = (ts: number): void => {
    if (this.disposed) return;
    this.rafHandle = this.schedule(this.tickFrame);

    const dt = this.computeDt(ts);
    this.visualTime += dt;

    this.applyEvent({ type: 'Tick', dt });

    this.presentation.advance(dt);

    this.render();
  };

  /** `dt = min((ts - lastT)/1000, 0.05)` —— `source.html:1279-1282`。 */
  private computeDt(ts: number): number {
    if (!this.lastT) {
      this.lastT = ts;
      return 0;
    }
    const dt = Math.min((ts - this.lastT) / 1000, MAX_DT);
    this.lastT = ts;
    return dt;
  }

  /** 组装一帧并交给渲染器。 */
  private render(): void {
    const s = this.state;

    // 在场怪物：已离场的（`removed`）不进画面（`FrameView` 契约）。
    // 用复用缓冲，避免每帧新建数组。
    this.monsterBuffer.length = 0;
    for (const m of s.monsters) {
      if (!m.removed) this.monsterBuffer.push(m);
    }

    const frame: FrameView = {
      layout: s.layout,
      phase: s.phase,
      characterId: s.characterId,
      maxHp: s.maxHp,
      hp: s.hp,
      burning: s.burning,
      score: s.score,
      combo: s.combo,
      maxCombo: s.maxCombo,
      kills: s.kills,
      critCount: s.critCount,
      normalCount: s.normalCount,
      frenzyActive: s.frenzyActive,
      feverT: s.feverT,
      now: s.now,
      visualTime: this.visualTime,
      monsters: this.monsterBuffer,
      attackT: s.attackT,
      attackLane: s.attackLane,
      playerLane: s.playerLane,
      playerAirT: s.airT,
      scrollSpeed: speedNow(s.now, this.diffLevel),
      effects: this.presentation.snapshot,
      shake: this.presentation.shake,
      playerFlash: this.presentation.playerFlash,
      pairSmash: this.presentation.pairSmash,
      screenFx: this.presentation.screenFx,
    };

    this.renderer.render(frame);
    this.options.onFrame?.(frame);
  }
}
