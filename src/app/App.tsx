/**
 * 应用外壳 —— 屏幕状态机 + 会话 + 输入 + HUD 的装配。
 *
 * **React 不参与 60fps 路径**：规则层状态在 `GameSession` 的字段里（不是 React state），
 * HUD 走 `hudStore` 的外部订阅（值变了才通知），
 * 战场渲染由注入的 `BattlefieldRenderer` 负责（ADR-0002 / ADR-0003）。
 *
 * 屏幕状态机（`idle | running | paused | over`）的合法转换见 `screenMachine.ts`；
 * 这里只负责把「用户操作」翻译成会话动作、把会话的阶段变化翻译成界面。
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import type { BattlefieldRenderer, FrameView } from '../battlefield/types';
import type { Effect } from '../game/effects';
import { computeLayout } from '../game/layout';
import type { Difficulty, Lane, Layout, Phase } from '../game/types';
import { attachKeyboardInput } from '../input/keyboard';
import { attachOrientationWatcher, detectLandscape } from '../input/orientation';
import { attachPointerInput } from '../input/pointer';
import { GameSession } from './GameSession';
import { loadBest, saveBest } from './best';
import { stepDifficulty } from './difficultyMeta';
import { toggleFullscreen } from './fullscreen';
import { Hud } from './hud/Hud';
import { hudStore } from './hud/hudStore';
import { transition as menuTransition, type MenuAction, type MenuRoute } from './menuRoute';
import { DifficultyScreen } from './screens/DifficultyScreen';
import { GameOverScreen } from './screens/GameOverScreen';
import { HelpScreen } from './screens/HelpScreen';
import { PauseScreen } from './screens/PauseScreen';
import { RotatePrompt } from './screens/RotatePrompt';
import { StartScreen } from './screens/StartScreen';

/** 默认种子 —— 同一颗种子必得同一局（便于复现与对照）。 */
export const DEFAULT_SEED = 20240601;

/** 开发期调试挂件（`?debug`）。 */
const DEBUG =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

/** 设备像素比 —— `Math.min(window.devicePixelRatio || 1, 2)`（`source.html:540`）。 */
function devicePixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

/** 应用属性。 */
export interface GameAppProps {
  /** 渲染器（依赖注入）。 */
  renderer: BattlefieldRenderer;
  /** 初始难度星级。 */
  diffLevel?: Difficulty;
  /** 本局种子。 */
  seed?: number;
  /** 阶段变化回调（调试 / 端到端测试用）。 */
  onPhaseChange?: (phase: Phase) => void;
}

/** 顶部提示条。 */
interface ToastState {
  id: number;
  text: string;
  color: string;
}

/** 轨道受击高亮。 */
interface LaneFlashState {
  id: number;
  lane: Lane;
}

/** 轻量帧率 / 帧时统计。 */
interface DebugStats {
  fps: number;
  frameMs: number;
}

/**
 * 应用外壳。
 */
export function GameApp({
  renderer,
  diffLevel = 1,
  seed = DEFAULT_SEED,
  onPhaseChange,
}: GameAppProps): ReactElement {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const [screen, setScreen] = useState<Phase>('idle');
  const [route, setRoute] = useState<MenuRoute>('home');
  const [diff, setDiff] = useState<Difficulty>(diffLevel);
  const [landscape, setLandscape] = useState<boolean>(() => detectLandscape(window));
  const [best, setBest] = useState<number>(() => loadBest());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [hurtId, setHurtId] = useState(0);
  const [frenzyId, setFrenzyId] = useState(0);
  const [laneFlash, setLaneFlash] = useState<LaneFlashState | null>(null);
  const [debugStats, setDebugStats] = useState<DebugStats | null>(null);

  // 事件回调里要读「当前阶段」与「当前会话」——
  // 用 ref 镜像，避免闭包捕获过期值（也避免把 state 塞进依赖数组）。
  const screenRef = useRef<Phase>('idle');
  const routeRef = useRef<MenuRoute>('home');
  const sessionRef = useRef<GameSession | null>(null);
  const bestRef = useRef<number>(best);
  const diffRef = useRef<Difficulty>(diff);
  const phaseListenerRef = useRef<((phase: Phase) => void) | undefined>(onPhaseChange);
  const seqRef = useRef(0);

  // 菜单子屏的键盘回调 —— **用 ref 固定**。
  // 主 effect 的依赖数组是 `[renderer, seed]`，把这两个回调直接写进去
  // 会让会话每渲染一次就重建一次（回调身份每渲染都变）。
  const menuMoveRef = useRef<(delta: -1 | 1) => void>(() => undefined);
  const menuBackRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    phaseListenerRef.current = onPhaseChange;
  });

  // ── 菜单动作 ────────────────────────────────────────────
  //
  // 菜单子屏（主页面 / 难度 / 玩法说明）**全部处于规则层的 `idle`** ——
  // 「屏内怎么走」是界面层自己的事，路由机在 `src/app/menuRoute.ts`
  // （见 `docs/adr/0006-menu-route-decoupled-from-rules-phase.md`）。
  const handleDiffChange = (next: Difficulty): void => {
    diffRef.current = next;
    setDiff(next);
    sessionRef.current?.setDifficulty(next);
  };

  /** 走一步菜单路由；非法转换由 `menuTransition` 静默拒绝（返回原路由）。 */
  const handleMenu = (action: MenuAction): void => {
    const next = menuTransition(routeRef.current, action);
    if (next === routeRef.current) return;
    routeRef.current = next;
    setRoute(next);
  };

  const handleOpenDifficulty = (): void => handleMenu('openDifficulty');
  const handleOpenHelp = (): void => handleMenu('openHelp');
  const handleMenuBack = (): void => handleMenu('backHome');

  /** 难度屏上选定一档 —— 选定并回主页面。 */
  const handlePickDifficulty = (next: Difficulty): void => {
    handleDiffChange(next);
    handleMenu('confirmDifficulty');
  };

  /**
   * 菜单里上下移动 —— 在难度屏上就是**换一档**。
   *
   * 难度即光标：上下移动即改选中档，不另设一个光标状态
   * （难度本来就是跨局保留的全局选择，改了不影响当前局面）。
   */
  const handleMenuMove = (delta: -1 | 1): void => {
    if (routeRef.current !== 'difficulty') return;
    handleDiffChange(stepDifficulty(diffRef.current, delta));
  };

  useEffect(() => {
    menuMoveRef.current = handleMenuMove;
    menuBackRef.current = handleMenuBack;
  });

  useEffect(() => {
    // 「舞台」= 旧实现的 `#stage`：尺寸基准 + 指针输入的命中区。
    // 「画布宿主」= 渲染器把 canvas 挂进去的容器（与舞台同尺寸）。
    // 分成两个是因为 canvas 由渲染器创建（React 不认识它），
    // 放在独立的容器里可以避免 React 协调时把它挤掉。
    const stage = stageRef.current;
    const host = hostRef.current;
    if (!stage || !host) return;

    const measure = (): Layout => {
      const rect = stage.getBoundingClientRect();
      return computeLayout(
        rect.width > 1 ? rect.width : 800,
        rect.height > 1 ? rect.height : 400,
        devicePixelRatio(),
      );
    };

    // ── 帧统计（开发期挂件） ──────────────────────────────
    const stats = { frames: 0, acc: 0, last: 0, worst: 0 };

    const handleFrame = (frame: FrameView): void => {
      // HUD 快照：每帧发布，但**只有值变了**才通知订阅者（hudStore 的脏检查）。
      hudStore.publish({
        hp: frame.hp,
        score: frame.score,
        combo: frame.combo,
        maxCombo: frame.maxCombo,
        kills: frame.kills,
        critCount: frame.critCount,
        normalCount: frame.normalCount,
        frenzyActive: frame.frenzyActive,
        feverT: frame.feverT,
        best: Math.max(bestRef.current, frame.score),
      });

      if (!DEBUG) return;
      const now = performance.now();
      if (stats.last > 0) {
        const cost = now - stats.last;
        stats.worst = Math.max(stats.worst, cost);
      }
      stats.last = now;
      stats.frames += 1;
      if (stats.acc === 0) stats.acc = now;
      const span = now - stats.acc;
      if (span >= 500) {
        setDebugStats({
          fps: Math.round((stats.frames * 1000) / span),
          frameMs: Math.round((stats.worst * 10) / 10),
        });
        stats.frames = 0;
        stats.acc = now;
        stats.worst = 0;
      }
    };

    const handleEffect = (effect: Effect): void => {
      switch (effect.type) {
        case 'toast':
          setToast({ id: (seqRef.current += 1), text: effect.text, color: effect.color });
          break;
        case 'hurt':
          setHurtId((id) => id + 1);
          break;
        case 'fever-start':
          setFrenzyId((id) => id + 1);
          break;
        case 'lane-flash':
          setLaneFlash({ id: (seqRef.current += 1), lane: effect.lane });
          break;
        case 'vibrate':
          vibrate(effect.pattern);
          break;
        case 'game-over': {
          const session = sessionRef.current;
          const score = session ? session.getState().score : 0;
          const next = saveBest(score, bestRef.current);
          if (next !== bestRef.current) {
            bestRef.current = next;
            setBest(next);
          }
          break;
        }
        default:
          break;
      }
    };

    const handlePhaseChange = (phase: Phase): void => {
      screenRef.current = phase;
      setScreen(phase);
      phaseListenerRef.current?.(phase);
    };

    const session = new GameSession({
      renderer,
      host,
      diffLevel: diffRef.current,
      seed,
      layout: measure(),
      onFrame: handleFrame,
      onEffect: handleEffect,
      onPhaseChange: handlePhaseChange,
    });
    sessionRef.current = session;
    void session.mount();

    // ── 开发期钩子（`?debug`）──────────────────────────────
    //
    // `window.__FX_DEBUG__` —— 端到端测试用它把效果事件直接灌进表现层，
    // 从而**稳定复现**某个瞬间（暴击 / FEVER / 双生同破）而不必真的打到那一下。
    // 画面仍然是真渲染；不带 `?debug` 时这个对象根本不存在。
    if (DEBUG) {
      (globalThis as unknown as { __FX_DEBUG__?: unknown }).__FX_DEBUG__ = {
        /** 灌一批效果事件到表现层。 */
        apply: (effects: Effect[]) => session.applyDebugEffects(effects),
        /** 当前布局（算点击位置用）。 */
        layout: () => session.getState().layout,
        /** 强制 FEVER（规则状态 + 表现层一起）。 */
        fever: (on: boolean) => session.setDebugFever(on),
      };
    }

    // ── 输入接线 ──────────────────────────────────────────
    //
    // 「点击屏幕开始」只在**主页面**成立 —— 难度 / 玩法说明两个子屏上
    // 点空白处不该直接开打（那会把玩家正在看的内容瞬间掀掉）。
    const isHomeScreen = (): boolean => screenRef.current === 'idle' && routeRef.current === 'home';

    const detachPointer = attachPointerInput({
      stage,
      sink: session,
      isStartScreen: isHomeScreen,
      onStartFromTap: () => session.start(),
    });

    const detachKeyboard = attachKeyboardInput({
      sink: session,
      isStartScreen: isHomeScreen,
      isOver: () => screenRef.current === 'over',
      onStartFromTap: () => session.start(),
      onTogglePause: () => {
        const current = session.phase;
        if (current === 'running') session.pause();
        else if (current === 'paused') session.resume();
      },
      onRestart: () => session.restart(),
      isInMenu: () => screenRef.current === 'idle' && routeRef.current !== 'home',
      onMenuMove: (delta) => menuMoveRef.current(delta),
      onMenuConfirm: () => menuBackRef.current(),
      onMenuBack: () => menuBackRef.current(),
    });

    const detachOrientation = attachOrientationWatcher({
      isRunning: () => session.phase === 'running',
      isPaused: () => session.phase === 'paused',
      pause: () => session.pause(),
      resume: () => session.resume(),
      onLandscapeChange: (value) => setLandscape(value),
    });

    // ── 布局接线（ResizeObserver；旧代码是 window.resize + 3 个 setTimeout 兜底） ──
    const observer = new ResizeObserver(() => {
      session.resize(measure());
    });
    observer.observe(stage);

    return () => {
      detachPointer();
      detachKeyboard();
      detachOrientation();
      observer.disconnect();
      session.dispose();
      sessionRef.current = null;
    };
  }, [renderer, seed]);

  // ── 界面动作 ────────────────────────────────────────────
  const handlePause = (): void => sessionRef.current?.pause();
  const handleResume = (): void => sessionRef.current?.resume();
  const handleRestart = (): void => sessionRef.current?.restart();
  const handleToggleFullscreen = (): void => toggleFullscreen();

  /** 暂停界面的「回主页面」—— 回**主页面**（不是难度屏）。 */
  const handleQuitToHome = (): void => {
    sessionRef.current?.quitToHome();
    handleMenu('backHome');
  };

  /** 结算界面的「选择难度」—— 直接进**难度屏**（旧版是回开始界面重选）。 */
  const handleChooseDifficulty = (): void => {
    sessionRef.current?.chooseDifficulty();
    handleMenu('openDifficulty');
  };

  const showStart = screen === 'idle';
  const showPause = screen === 'paused';
  const showGameOver = screen === 'over';

  return (
    <div className={landscape ? 'app landscape' : 'app portrait'}>
      <RotatePrompt />

      <div className="game">
        <Hud onPause={handlePause} onToggleFullscreen={handleToggleFullscreen} />

        <div className="stage" ref={stageRef}>
          <div className="tint" />
          <div className="canvas-host" ref={hostRef} />
          <div className="vignette" />

          <div
            key={`lane-top-${laneFlash && laneFlash.lane === 'top' ? laneFlash.id : 0}`}
            className={
              laneFlash && laneFlash.lane === 'top' ? 'lane lane-top hit' : 'lane lane-top'
            }
            aria-hidden="true"
          >
            <span className="hint">上半屏 · 上轨</span>
          </div>
          <div
            key={`lane-bottom-${laneFlash && laneFlash.lane === 'bottom' ? laneFlash.id : 0}`}
            className={
              laneFlash && laneFlash.lane === 'bottom' ? 'lane lane-bottom hit' : 'lane lane-bottom'
            }
            aria-hidden="true"
          >
            <span className="hint">下半屏 · 下轨</span>
          </div>

          {frenzyId > 0 ? <div key={frenzyId} className="frenzy-flash show" /> : null}
          {hurtId > 0 ? <div key={hurtId} className="hurt-flash show" /> : null}
          {toast ? (
            <div key={toast.id} className="toast show" style={{ color: toast.color }}>
              {toast.text}
            </div>
          ) : null}

          {showStart ? (
            route === 'difficulty' ? (
              <DifficultyScreen
                diffLevel={diff}
                onPick={handlePickDifficulty}
                onBack={handleMenuBack}
              />
            ) : route === 'help' ? (
              <HelpScreen onBack={handleMenuBack} />
            ) : (
              <StartScreen
                diffLevel={diff}
                onOpenDifficulty={handleOpenDifficulty}
                onOpenHelp={handleOpenHelp}
              />
            )
          ) : null}
          {showPause ? (
            <PauseScreen
              onResume={handleResume}
              onRestart={handleRestart}
              onQuitToHome={handleQuitToHome}
            />
          ) : null}
          {showGameOver ? (
            <GameOverScreen
              score={hudStore.getSnapshot().score}
              maxCombo={hudStore.getSnapshot().maxCombo}
              kills={hudStore.getSnapshot().kills}
              best={best}
              onRestart={handleRestart}
              onChooseDifficulty={handleChooseDifficulty}
            />
          ) : null}
        </div>

        {DEBUG && debugStats ? (
          <div className="debug-stats">
            {debugStats.fps} FPS · {debugStats.frameMs} ms
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** 震动（`navigator.vibrate`）—— 表现层副作用，由上层在收到规则层 `vibrate` 效果后触发。 */
function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // 某些浏览器会抛（未获用户手势）—— 忽略
  }
}
