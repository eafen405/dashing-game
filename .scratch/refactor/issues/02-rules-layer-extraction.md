# 02 — 规则层纯化：剥出 src/game/ 全部纯函数

Status: ready-for-agent
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
