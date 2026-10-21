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

票 04b 已经把 React UI 层实现并合并，本票做的是**验证 + 补齐 + 拿量化证据**。

### 补齐的 04b 缺口

| 缺口 | 处理 |
| --- | --- |
| **HUD 统计块顺序与旧版不一致**（spec D5） | 旧版是 `SCORE → COMBO → 暴击/普攻 → BEST`，04b 把 `BEST` 提到了 `COMBO` 前面。已拆出 `hud/BestStat.tsx`，改回旧顺序。**程序化断言**（不是肉眼）：`tests/e2e/compare-legacy.mjs` 用 Playwright 分别读旧版 `source.html` 与新版的 `#hud .stat span` 文本序列比对，不一致即红。 |
| 结算界面旧版文案与字段顺序 | `SCORE / MAX COMBO / KILLS` 三项顺序、`历史最高分 N` 文案、`再来一局 / 选择难度` 按钮顺序，全部与旧版逐字对齐（同一脚本断言）。 |
| combo 标签 | `FEVER Ns` / `COMBO` 由 `hudStore` 派生（`feverT` 取整 → 标签每秒才变一次，不带着 HUD 一起 60fps 重渲染）。 |
| 难度星级选择 | 补回 `data-diff="1|2"`，交互与样式对齐旧版（`★` / `★★`，1 星默认高亮）。 |
| CSS 权重回归（`#` 换 `.` 掉一级） | `.stat b`（0,1,1）会压过 `.crit-text`（0,1,0）→ 暴击计数字号从 15px 变 17px，改成 `.stat .crit-text`（0,2,0）。分数的 `.frenzy` 不该脉动（旧版只有 `#comboText` 脉动）→ 拆出 `.combo-value`。`.go-actions` 里「再来一局」的 `margin-top` 补回旧版的 0。 |

### HUD 不做 60fps 重渲染 —— 量化证据

新增 `src/app/hud/hudStats.ts`（5 个计数器，暴露到 `window.__HUD_STATS__`）：

| 计数 | 含义 |
| --- | --- |
| `publishes` | `hudStore.publish()` 调用次数 ≈ 帧数 |
| `notifications` | 订阅者被通知次数（**值真的变了**才 +1） |
| `renders` | `HudView` 提交次数（**唯一产出 DOM 变化的一层**） |
| `shellRenders` | 外层 `Hud` 提交次数（父组件事件带着重跑，不产出 DOM 变化） |
| `domMutations` | HUD 子树 `MutationObserver` 计数 |

`Hud` 拆成**外壳 + `memo` 化的 `HudView`**：外壳每次父组件 setState 都会重跑（它要重读快照），
但**代价高的 DOM 协调被 `memo` 挡在 `HudView` 里，只在值真的变了时才发生**。

实测（`tests/e2e/hud-stats.mjs`，每个场景 30 秒；连续两次跑数字一致）：

| 场景 | 帧数 | HUD DOM 变更 | 内容渲染 | 外壳渲染 | 事件数 |
| --- | --- | --- | --- | --- | --- |
| A 静置（不操作） | 1801 | **27（1.50%）** | 13 | 16 | 13 次漏怪 |
| B 连续出刀（每 ~120ms 一次） | 1803 | **79（4.38%）** | 20 | 225 | 231 次出刀 |

分子随**事件**增长（漏怪 / 命中），不随帧增长：静置 30 秒里 HUD 只动了 27 次。
场景 B 里外壳被父组件事件带着重跑了 225 次，但**产出 DOM 变化的只有 20 次** ——
DOM 协调被 `memo` 挡在「值变化」这一层。

变更明细（`MutationObserver` 记的）也印证了这一点：
场景 A 全是 `hp-fill@style` + `hp-text`（每次掉血 2 处），场景 B 全是
`stat-value` / `combo-value` / `crit-text`（每次命中分数 / 连击 / 暴击计数变化）。

### 竖屏自动暂停 + 进度保留

`tests/e2e/portrait-progress.mjs`：转竖屏 → 自动暂停 → 隔 1.5 秒再读，**分数 / 连击 / 血量逐字不变**；
转回横屏 → 页面侧监听 `resize`，读到的**恢复瞬间** HUD 数值与暂停前完全相同（不是重开一局）。

### 端到端

新增 6 个 e2e 脚本 + 共享脚手架 `tests/e2e/lib/harness.mjs`：

| 脚本 | 覆盖 |
| --- | --- |
| `flow-8-steps.mjs` | 开始 → 选难度 → 游戏（出刀/命中/飘字/掉血/连击）→ 暂停 → 恢复 → 结算 → 重开 → 回主页 → 最高分持久化（每步一张截图） |
| `hud-stats.mjs` | 上面那张量化表 |
| `portrait-progress.mjs` | 竖屏自动暂停 + 进度保留 |
| `input-desktop.mjs` | 鼠标上/下半屏、键盘 `↑/W/↓/S`、`P`、`Enter/Space` |
| `hold-monster-keyboard.mjs` | 键盘长按怪走完 3 秒（`长按中…` → `长按贯穿！`） |
| `compare-legacy.mjs` | 与旧版 `source.html` 并排对比（开始界面 / HUD / 暂停 / 结算） |

截图目录默认落在仓库内 `dist/e2e-shots/`（`dist/` 已 gitignore），可用 `E2E_SHOTS_DIR` 覆盖。
CI 增加了一步 `npm run test:e2e`（在 `build` 之后）。

### 验收结果

- `npm run typecheck` / `npm run lint` / `npm test`（26 文件 300 用例）/ `npm run build` / `node scripts/verify-single-file.mjs` 全过。
- `npm run test:e2e` 全过（3m40s）。
- `npm run trace`（golden trace 门禁）**通过**，1m23s。

### 已知限制

- FEVER 期间角色周身的金色火花（旧 `emitFrenzy`）归票 07，本票未做。
- `hold-monster-keyboard.mjs` 依赖长按怪的 28% 概率刷新，跑得慢且有概率性，**未接进 CI**。
- 竖屏自动暂停靠视口比例判定（`innerWidth > innerHeight`）+ `orientationchange` 事件；真机上的
  `screen.orientation.lock` 行为需要实机确认。

