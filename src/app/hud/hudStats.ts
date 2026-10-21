/**
 * HUD 渲染统计 —— 给「HUD 不许 60fps 重渲染」这条硬约束提供**可观测的证据**。
 *
 * 票 05 的硬验收项要求给出真实数字（例如「30 秒 / 1800 帧，HUD DOM 变更 N 次」）。
 * 这个模块就是那个数字的来源：
 *
 * | 计数 | 含义 | 在哪里累加 |
 * | --- | --- | --- |
 * | `publishes` | `hudStore.publish()` 的调用次数 ≈ 帧数 | `hudStore.ts` |
 * | `notifications` | 订阅者被通知的次数（= React 被要求重渲染的次数） | `hudStore.ts` |
 * | `renders` | `Hud` 组件提交（commit）的次数 | `Hud.tsx` |
 * | `domMutations` | HUD 子树里由 **React 提交**产生的 DOM 变更次数 | `MutationObserver`（本文件） |
 * | `animatedMutations` | 由 **Motion 动画直接写 DOM** 的次数（分数滚动 / FEVER 脉冲） | `MutationObserver`（本文件） |
 *
 * **判据**：`domMutations` 必须**远小于** `publishes`（帧数）。
 * 两者接近 ⇒ HUD 在 60fps 重渲染 ⇒ 违反硬约束，必须修。
 *
 * 为什么把动画写单列：分数滚动（票 07）由 Motion 直接写 DOM 文本节点，
 * **不经过 React** —— 它会产生 `characterData` 变更，但那是「一次事件驱动的
 * 动画在跑」，不是「HUD 每帧重渲染」。两类写分开计，判据只看 React 那部分。
 *
 * **这个模块不参与任何游戏逻辑**：它只做计数，不改变任何行为。
 * 统计对象挂在 `globalThis.__HUD_STATS__` 上，端到端脚本从页面里读它
 * （跨进程读不到模块内部状态，挂在 window 上是唯一干净的办法）。
 */

/** HUD 统计的快照形状。 */
export interface HudStats {
  /** `hudStore.publish()` 的调用次数 —— 每一帧一次 ≈ 帧数。 */
  publishes: number;
  /** 订阅者被通知的次数 —— 值真的变了才会 +1。 */
  notifications: number;
  /** HUD 内容视图（`HudView`）的提交次数 —— **唯一产出 DOM 变化的一层**。 */
  renders: number;
  /** 外层 `Hud` 外壳的提交次数 —— 父组件事件带着它重跑，但**不产出 DOM 变化**。 */
  shellRenders: number;
  /** HUD 子树里由 React 提交产生的 DOM 变更次数（不含动画写入）。 */
  domMutations: number;
  /** 其中由 Motion 动画直接写入 DOM 的次数（不经 React，不算重渲染）。 */
  animatedMutations: number;
  /** DOM 变更的明细（最多保留 `MUTATION_LOG_LIMIT` 条）。 */
  mutationLog: string[];
}

/** 明细日志的条数上限 —— 防止长时间运行把内存吃满。 */
export const MUTATION_LOG_LIMIT = 200;

/** 全局唯一的统计对象。 */
export const hudStats: HudStats = {
  publishes: 0,
  notifications: 0,
  renders: 0,
  shellRenders: 0,
  domMutations: 0,
  animatedMutations: 0,
  mutationLog: [],
};

/** 把计数清零 —— 测量窗口开始前调用。 */
export function resetHudStats(): void {
  hudStats.publishes = 0;
  hudStats.notifications = 0;
  hudStats.renders = 0;
  hudStats.shellRenders = 0;
  hudStats.domMutations = 0;
  hudStats.animatedMutations = 0;
  hudStats.mutationLog.length = 0;
}

/** 把统计对象挂到 `globalThis.__HUD_STATS__`（端到端脚本从这里读）。 */
export function exposeHudStats(): void {
  const scope = globalThis as unknown as {
    __HUD_STATS__?: HudStats;
    __HUD_STATS_RESET__?: () => void;
  };
  scope.__HUD_STATS__ = hudStats;
  scope.__HUD_STATS_RESET__ = resetHudStats;
}

/** 观测器的引用 —— 重复安装时先断开旧的。 */
let observer: MutationObserver | null = null;

/**
 * 判断一条变更是不是 Motion 动画直接写 DOM 造成的。
 *
 * 标记约定（见 `ScorePanel.tsx` / `ComboBadge.tsx`）：
 * - `data-motion="score-roll"` —— 分数滚动的 `<motion.span>`：文本 / 子节点变更；
 * - `data-motion="combo-pulse"` —— FEVER 脉冲的 `<motion.b>`：只改 `style` 属性。
 *
 * 这两类写入**不经过 React**，不能算进「HUD 重渲染」。
 */
function isAnimationWrite(record: MutationRecord): boolean {
  const target = record.target;
  const el = target instanceof Element ? target : target.parentElement;
  if (!el) return false;
  if (el.closest('[data-motion="score-roll"]')) return true;
  return (
    record.type === 'attributes' &&
    record.attributeName === 'style' &&
    el.closest('[data-motion="combo-pulse"]') !== null
  );
}

/**
 * 在 HUD 根节点上挂 `MutationObserver`，统计 DOM 变更次数。
 *
 * 观察 `childList` / `attributes` / `characterData` 三类 —— 它们合起来
 * 覆盖了「HUD 的任何可见内容变化」的全部情况。Motion 动画直接写 DOM 的部分
 * 记到 `animatedMutations`，其余记到 `domMutations`（判据只看后者）。
 *
 * @param root HUD 根节点（`.hud`）。
 */
export function installHudDomObserver(root: HTMLElement): void {
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (isAnimationWrite(record)) {
        hudStats.animatedMutations += 1;
        continue;
      }
      hudStats.domMutations += 1;
      if (hudStats.mutationLog.length >= MUTATION_LOG_LIMIT) continue;
      hudStats.mutationLog.push(describeMutation(record));
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
}

/** 断开观测器（组件卸载时调用）。 */
export function uninstallHudDomObserver(): void {
  observer?.disconnect();
  observer = null;
}

/** 把一条变更记录压成一行人话。 */
function describeMutation(record: MutationRecord): string {
  const target = record.target;
  const node =
    target instanceof Element
      ? target.className || target.tagName.toLowerCase()
      : target.parentElement?.className || target.nodeName;
  if (record.type === 'characterData') return `characterData · ${node}`;
  if (record.type === 'attributes') return `attributes · ${node}@${record.attributeName}`;
  const added = record.addedNodes.length;
  const removed = record.removedNodes.length;
  return `childList · ${node} (+${added}/-${removed})`;
}
