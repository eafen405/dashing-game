/**
 * 顶部 HUD —— 旧实现的 `#hud`（`source.html:293-306`）。
 *
 * **重渲染频率由「值变化」驱动**，不由帧驱动：
 * 组件订阅 `hudStore`（`useSyncExternalStore`），
 * 快照引用没变就不重渲染（ADR-0003 / ADR-0004）。
 *
 * **两层结构**（把「产出 DOM」与「被父组件带着重渲染」拆开）：
 *
 * ```
 * Hud（外壳）          ← 父组件（GameApp）每次 setState 都会让它重跑
 *  └─ HudView（memo）  ← 只有 HUD 的值真的变了才会重跑，才产出 DOM 变化
 * ```
 *
 * 外壳必须跟着父组件重跑（它要重新读快照），但**代价高昂的部分 ——
 * 协调 HUD 那二十来个 DOM 节点** —— 被 `memo` 挡在 `HudView` 里，
 * 只在值真的变了时才发生。父组件的事件（命中飘字 / 轨道高亮 / 受击闪屏）
 * 于是不会再带动 HUD 的 DOM 协调。
 *
 * **四个统计块的顺序照抄旧版**（`source.html:300-303`）：
 * `SCORE → COMBO → 暴击/普攻 → BEST`。
 */

import { memo, useEffect, useMemo, useRef } from 'react';
import type { ReactElement, RefObject } from 'react';

import { BestStat } from './BestStat';
import { ComboBadge } from './ComboBadge';
import { HealthBar } from './HealthBar';
import { ScorePanel } from './ScorePanel';
import { exposeHudStats, hudStats, installHudDomObserver } from './hudStats';
import { useHudSnapshot } from './hudStore';

/** HUD 属性。 */
export interface HudProps {
  /** 暂停按钮。 */
  onPause: () => void;
  /** 全屏按钮。 */
  onToggleFullscreen: () => void;
}

/** HUD 内容视图的属性 —— 全是原始值 + 两个稳定回调（`memo` 靠浅比较生效）。 */
interface HudViewProps {
  hp: number;
  maxHp: number;
  burning: boolean;
  score: number;
  combo: number;
  comboLabel: string;
  critCount: number;
  normalCount: number;
  best: number;
  frenzyActive: boolean;
  onPause: () => void;
  onToggleFullscreen: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
}

/**
 * HUD 的内容视图 —— **唯一产出 DOM 变化的地方**。
 *
 * `memo` 的浅比较：所有 HUD 值都是原始值，两个回调由外壳用 `useMemo` 固定，
 * `rootRef` 是稳定的 ref 对象 —— 所以父组件重渲染时这一层**整体跳过**。
 */
const HudView = memo(function HudView({
  hp,
  maxHp,
  burning,
  score,
  combo,
  comboLabel,
  critCount,
  normalCount,
  best,
  frenzyActive,
  onPause,
  onToggleFullscreen,
  rootRef,
}: HudViewProps): ReactElement {
  // 渲染计数（每提交一次 +1）+ DOM 变更观测。
  // 这两样只为给「HUD 不许 60fps 重渲染」提供可观测证据，不影响任何行为。
  useEffect(() => {
    hudStats.renders += 1;
  });
  useEffect(() => {
    exposeHudStats();
    if (rootRef.current) installHudDomObserver(rootRef.current);
  }, [rootRef]);

  return (
    <div id="hud" className="hud" ref={rootRef}>
      <HealthBar hp={hp} maxHp={maxHp} burning={burning} />

      <div className="hud-right">
        <ScorePanel score={score} frenzyActive={frenzyActive} burning={burning} />
        <ComboBadge
          combo={combo}
          comboLabel={comboLabel}
          critCount={critCount}
          normalCount={normalCount}
          frenzyActive={frenzyActive}
          burning={burning}
        />
        <BestStat best={best} />

        <button
          id="btnFull"
          type="button"
          className="icon-button"
          aria-label="全屏"
          data-no-strike=""
          onClick={onToggleFullscreen}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
          </svg>
        </button>
        <button
          id="btnPause"
          type="button"
          className="icon-button"
          aria-label="暂停"
          data-no-strike=""
          onClick={onPause}
        >
          ❚❚
        </button>
      </div>
    </div>
  );
});

/** 顶部 HUD。 */
export function Hud({ onPause, onToggleFullscreen }: HudProps): ReactElement {
  const hud = useHudSnapshot();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 父组件每次渲染都会换新的函数身份（`handlePause` 是内联闭包）。
  // 用 ref 兜住最新的一份，再包成**稳定**的回调 ——
  // 这样 `HudView` 的 `memo` 浅比较才拦得住父组件的重渲染。
  const latest = useRef({ onPause, onToggleFullscreen });
  useEffect(() => {
    latest.current = { onPause, onToggleFullscreen };
  });

  const callbacks = useMemo(
    () => ({
      onPause: () => latest.current.onPause(),
      onToggleFullscreen: () => latest.current.onToggleFullscreen(),
    }),
    [],
  );

  // 外壳被父组件事件带着重渲染的次数（**不产出任何 DOM 变化**）。
  useEffect(() => {
    hudStats.shellRenders += 1;
  });

  return (
    <HudView
      hp={hud.hp}
      maxHp={hud.maxHp}
      burning={hud.burning}
      score={hud.score}
      combo={hud.combo}
      comboLabel={hud.comboLabel}
      critCount={hud.critCount}
      normalCount={hud.normalCount}
      best={hud.best}
      frenzyActive={hud.frenzyActive}
      onPause={callbacks.onPause}
      onToggleFullscreen={callbacks.onToggleFullscreen}
      rootRef={rootRef}
    />
  );
}
