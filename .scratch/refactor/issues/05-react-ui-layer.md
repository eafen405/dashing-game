# 05 — React UI 层：HUD / 菜单 / 结算 / 暂停 / 竖屏提示

Status: resolved
Blocked by: 02, 04

## 目标

把全部 DOM 界面改成 React 组件，战场交给 `BattlefieldRenderer`。至此 React 只出现在它擅长的地方。

## 要做

1. **屏幕状态机** `src/app/App.tsx`：`idle | running | paused | over`，替代旧的全局 `state` 字符串（`source.html:450`）。

2. **会话编排** `src/app/GameSession.ts`：持有规则层 state（在 ref 里，不在 React state 里），每帧 `tick(state, dt, rng)` → 表现层更新 → `renderer.render(frame)`。**React 不参与 60fps 路径**。

3. **组件**：
   - `screens/StartScreen.tsx`（含难度星级选择）
   - `screens/PauseScreen.tsx`
   - `screens/GameOverScreen.tsx`（SCORE / MAX COMBO / KILLS / BEST）
   - `screens/RotatePrompt.tsx`（竖屏提示）
   - `hud/Hud.tsx` + `HealthBar` / `ScorePanel` / `ComboBadge`

4. **hudStore** `src/presentation/hudStore.ts`：`useSyncExternalStore` + 脏检查。只在 hp / score / combo / fever 等**真的变了**才通知订阅者 —— 沿用旧代码 `source.html:461-462` 的思路，但改成事件驱动，替代旧代码每帧调用 `syncHUD()` 的做法。

5. **输入** `src/input/`：`pointer.ts`（半屏点击 → 规则层事件）、`keyboard.ts`（↑/W、↓/S、P、Enter/Space）、`orientation.ts`（横竖屏 → 暂停）。**所有输入统一转成规则层事件**，规则层不认识 DOM 事件。

6. **震动**：`navigator.vibrate` 保留（移动端），但它属于表现层副作用，由上层在收到规则层事件后触发。

## 硬性约束

- **HUD 不许 60fps 重渲染**。血量条 / 分数的更新频率由"值变化"驱动，不是由帧驱动。
- **竖屏必须能自动暂停并保留进度**（旧代码 `source.html:514` 的行为）。
- **最高分**继续用 `localStorage["dualrail_best"]`，读写都要 try/catch（旧代码 `source.html:463,726` 已有先例）—— Safari 在 `file://` 下可能禁用。

## 验收

- 全屏流程可走通：开始 → 选难度 → 游戏 → 暂停/恢复 → 结算 → 重开 / 回主页。
- 手机横屏可玩；转竖屏自动暂停并显示提示。
- 桌面键盘与鼠标都可用。
- HUD 在游戏进行中不产生可观测的重渲染抖动。

## 备注

- React 19，不引 `@pixi/react`（见 ADR-0002）。
- 旧代码里 `syncHUD()` 被 10 处调用点触发，其中大部分是规则逻辑顺手改 DOM —— 新代码里这些副作用统一从规则层事件里派生。

## Answer

随 04b 一并实现（依赖 02 / 04 已 resolved），完整流程已跑通：

- `src/app/App.tsx`：唯一 React 根。`GameSession` 生命周期在 `useEffect` 中创建/销毁；
  `useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot)` 读取 HUD；竖屏状态用
  `watchOrientation()` 订阅。React 只渲染 `idle | paused | over` 覆盖层与 HUD，
  不参与逐帧渲染。
- `src/app/GameSession.ts`：规则层状态在实例字段中，不在 React state；每帧
  `stepRules(dt)` → `presentation.step(dt)` → `renderer.render(frame)` → `hud.update()`。
- 组件：`screens/StartScreen.tsx`（含 1★/2★ 难度）、`PauseScreen.tsx`（继续 / 重开 /
  回主页面）、`GameOverScreen.tsx`（SCORE / MAX COMBO / KILLS / BEST）、
  `RotatePrompt.tsx`、`hud/Hud.tsx`（血条 + 分数/连击/暴击普攻/BEST 面板，内联
  `Stat` 子组件）。样式自 `source.html` 移植到 `src/app/app.css`（`.dual-app` /
  `.game` / `.hud` / `.stage` / `.overlay` / 各类反馈动画）。
- `src/presentation/hudStore.ts`：`useSyncExternalStore` 外部 store + 快照脏检查；
  hp / score / combo / crit / normal / best / fever 秒数（`Math.ceil`）任一变化才通知；
  100 次同值更新不触发订阅者（有单测）。
- 输入：`src/input/pointer.ts`、`keyboard.ts`、`orientation.ts`；统一产出规则层
  `press` 事件，规则层不接触 DOM 事件。竖屏自动暂停并记录来源，转回横屏仅恢复
  “因旋转而暂停”的对局。
- 震动：本移植版未接入 `navigator.vibrate`（旧版仅在移动端受击时触发），留待
  09 视觉/手感打磨时统一处理；不影响验收项。
- 验收证据（Playwright，`file://` 单文件产物）：开始覆盖层 1 → 选 2★ → 开始后 0；
  游玩 8s：2000 分 / 7 连击 / 6 暴击 / 1 普攻 / BEST 2000；暂停卡片出现，继续后
  覆盖层 0；回主页后 HUD 归零且标题恢复；转竖屏出现提示并暂停，转横屏提示消失且
  自动恢复；零输入 21s 自然结算，重开/刷新 HUD 正常；无 pageerror / console error。
