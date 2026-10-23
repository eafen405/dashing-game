# 04 — Canvas 2D 渲染器搬迁

Status: resolved
Blocked by: 02

## 目标

把 `source.html:1455-2500`（约 1200 行）的绘制代码搬进新工程，作为 `BattlefieldRenderer` 接口的 Canvas 2D 实现。这一票结束时，**新工程完全可玩，且行为与旧版逐帧一致**。

## 要做

1. **定义接口** `src/battlefield/types.ts`：
   ```ts
   interface BattlefieldRenderer {
     mount(host: HTMLElement): void | Promise<void>;
     unmount(): void;
     resize(layout: Layout): void;
     render(frame: FrameView): void;
   }
   ```
   `FrameView` = 规则层只读快照 + 表现层状态。

2. **搬绘制代码**到 `src/battlefield/canvas2d/`：
   - `BackgroundView`（星空 `bgStars`）
   - `RailsView`（轨道渐变带 + 流动刻度）
   - `DefenseLineView`
   - `HitZoneView`（判定区 + 暴击区 + 脉冲 + 文字）
   - `PlayerView`（`drawPlayer` / `drawLegs` / `drawTorso` / `drawHead` / `drawSwordArm`）
   - `MonsterView`（普通怪）
   - `TwinView`（双生 + 锁链 `drawPairLinks`）
   - `HoldMonsterView`（长按怪）
   - `SlashView` / `ParticleView` / `RingView` / `FloaterView`

3. **表现层** `src/presentation/`：`effects.ts`（粒子 / 刀光 / 冲击环 / 飘字）、`shake.ts`。用**对象池 + swap-remove**，不做 `filter` / `splice`。

4. **布局接线**：`resize` 改为监听 `ResizeObserver`（旧代码只有 `window.resize` + 3 个 `setTimeout` 兜底，且 `setTimeout` 从不清理 —— `source.html:517-519`）。

## 硬性约束（性能，见 ADR-0004）

- **禁止 O(n²)**：旧代码 `source.html:1989` 在怪物绘制循环内 `monsters.indexOf` —— 改为预建 `Map<Monster, index>` 或在模型层维护索引。
- **禁止每帧全量 `some` 扫描**：旧代码 `source.html:1633` 每帧每轨各扫一次 —— 改为规则层维护"每轨最近目标"索引。
- **禁止用 `filter` 重建数组**：旧代码有 7 处（`source.html:978` 等）—— 统一改为就地移除。
- **禁止每帧分配**：`render()` 内不得 `new` 图形对象；Graphics 实例复用 + `clear()`。
- **静态内容不每帧重绘**：星空与轨道只在 resize 时重建。

## 验收

- 新工程（`npm run dev`）可玩，规则层与旧版行为逐帧一致（由 03 的 golden trace 兜底）。
- 画面与旧 `source.html` 视觉一致（人工并排对比截图）。
- 开发期 FPS 挂件显示稳定 60。

## 备注

- 这一票是**故意的中间态**：多花约 1.5 天换来"每个阶段结束都有可玩且可对照的版本"，后面 06/07 出问题时能立刻二分定位是架构问题还是渲染问题。
- Canvas 2D 实现在 08 票会被删除。

## Answer

已实现并合并到集成分支 `feat/refactor-v2`。本票被拆成两个并行子任务实现，
再由父会话接线合并：

- **票 04a**（`98d3303` / 合并 `5685c89`）—— 表现层效果池 + Canvas 2D 渲染器（12 个 view）
- **票 04b**（`f047aab` → `19cbc09` / 合并 `be38098`）—— 会话层 + 输入层 + HUD/界面层
- **接线**（`192d1a4`）—— `src/battlefield/types.ts` 的 `BattlefieldRenderer` / `FrameView` 契约

### 目录

```
src/battlefield/
  types.ts              BattlefieldRenderer / FrameView 契约
  canvas2d/             background / rails / defense-line / hit-zone / player /
                        monster / twin / hold-monster / slash / ring / particle /
                        floater / frenzy / paths / lane-color / math / context / renderer
src/presentation/       效果池（对象池 + swap-remove）、震动、PresentationState
src/app/                GameSession / screenMachine / hud/ / screens/ / best.ts / presentation.ts
src/input/              pointer / keyboard / orientation / mapping
tests/e2e/              Playwright 可玩性检查
```

### 四个结构性热点的修法

| 热点 | 旧位置 | 修法 |
|---|---|---|
| O(n²) 的 `monsters.indexOf` | `source.html:1989` | 预建索引，绘制循环内零查找 |
| 每帧每轨的 `monsters.some` 扫描 | `source.html:1633` | 维护「每轨最近目标」索引 |
| 7 处 `filter` 重建 `monsters` | `978`/`1024`/`1046`/`1188`/`1229`/`1325`/`1370` | 统一就地移除（swap-remove） |
| 每帧数组字面量分配 | 绘制循环 | 预分配 + 复用，渲染路径零分配 |

静态内容（星空 / 轨道渐变）**只在 `resize` 时重建**。

### 双时钟语义（照抄旧实现）

- `now` 只在 running 阶段推进；`visualTime`（旧 `vt`）**在所有阶段都推进**
- `paused` 时 `attackT` **不**衰减，但粒子/环/刀光/飘字**继续**衰减
- `pause()` **不**重置 `lastT`，只有 `resume()` 重置（旧 `source.html:690-698`）

### 验收

- 297 个测试全绿（`typecheck` / `lint` / `test` / `build` / `verify-single-file`）
- 产物 `dist/index.html` **293 KB**（gzip 91.7 KB），`file://` 下可运行、画布有内容
- 端到端 Playwright：开始 → 出刀 → 受击 → 竖屏自动暂停 → 转横屏自动恢复，全链路通
- 黄金轨迹门禁 `npm run trace` 仍然全绿（渲染层改动不影响规则层 —— 这正是分层的收益）

### 过程中发现并修掉的真 bug

指针输入原本挂在画布宿主（`.canvas-host`）上，而开始/暂停/结算遮罩是它的兄弟节点
→ 遮罩点击永远收不到，「点击屏幕开始」无效。已改为挂在 `.stage` 上（与旧代码 `#stage` 一致）。

### 已知限制

- **FEVER 期间角色周身的金色火花**（旧 `emitFrenzy`，`source.html:1238-1254`）没实现 ——
  属表现层，留给票 07。
- 旧代码 `setTimeout(resize, 70/260)` 的兜底没搬（改用 `ResizeObserver`）。
- `hudStore` 放在 `src/app/hud/hudStore.ts`（不是 `src/presentation/`）——
  因为 04a 已占用 `src/presentation/`，避免冲突。
- 固定种子 `DEFAULT_SEED = 20240601`，每局完全一样（可复现/对照）；旧版是 `Math.random()`。
