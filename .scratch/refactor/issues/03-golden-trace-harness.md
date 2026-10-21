# 03 — 保真门禁：golden trace 逐帧对照

Status: resolved
Blocked by: 02

## 目标

把"1:1 保真"从口号变成 CI 里可执行的门禁。**这是行为正确性校验，不是性能测量**（headless、无渲染、毫秒级）。

## 要做

1. **给旧 `source.html` 打补丁**（临时，可放在 `scripts/legacy/` 下，不进主源码）：
   - 把 `rand()` 换成带种子的 mulberry32，种子由 URL 参数 `?seed=` 传入。
   - 记录**事件流**：每次 `strike(lane)` / `releaseHold` 的轨道与游戏时刻。
   - 每帧输出**状态快照**：`hp` / `score` / `combo` / `kills` / `critCount` / `normalCount` / `frenzyActive` / 全部怪物的 `{lane, x, y, w, h, state}`。

2. **新规则层回放器**：喂同一种子 + 同一事件流，产出同格式的 trace。

3. **逐帧 diff 脚本** `scripts/compare-trace.mjs`：任何一帧不一致就报错并指出第一处差异的帧号与字段。

4. **接进 CI**：至少覆盖 3 个固定种子 × 2 个难度星级（1★ / 2★），每局 120 秒。

## 验收

- 3 个种子 × 2 难度的 trace **逐帧完全一致**。
- 唯一允许的差异是 spec 里记录的两条已知差异（`clearLane` 修复导致的**长按怪刷新时机**、以及 `computeLayout` 的 `playerX` 顺序修复导致的**判定区 X 坐标**）。这两条要在 diff 脚本里**显式豁免并说明**，而不是靠人眼忽略。

## 备注

- 这套机制的价值在于：后面 04/05/06/07 每一票改动的行为影响，都由它兜底。
- 事件流要覆盖双生与长按怪两种特殊怪物，否则门禁会漏掉最复杂的结算路径。
- 旧的 `source.html` 是唯一的"正确答案"参照物，**在 Phase 7 删掉它之前，这个门禁必须先跑通并稳定**。

## Answer

已实现，分支 `feat/ticket-03-golden-trace-harness`（实现提交 `b81e500` + 合并提交 `1cc819b`）。

### 交付物

- `src/game/trace.ts` —— 黄金轨迹的**共享格式**与**共享事件剧本**。
  旧 harness 与新回放器**共用同一份源码**（浏览器侧由补丁脚本用 `typescript.transpileModule`
  转译后内联进 harness，Node 侧直接 import）→ 「快照一致 ⇒ 事件流一致」。
  这一点是必需的：两边各自判断事件流的话，一旦规则有差异，diff 报出来的是
  「怪的位置不一样」，而根因是「事件流不一样」，极具迷惑性。
- `scripts/legacy/patch-legacy.mjs` —— 读 `source.html`（**只读**）→ 生成
  `legacy-harness-A.html` / `legacy-harness-Bprime.html`（生成物，不入 git）。
  11 条补丁（P0~P8 + D1 + D2），每条锚点唯一性逐条断言（`count === 1`）。
- `scripts/legacy/trace-legacy.mjs` —— Playwright 驱动旧 harness 产出轨迹。
- `scripts/replay-new.mjs` —— 新规则层回放器。
- `scripts/compare-trace.mjs` —— **主缝**：逐帧比对器。退出码 `0` 一致 / `1` 分叉 / `2` 用法错误。
- `scripts/trace-gate.mjs` —— CI 门禁（`npm run trace`）。
- `scripts/trace-coverage.mjs` —— 十条结算路径的覆盖分析器。
- `scripts/trace-search.mjs` —— 种子搜索（挑出十路径全覆盖的固定种子）。
- `scripts/trace-spec.mjs` —— 共享配置（viewport / dt / 帧数 / 种子 / 难度）。

### 三种比对模式

| 模式 | 旧 harness | 新规则层 | 要求 |
|---|---|---|---|
| **A** | D1 修 + D2 修 | D1 修 + D2 修 | **逐帧完全一致 → CI 门禁** |
| **B′** | D2 修，**保留 D1 bug** | D2 修，**保留 D1 bug** | **逐帧完全一致 → CI 门禁** |
| C | 原样旧版（保留 D1 bug） | D1 修 | 报告第一处分叉 + 归因，**非门禁** |

模式 B′ 是 A 的**对照组**：两边都保留旧的 `clearLane` bug → 逐帧一致，
以此证明「除 D1 外新旧完全等价」；模式 C 再单独展示 D1 的全部影响面。

### 门禁结果（3 种子 × 2 难度 × 120 秒 = 7200 帧 / 条）

- 模式 A：**6/6 条逐帧完全一致**。
- 模式 B′：**6/6 条逐帧完全一致**。
- 模式 C：第一处分叉全部落在 `rulesDraws` 字段上，差值恰好为 1
  → 规则随机流在第一次「旧版 `clearLane` 返回 null / 新版返回一条轨」的地方错位
  → **归因 D1**（已知差异，非回归）。
- 十条结算路径在**每一条**轨迹上都覆盖。

### 门禁抓到的真实差异（本次重构最有价值的产出）

1. **长按怪漏怪那一帧的位置**（已修，`src/game/rules/tick.ts`）：
   旧实现是「**先移动、再判定漏怪**」（`source.html:1309-1312`），
   新实现把移动后的 `x` 漏掉了 → 逃逸滑出比旧版晚一帧。
   模式 B′ 下第一处分叉就落在 `monsters[0].x`（差 3.58 px）。
2. **规则随机消费次数**（已修，票 02）：双生怪的 `wob` 旧版抽 2 次、新版抽 1 次。
3. **`removed` 怪物滞留一帧**（已处理，`src/game/trace.ts`）：新侧过滤 `removed`，旧侧用断言。

### B′ 开关：`GameState.legacyClearLane`

- 唯一写入点：`createGameState({ legacyClearLane: true })`。
- 规则层的 `Start` 事件**不传**这个选项 → 走 `reduce()` 开局的游戏恒为 `false`。
- 其它事件（`Tick` / `Press` / `Release` / `CancelHold` / `SetDifficulty`）也都不会把它打开。
- 单测 `src/game/__tests__/legacy-clear-lane.test.ts` 对以上每一条都有断言。

### 已知限制

- 门禁覆盖的是**规则层**行为（`hp` / `score` / `combo` / 怪物位置与状态），
  **不覆盖**表现层（粒子 / 刀光 / 震屏）与音频 —— 那些按 ADR-0004 不做性能断言，
  也没有旧版可对照的基线。
- 轨迹用 JSONL 落盘时单条约 3~5 MB（7200 帧）；CI 里不落盘，只在内存里比对。
- 旧 harness 需要 headless Chromium；本机 Playwright 缓存版本与包版本不一致时
  会自动回退到系统 Chromium（`scripts/browser.mjs`）。
