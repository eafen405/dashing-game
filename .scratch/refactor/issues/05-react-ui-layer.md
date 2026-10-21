# 05 — React UI 层：HUD / 菜单 / 结算 / 暂停 / 竖屏提示

Status: ready-for-agent
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
