# 04 — Canvas 2D 渲染器搬迁

Status: claimed
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
