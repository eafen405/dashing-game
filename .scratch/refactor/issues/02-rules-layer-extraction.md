# 02 — 规则层纯化：剥出 src/game/ 全部纯函数

Status: resolved
Blocked by: 01

## 目标

把 `source.html` 里所有"影响胜负"的逻辑剥离成不依赖 DOM、不依赖 Pixi 的纯函数。这是整个重构价值最高的一步。

## 要做

1. **常量**：`src/game/constants.ts` —— 把 `source.html:371-410` 的所有常量原样搬过来（`MAX_HP` / `HIT_DAMAGE` / `ATTACK_DUR` / `FEVER_*` / `BASE_GAIN` / `CRIT_GAIN` / `PAIR_*` / `LONG_*` / `SPEED_*` / `DIFFS` / `LANE`），**连同原始注释一起搬**，保留设计意图的来源。

2. **类型**：`src/game/types.ts` —— `GameState` / `Monster` / `Twin` / `HoldMonster` / `GameEvent` / `Layout`。

3. **PRNG**：`src/game/rng.ts` —— mulberry32，**可注入**。所有 `rand()` / `Math.random()` 必须走它，规则层内部不允许直接调 `Math.random()`。

4. **布局**：`src/game/layout.ts` —— 把 `source.html:534-577` `resize()` 里的几何计算抽成纯函数 `computeLayout(width, height) -> Layout`。`hitX` 的计算依赖 `playerX`、而 `playerX` 在 `playerX` 之前被算过（`source.html:555` vs `560`，首次 resize 时 `playerX` 为 0）—— 这是旧代码的顺序 bug，抽成纯函数时**按正确顺序重算**，并在票内记录为已知差异。

5. **规则**：`src/game/rules/` —— 逐个从旧文件搬：
   - `difficulty.ts` —— `spawnInterval()` / `speedNow()`（`source.html:733-746`）
   - `spawn.ts` —— `spawnMonster()` / `spawnLong()` / `spawnPair()` / `hasActiveLong` / `hasActivePair` / `laneBlocked` / `clearLane`（`source.html:748-858`）
   - `strike.ts` —— `strike()` 的判定部分（`source.html:861-927`）
   - `resolve.ts` —— `killMonster` / `completePair` / `killPair` / `resolvePairSolo` / `pairBlast` / `longAward` / `startHold` / `releaseHold` / `longPenalty` / `failLong` / `missLong` / `completeLong` / `hurtPlayer`
   - `fever.ts` —— `enterFrenzy` / `endFever`（旧代码在 3 处重复了 FEVER 触发块，抽成单一函数）
   - `tick.ts` —— 主推进（`source.html:1285-1391` 的 running 分支）

6. **reducer**：`src/game/reducer.ts` —— `reduce(state, event) -> state`，事件为 `Strike(lane)` / `Tick(dt)` / `Release(id)` / `Start` / `Pause` / `Resume`。

## 硬性约束

- **规则层不得 import 任何 DOM / Pixi / React 类型**。这条要在 lint 层面拦住（`no-restricted-imports`）。
- **状态不可变**：每次产出新对象，不改传入的 state。
- **`done` / `dead` 两个标志的混乱必须解决**：旧代码里 `done` 只在长按怪上赋值（`source.html:824,1160,1305`），`dead` 只在普通怪/双生上赋值（`930,991,1045,1368`），两套语义交叉导致 `clearLane()` 与 `hasActivePair()` 判断不一致。新代码用**单一语义**：`removed`（已离场）。这是本次重构要修的第二个 bug。
- **`clearLane()` 的 bug 要修**：判定"轨道是否被占用"时，只应把**长按怪**算作占用。修后长按怪刷新频率从约每 25 秒回到约每 20 秒。

## 验收

- `src/game/` 下无 DOM / Pixi 依赖（lint 规则强制）。
- 每个规则函数都有单测覆盖（正常路径 + 边界）。
- `tick` 在 300 秒模拟下不崩、无 NaN、怪物数量有界。

## 备注

- 数值与时序**逐字对齐**旧实现 —— 有疑问先查 `source.html`，不要凭直觉调整。
- 表现层（粒子 / 刀光 / 飘字 / 震动）在这一票里**完全不管**，规则层不产生任何视觉副作用。旧代码里 `strike()` 会顺手调 `burst()` / `showToast()`，新代码改为通过事件/副作用队列交给上层。

## Answer

已实现并合并到集成分支 `feat/refactor-v2`（合并提交 `0bbe407`，实现提交 `1dfc2bf` + `a92ceae`）。

### 公共接口

- `reduce(state: GameState, event: GameEvent, rng: Rng) → { state: GameState; effects: Effect[] }`
  - PRNG **在 state 之外**（有状态，放进 state 会破坏「同一状态 + 同一事件 → 同一结果」）。
  - 返回 `{ state, effects }` 而非裸 state：效果队列是规则层**唯一**的对外副作用通道。
- `GameEvent`：`Start` / `Tick` / `Press` / `Release` / `CancelHold` / `Pause` / `Resume` / `Resize` / `SetDifficulty`。
- `Effect` 共 **15 种**：`burst` / `ring` / `slash` / `floater` / `toast` / `lane-flash` /
  `shake-add` / `shake-max` / `shake-set` / `player-flash` / `hurt` / `vibrate` /
  `fever-start` / `fever-end` / `game-over`。
  > `lane-flash` 是任务书表格之外补的一条（旧实现给轨道 DOM 节点加 `hit` class，是真实视觉副作用）。
- `GameState` 共 **28 个字段**（见 `src/game/types.ts`）。
  不在规则层内：`vt`（视觉时钟）、粒子/刀光/冲击环/飘字、`shake`、`playerFlash`、
  `best`（跨局最高分，属 HUD/存储层）。

### 两个 bug 的修复

- **Bug 1** `clearLane()`：`src/game/rules/spawn.ts` —— 轨道占用**只算长按怪**。
  实测（300 秒 × 5 种子 × 三档玩家命中率）：长按怪刷新从 12-15 只 → 14-17 只。
- **Bug 2** `done` / `dead` → 单一 `removed` 标志。
  关键语义保留：长按怪 `escaped` 但**未滑出屏幕**时 `removed` 仍为 `false`
  —— 它依然占用轨道、依然吞掉该轨输入。

### 保真证据

- 134 个单测。含**旧实现差分对照**（`legacy-parity.test.ts`）：把旧 `spawnMonster` / `spawnLong` /
  `spawnPair` / `clearLane` / `speedNow` 原样抄成对照基准，用两个同种子 PRNG 分别喂新旧实现，
  连续 200 次生成逐只比对全部字段。任一方多抽/少抽一次随机会立刻失败。
- **该差分测试当场抓到一个真实保真 bug**：初版 `spawnPair` 用 `{...a}` 派生第二只，
  导致两只共用一次 `wob` 抽样（旧实现 `mk()` 调两次各抽一次）。已修正。
- `random-order.test.ts` 对 `spawnInterval` / `speedNow` / 布局几何做全输入空间逐点对照。

### 行为差异记账

- **D1** `clearLane()` 轨道占用只算长按怪 → 长按怪刷新变频繁。
- **D2** `computeLayout()` 按 `playerR → playerX → hitX` 正确顺序重算。
- **D3** `done` / `dead` → 单一 `removed`。
- **D4** `hasActivePair()` 改用 `removed` 口径。
- 其余差异**全部不可观察**（共 10 条，详见实现报告；要点：已离场怪物滞留到下一 tick 开头才回收，
  但所有判定谓词都跳过 `removed`；`difficulty` 改为由 `now` 推导；`dt` 钳制移进 `tick()`）。

### 遗留

- **整局逐帧 trace 尚未与旧实现对过** —— 这是票 03 要补的核心缺口。
  本票的保真证据止于「生成路径逐点差分 + 纯函数全输入空间差分 + 逐规则函数单测」。
- 规则层**没有**「退出到主菜单」事件（旧 `quitToHome`）—— 票 05 的 UI 自行管理。
