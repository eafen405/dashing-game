/**
 * 菜单子路由 —— 规则层停在 `idle`（菜单态）时的**屏内导航**。
 *
 * **为什么要单独一个模块**：规则层的 `Phase`（`idle | running | paused | over`）
 * 描述的是**对局处于什么阶段**，不是「用户看到哪一屏菜单」。
 * 界面重构后开始界面拆成了三屏（主页面 / 难度 / 玩法说明），
 * 它们**全部处于 `idle`** —— 规则层对此一无所知，也不该知道。
 *
 * 所以「屏内怎么走」是**界面层自己的事**，住在 `src/app/`：
 * 规则层的 `Phase` 一行没动（见 `docs/adr/0006-menu-route-decoupled-from-rules-phase.md`）。
 *
 * ```
 *        openDifficulty        openHelp
 *   home ─────────────► difficulty   help
 *    ▲                    │          │
 *    └────────────────────┴──────────┘
 *              backHome / confirmDifficulty
 * ```
 *
 * 与 `screenMachine.ts` 同样的形状：纯函数、非法转换被静默拒绝、可直接单测。
 */

/** 菜单态下的屏。 */
export type MenuRoute = 'home' | 'difficulty' | 'help';

/** 菜单能响应的动作。 */
export type MenuAction =
  /** 进「难度」屏。 */
  | 'openDifficulty'
  /** 进「玩法说明」屏。 */
  | 'openHelp'
  /** 回主页面。 */
  | 'backHome'
  /** 选定某档难度后回主页面。 */
  | 'confirmDifficulty';

/**
 * 合法转换表。
 *
 * 表里没有的组合就是**非法**转换 —— `transition()` 原样返回当前路由。
 */
const TRANSITIONS: Record<MenuRoute, Partial<Record<MenuAction, MenuRoute>>> = {
  home: {
    openDifficulty: 'difficulty',
    openHelp: 'help',
  },
  difficulty: {
    backHome: 'home',
    confirmDifficulty: 'home',
  },
  help: {
    backHome: 'home',
  },
};

/** 这个转换是否合法。 */
export function canTransition(from: MenuRoute, action: MenuAction): boolean {
  return TRANSITIONS[from][action] !== undefined;
}

/**
 * 执行一次转换。
 *
 * 非法转换**被拒**：返回原路由（不抛异常 —— 界面上重复点击不该炸掉整个会话）。
 */
export function transition(from: MenuRoute, action: MenuAction): MenuRoute {
  return TRANSITIONS[from][action] ?? from;
}
