/**
 * 应用外壳 —— React 只负责 DOM UI，战场交给 `BattlefieldRenderer`。
 *
 * 状态来源：
 * - 低频 UI（HUD / 菜单 / 结算）读 `HudStore` 快照；
 * - 60fps 的游戏状态在 `GameSession` 内部，React 不参与。
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { JSX } from 'react';
import { createCanvas2dRenderer } from '../battlefield/canvas2d';
import type { Difficulty, Lane } from '../game/types';
import { isLandscape, watchOrientation } from '../input/orientation';
import { hudStore } from '../presentation/hudStore';
import { canFullscreen, toggleFullscreen } from './fullscreen';
import { GameSession } from './GameSession';
import { setGameReady } from './diagnostics';
import { Hud } from './hud/Hud';
import { GameOverScreen } from './screens/GameOverScreen';
import { PauseScreen } from './screens/PauseScreen';
import { RotatePrompt } from './screens/RotatePrompt';
import { StartScreen } from './screens/StartScreen';
import './app.css';

interface ToastState {
  text: string;
  color: string;
  seq: number;
}

interface LaneFlashState {
  lane: Lane;
  seq: number;
}

/** 根组件。 */
export default function App(): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<GameSession | null>(null);

  const [landscape, setLandscape] = useState(isLandscape);
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [laneFlash, setLaneFlash] = useState<LaneFlashState | null>(null);
  const [hurtSeq, setHurtSeq] = useState(0);
  const [feverSeq, setFeverSeq] = useState(0);

  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);

  useEffect(() => {
    const stage = stageRef.current;
    const host = hostRef.current;
    if (!stage || !host) return;

    const session = new GameSession({
      stage,
      host,
      renderer: createCanvas2dRenderer(),
      hud: hudStore,
      ui: {
        toast: (text, color) => {
          setToast((prev) => ({ text, color, seq: (prev?.seq ?? 0) + 1 }));
        },
        laneFlash: (lane) => {
          setLaneFlash((prev) => ({ lane, seq: (prev?.seq ?? 0) + 1 }));
        },
        hurt: () => {
          setHurtSeq((seq) => seq + 1);
        },
        feverFlash: () => {
          setFeverSeq((seq) => seq + 1);
        },
        clearFeedback: () => {
          setToast(null);
          setLaneFlash(null);
          setHurtSeq(0);
          setFeverSeq(0);
        },
      },
    });

    sessionRef.current = session;
    setGameReady(true);

    return () => {
      session.dispose();
      sessionRef.current = null;
      setGameReady(false);
    };
  }, []);

  useEffect(() => {
    return watchOrientation((next) => {
      setLandscape(next);
      sessionRef.current?.setLandscape(next);
    });
  }, []);

  const start = (): void => {
    sessionRef.current?.start(difficulty);
  };

  const selectDifficulty = (diff: Difficulty): void => {
    setDifficulty(diff);
    sessionRef.current?.setDifficulty(diff);
  };

  return (
    <div className="dual-app">
      {!landscape && <RotatePrompt />}

      <div className={landscape ? 'game' : 'game is-hidden'}>
        <Hud
          snapshot={snapshot}
          canFullscreen={canFullscreen()}
          onFullscreen={toggleFullscreen}
          onPause={() => sessionRef.current?.pause()}
        />

        <div className="stage" ref={stageRef}>
          <div className="tint" />
          <div className="battlefield-host" ref={hostRef} />
          <div className="vignette" />

          <div className="lane-zone top">
            <span className="lane-hint">上半屏 · 上轨</span>
          </div>
          <div className="lane-zone bottom">
            <span className="lane-hint">下半屏 · 下轨</span>
          </div>

          {laneFlash && (
            <div
              key={laneFlash.seq}
              className={`lane-flash ${laneFlash.lane}`}
              aria-hidden="true"
            />
          )}
          {feverSeq > 0 && <div key={`f${feverSeq}`} className="frenzy-flash" aria-hidden="true" />}
          {hurtSeq > 0 && <div key={`h${hurtSeq}`} className="hurt-flash" aria-hidden="true" />}
          {toast && (
            <div key={`t${toast.seq}`} className="toast" style={{ color: toast.color }}>
              {toast.text}
            </div>
          )}

          {snapshot.phase === 'idle' && (
            <StartScreen
              difficulty={difficulty}
              onSelectDifficulty={selectDifficulty}
              onStart={start}
            />
          )}
          {snapshot.phase === 'paused' && (
            <PauseScreen
              onResume={() => sessionRef.current?.resume()}
              onRestart={() => sessionRef.current?.restart()}
              onHome={() => sessionRef.current?.home()}
            />
          )}
          {snapshot.phase === 'over' && (
            <GameOverScreen
              snapshot={snapshot}
              onRestart={() => sessionRef.current?.restart()}
              onHome={() => sessionRef.current?.home()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
