/**
 * 会话层 —— 把规则层 / 表现层 / 渲染层 / 输入 / HUD 接在一起。
 *
 * 这是票 04b 的「会话编排」：
 *
 * ```
 * requestAnimationFrame
 *   ├─ 规则层 reduce(Tick) ──────────────► GameState
 *   ├─ 表现层 applyEffects / step ───────► particles / shake / flash
 *   ├─ 战场层 render(FrameView) ─────────► canvas
 *   └─ HUD 快照 update（脏检查） ────────► React（低频）
 * ```
 *
 * **React 不参与 60fps 路径**：会话只持有规则状态（普通字段，不是 React state），
 * 每帧最多向 `HudStore` 推一次快照，而 `HudStore` 只在可见字段变化时通知订阅者。
 */

import type { BattlefieldRenderer, FrameView } from '../battlefield/types';
import { GOLD } from '../game/constants';
import { computeLayout } from '../game/layout';
import { reduce } from '../game/reducer';
import { createRng, type Rng } from '../game/rng';
import { createGameState } from '../game/state';
import type { Difficulty, GameState, Lane, Layout } from '../game/types';
import { isPrimaryPointer, laneFromClientY, pointerInputId } from '../input/pointer';
import { keyActionFor, releaseInputFor } from '../input/keyboard';
import { MAX_PARTICLES } from '../presentation/effects';
import type { HudStore } from '../presentation/hudStore';
import { PresentationState, type EffectSink } from '../presentation/state';

/** 最高分的 localStorage 键（旧 `source.html:463`）。 */
export const BEST_KEY = 'dualrail_best';

/** 单帧最大步长 —— 与规则层 `MAX_DT` 保持一致，视觉时钟也按这个值推进。 */
const MAX_DT = 0.05;

/** 会话层需要 UI 做的低频反馈（动画 / 震动），不参与 60fps。 */
export interface SessionUi {
  toast(text: string, color: string): void;
  laneFlash(lane: Lane): void;
  hurt(): void;
  feverFlash(): void;
  /** 开局 / 回主页时清掉残留的提示与闪屏。 */
  clearFeedback(): void;
}

/** 构造会话所需的宿主元素与依赖。 */
export interface GameSessionOptions {
  /** 输入区域（画布所在的舞台）。 */
  stage: HTMLElement;
  /** 渲染器挂载点。 */
  host: HTMLElement;
  /** 战场渲染器（当前是 Canvas 2D，08 票后换成 Pixi）。 */
  renderer: BattlefieldRenderer;
  /** HUD 快照仓库。 */
  hud: HudStore;
  /** 低频 UI 反馈。 */
  ui: SessionUi;
}

/** 把 `FrameView` 的只读字段改成可写，便于复用同一个帧对象。 */
type MutableFrame = { -readonly [K in keyof FrameView]: FrameView[K] };

/** 读取历史最高分 —— 与旧实现一样，读写都吞掉异常（Safari `file://`）。 */
function loadBest(): number {
  try {
    return +(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** 写入历史最高分。 */
function saveBest(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // 隐私模式 / file:// 下可能禁用 localStorage —— 最高分退化为仅本局显示
  }
}

/** 表现层视觉随机（旧 `rand`）。 */
function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** 会话层。 */
export class GameSession {
  private readonly stage: HTMLElement;
  private readonly renderer: BattlefieldRenderer;
  private readonly hud: HudStore;
  private readonly ui: SessionUi;
  private readonly presentation: PresentationState;
  private readonly sink: EffectSink;

  private rng: Rng;
  private state: GameState;
  private best = 0;
  private selectedDifficulty: Difficulty = 1;

  private raf = 0;
  private lastT = 0;
  private visualTime = 0;
  private frenzySparkT = 0;
  private pausedByOrientation = false;
  private disposed = false;

  private readonly frame: MutableFrame;
  private lastW = -1;
  private lastH = -1;
  private lastDpr = -1;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimers: number[] = [];

  constructor(options: GameSessionOptions) {
    this.stage = options.stage;
    this.renderer = options.renderer;
    this.hud = options.hud;
    this.ui = options.ui;
    this.best = loadBest();

    const layout = this.measureLayout();
    this.state = {
      ...createGameState({ diffLevel: this.selectedDifficulty, seed: 0, layout }),
      phase: 'idle',
    };
    this.rng = createRng(1);

    this.sink = {
      toast: (text, color) => this.ui.toast(text, color),
      laneFlash: (lane) => this.ui.laneFlash(lane),
      vibrate: (pattern) => {
        try {
          navigator.vibrate(pattern);
        } catch {
          // 部分浏览器没有震动 API / 被权限策略禁用 —— 静默忽略
        }
      },
      hurt: () => this.ui.hurt(),
      feverStart: () => this.ui.feverFlash(),
      feverEnd: () => {
        // FEVER 结束只有 toast（规则层已发），没有额外闪屏
      },
      gameOver: () => this.finishGameOver(),
    };
    this.presentation = new PresentationState(this.sink);

    const s = this.state;
    this.frame = {
      layout: s.layout,
      phase: s.phase,
      hp: s.hp,
      score: s.score,
      combo: s.combo,
      maxCombo: s.maxCombo,
      kills: s.kills,
      critCount: s.critCount,
      normalCount: s.normalCount,
      frenzyActive: s.frenzyActive,
      feverT: s.feverT,
      now: s.now,
      visualTime: 0,
      monsters: s.monsters,
      attackT: s.attackT,
      attackLane: s.attackLane,
      effects: this.presentation.effects,
      shake: 0,
      playerFlash: 0,
    };

    this.renderer.mount(options.host);
    this.resize(true);
    this.hud.update(this.state, this.best);

    this.attachInput();
    this.observeResize();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ── 生命周期 ─────────────────────────────────────────────

  /** 开始一局新游戏。 */
  start(diffLevel: Difficulty = this.selectedDifficulty): void {
    this.selectedDifficulty = diffLevel;
    this.pausedByOrientation = false;
    this.frenzySparkT = 0;
    this.presentation.reset();
    this.ui.clearFeedback();

    // 开局前补一次布局，避免旋转后第一帧用旧尺寸
    this.resize();
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    this.rng = createRng(seed);
    const result = reduce(
      this.state,
      {
        type: 'Start',
        diffLevel,
        seed,
        layout: this.state.layout,
      },
      this.rng,
    );
    this.state = result.state;
    this.presentation.applyEffects(result.effects);
    this.lastT = 0;
    this.hud.update(this.state, this.best);
    this.render();
  }

  /** 重开一局（保留当前难度）。 */
  restart(): void {
    this.start(this.selectedDifficulty);
  }

  /** 回主页面：清空当前局，保留难度选择与最高分。 */
  home(): void {
    this.pausedByOrientation = false;
    this.frenzySparkT = 0;
    this.presentation.reset();
    this.ui.clearFeedback();
    this.rng = createRng(1);
    this.state = {
      ...createGameState({
        diffLevel: this.selectedDifficulty,
        seed: 0,
        layout: this.state.layout,
      }),
      phase: 'idle',
    };
    this.lastT = 0;
    this.hud.update(this.state, this.best);
    this.render();
  }

  /** 暂停（手动）。 */
  pause(): void {
    if (this.state.phase !== 'running') return;
    this.pausedByOrientation = false;
    this.enterPause();
  }

  /** 继续。 */
  resume(): void {
    if (this.state.phase !== 'paused') return;
    this.pausedByOrientation = false;
    const result = reduce(this.state, { type: 'Resume' }, this.rng);
    this.state = result.state;
    this.presentation.applyEffects(result.effects);
    this.lastT = 0;
    this.hud.update(this.state, this.best);
    this.render();
  }

  /**
   * 横竖屏切换 —— 旧 `source.html:500-531` 的行为：
   * 转竖屏自动暂停并记住「是旋转导致的暂停」，转回横屏自动继续。
   */
  setLandscape(landscape: boolean): void {
    if (!landscape) {
      if (this.state.phase === 'running') {
        this.enterPause();
        this.pausedByOrientation = true;
      }
      return;
    }
    if (this.pausedByOrientation && this.state.phase === 'paused') {
      this.resume();
    }
  }

  /** 选择难度（开始界面 / 键盘开局使用）。 */
  setDifficulty(diffLevel: Difficulty): void {
    this.selectedDifficulty = diffLevel;
    if (this.state.phase === 'idle') {
      const result = reduce(this.state, { type: 'SetDifficulty', diffLevel }, this.rng);
      this.state = result.state;
      this.hud.update(this.state, this.best);
    }
  }

  /** 彻底释放：停循环、移除监听、卸载渲染器。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    for (const timer of this.resizeTimers) clearTimeout(timer);
    this.resizeTimers.length = 0;
    this.detachInput();
    this.renderer.unmount();
  }

  // ── 循环 ─────────────────────────────────────────────────

  private loop = (ts: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    if (!this.lastT) this.lastT = ts;
    let dt = (ts - this.lastT) / 1000;
    this.lastT = ts;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, MAX_DT);
    this.visualTime += dt;

    if (this.state.phase === 'running') {
      this.stepRules(dt);
    } else if (this.state.phase !== 'paused' && this.state.attackT > 0) {
      // idle / over 只衰减出招动作（旧 `stepVisualOnly`）
      this.stepRules(dt);
    }

    // 暂停时粒子 / 环 / 刀光 / 飘字仍继续衰减（照抄旧实现）
    this.presentation.step(dt);
    if (this.state.phase === 'running' && this.state.frenzyActive) this.emitFrenzy(dt);

    this.render();
    this.hud.update(this.state, this.best);
  };

  private stepRules(dt: number): void {
    const result = reduce(this.state, { type: 'Tick', dt }, this.rng);
    this.state = result.state;
    this.presentation.applyEffects(result.effects);
  }

  /**
   * FEVER 火花 —— 逐字照抄旧 `emitFrenzy()`（`source.html:1238-1253`）。
   *
   * 每帧概率由 `frenzySparkT` 控制，粒子上限 260。
   */
  private emitFrenzy(dt: number): void {
    this.frenzySparkT -= dt;
    if (this.frenzySparkT > 0) return;
    if (this.presentation.effects.particles.length >= MAX_PARTICLES) return;
    this.frenzySparkT = rand(0.035, 0.08);

    const { playerX, playerR, height } = this.state.layout;
    const a = rand(0, Math.PI * 2);
    const rr = playerR * rand(1.2, 2.1);
    this.presentation.effects.addSpark(
      playerX + Math.cos(a) * rr,
      height / 2 + Math.sin(a) * rr,
      -rand(40, 160),
      rand(-70, 20),
      rand(1.4, 3.2),
      rand(0.3, 0.7),
      Math.random() < 0.35 ? '#fff4c2' : GOLD,
    );
  }

  private render(): void {
    const s = this.state;
    const f = this.frame;
    f.layout = s.layout;
    f.phase = s.phase;
    f.hp = s.hp;
    f.score = s.score;
    f.combo = s.combo;
    f.maxCombo = s.maxCombo;
    f.kills = s.kills;
    f.critCount = s.critCount;
    f.normalCount = s.normalCount;
    f.frenzyActive = s.frenzyActive;
    f.feverT = s.feverT;
    f.now = s.now;
    f.visualTime = this.visualTime;
    f.monsters = s.monsters;
    f.attackT = s.attackT;
    f.attackLane = s.attackLane;
    f.effects = this.presentation.effects;
    f.shake = this.presentation.shake.value;
    f.playerFlash = this.presentation.playerFlash;
    this.renderer.render(f);
  }

  // ── 规则事件 ─────────────────────────────────────────────

  private press(lane: Lane, inputId: string): void {
    if (this.state.phase !== 'running') return;
    const result = reduce(this.state, { type: 'Press', lane, inputId }, this.rng);
    this.state = result.state;
    this.presentation.applyEffects(result.effects);
    this.hud.update(this.state, this.best);
  }

  private release(inputId: string): void {
    if (this.state.phase !== 'running') return;
    const result = reduce(this.state, { type: 'Release', inputId }, this.rng);
    this.state = result.state;
    this.presentation.applyEffects(result.effects);
    this.hud.update(this.state, this.best);
  }

  private cancelHold(): void {
    if (this.state.holdMonsterId === null) return;
    const result = reduce(this.state, { type: 'CancelHold' }, this.rng);
    this.state = result.state;
    this.presentation.applyEffects(result.effects);
  }

  private enterPause(): void {
    const result = reduce(this.state, { type: 'Pause' }, this.rng);
    this.state = result.state;
    this.presentation.applyEffects(result.effects);
    this.hud.update(this.state, this.best);
    this.render();
  }

  private finishGameOver(): void {
    if (this.state.phase !== 'over') return;
    if (this.state.score > this.best) {
      this.best = this.state.score;
      saveBest(this.best);
    }
    this.hud.update(this.state, this.best);
  }

  // ── 输入 ─────────────────────────────────────────────────

  private attachInput(): void {
    this.stage.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('touchmove', this.onTouchMove, { passive: false });
  }

  private detachInput(): void {
    this.stage.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('touchmove', this.onTouchMove);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (this.state.phase !== 'running') return;
    if (!isPrimaryPointer(event)) return;
    const lane = laneFromClientY(event.clientY, this.stage.getBoundingClientRect());
    if (!lane) return;
    event.preventDefault();
    this.press(lane, pointerInputId(event));
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.release(pointerInputId(event));
  };

  private onBlur = (): void => {
    this.cancelHold();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const action = keyActionFor(event.code);
    if (!action) return;

    if (action.type === 'toggle-pause') {
      event.preventDefault();
      if (this.state.phase === 'running') this.pause();
      else if (this.state.phase === 'paused') this.resume();
      return;
    }

    if (action.type === 'confirm') {
      event.preventDefault();
      if (this.state.phase === 'idle') this.start();
      else if (this.state.phase === 'over') this.restart();
      return;
    }

    if (action.type !== 'press') return;
    event.preventDefault();
    if (this.state.phase === 'idle') this.start();
    else if (this.state.phase === 'running') this.press(action.lane, action.inputId);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    const inputId = releaseInputFor(event.code);
    if (inputId) this.release(inputId);
  };

  private onVisibilityChange = (): void => {
    if (document.hidden && this.state.phase === 'running') this.pause();
  };

  private onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private onTouchMove = (event: TouchEvent): void => {
    event.preventDefault();
  };

  // ── 尺寸 ─────────────────────────────────────────────────

  private observeResize(): void {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('orientationchange', this.onWindowResize);
  }

  private onWindowResize = (): void => {
    this.resize();
    for (const timer of this.resizeTimers) clearTimeout(timer);
    // 移动端旋转后尺寸可能晚一两帧才稳定（旧实现在 70ms / 260ms 各补一次）
    this.resizeTimers = [
      window.setTimeout(() => this.resize(), 70),
      window.setTimeout(() => this.resize(), 260),
    ];
  };

  private measureLayout(): Layout {
    const rect = this.stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return computeLayout(rect.width, rect.height, dpr);
  }

  private resize(force = false): void {
    if (this.disposed) return;
    const rect = this.stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (
      !force &&
      Math.abs(rect.width - this.lastW) < 0.01 &&
      Math.abs(rect.height - this.lastH) < 0.01 &&
      dpr === this.lastDpr
    ) {
      return;
    }

    this.lastW = rect.width;
    this.lastH = rect.height;
    this.lastDpr = dpr;

    const layout = computeLayout(rect.width, rect.height, dpr);
    const result = reduce(this.state, { type: 'Resize', layout }, this.rng);
    this.state = result.state;
    this.presentation.applyEffects(result.effects);
    this.renderer.resize(layout);
    this.applyVignette(layout);
  }

  /** 静态暗角交给 CSS 合成层（旧 `source.html:542-548`）。 */
  private applyVignette(layout: Layout): void {
    const rIn = Math.min(layout.width, layout.height) * 0.32;
    const rOut = Math.max(layout.width, layout.height) * 0.72;
    this.stage.style.setProperty('--vignette-in', `${rIn.toFixed(1)}px`);
    this.stage.style.setProperty('--vignette-out', `${rOut.toFixed(1)}px`);
  }
}
