# 屏幕状态与规则阶段解耦：菜单子路由住在 React 层

**状态**：已采纳（2026-10-23）

## 背景

规则层有一个 `Phase`（`src/game/types.ts`）：

```ts
export type Phase = 'idle' | 'running' | 'paused' | 'over';
```

`src/app/screenMachine.ts` 原本**直接复用**它当屏幕状态，注释里写明这是有意的：

> 状态名直接复用规则层的 `Phase`（`idle | running | paused | over`）——
> 规则层的 `GameState.phase` 与屏幕状态是**同一个概念**，不另造词汇
> （见 `GLOSSARY.md` 与 ADR-0003）。

界面重构把开始界面拆成了三屏（**主页面 / 难度 / 玩法说明**）。这三屏
**全部处于规则层的 `idle`** —— 规则层对「玩家正在看哪一屏」一无所知，
也不该知道。

如果继续让屏幕状态等于规则阶段，就得往 `Phase` 里塞 `'difficulty'`、
`'help'` 这类值：那会让规则层开始关心界面，而规则层是**纯函数层**
（ADR-0003：无 DOM、不认识 React、只管对局）。规则层一旦知道「界面现在
停在难度屏」，它就不再是纯函数层了。

## 决策

**拆成两件事，各管各的：**

| 概念 | 归属 | 取值 | 谁在用 |
| --- | --- | --- | --- |
| 规则阶段 | 规则层 `GameState.phase` | `idle / running / paused / over` | 规则层、会话层、HUD |
| 菜单子路由 | React 层 `src/app/menuRoute.ts` | `home / difficulty / help` | 只有 `src/app/` |

- 规则层的 `Phase` **一个值都没加**，`src/game/**` 一行没改。
- 菜单子路由是一个**独立的纯函数状态机**（`src/app/menuRoute.ts`），
  形状与 `screenMachine.ts` 一致：合法转换表 + 非法转换静默拒绝 + 可直接单测。
- 界面状态 = **规则阶段 + 菜单子路由**。`phase !== 'idle'` 时子路由无意义
  （对局中不显示菜单屏），所以组合只有一种有效的读法。
- 「点屏幕开始」只在**主页面**成立（`App.tsx` 的 `isHomeScreen()`）：
  在难度 / 玩法说明屏上点空白处不该直接开打。

## 为什么不是别的做法

**把菜单状态塞进规则层的 `Phase`** —— 规则层会开始认识界面，破坏 ADR-0003
的纯函数边界。而且「这一局处于 idle」和「玩家在看难度屏」是两个正交的事实，
硬塞进一个枚举只会逼出 `'idle-difficulty'` 这种组合爆炸。

**不用状态机，直接用 React state + if 链** —— 能跑，但「哪些导航是非法的」
这条规则就没法脱离 DOM 单测了。`screenMachine.ts` 存在的理由正是这个
（文件头注释：「React 组件里的 `useState` 没法直接单测」），菜单子路由同理。

**用路由库（react-router 之类）** —— 本项目是**单文件产物**（ADR-0001），
加一个路由库要为此改构建配置；而这里只有 3 个屏、5 个动作，
一个 40 行的纯函数模块比一个依赖划算。

## 后果

- `src/app/` 里多了一个概念（菜单子路由）。它与 `Phase` 的区别写在
  `src/app/menuRoute.ts` 的文件头，规则层无需知道。
- `App.tsx` 的主 effect 依赖数组仍是 `[renderer, seed]`。菜单的键盘回调
  用 **ref 固定**（`menuMoveRef` / `menuBackRef`）—— 直接把回调写进依赖数组
  会让会话**每渲染一次就重建一次**。
- 端到端脚本判「是不是菜单态」要同时认三个选择器
  （`#startScreen` / `#difficultyScreen` / `#helpScreen`）——
  `tests/e2e/lib/harness.mjs` 的 `readPhase()` 已改。
- **旧版对照门禁的边界变了**：开始界面不再与 `source.html` 逐字对齐
  （那正是这次重构的目的），`compare-legacy.mjs` 改为比「默认选中的难度
  星级」这个**值**。这件事记在 `CHANGELOG.md` 的 0.3.0 段。
