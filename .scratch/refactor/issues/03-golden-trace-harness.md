# 03 — 保真门禁：golden trace 逐帧对照

Status: claimed
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
