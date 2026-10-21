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

04a（表现层 + 12 个 Canvas 2D view，合并 `5685c89`）之后，本票由 04b 补完会话层并接线，
新工程现在**真正可玩**（不再依赖 `source.html`）：

- `src/app/GameSession.ts`：持有规则层 `GameState`、种子 PRNG、`PresentationState`、渲染器与
  rAF 循环；`Start / Pause / Resume / Restart / Home / Resize / 输入` 全部经 `reduce()` 转成
  规则层事件。React 不进入 60fps 路径，`FrameView` 每帧复用同一对象。
- 时间语义对齐旧版：`visualTime`（粒子/刀光/冲击环/飘字）始终推进；规则时间只在
  `running`（以及 idle/over 的残留攻击动画）推进；暂停时表现层继续衰减、攻击动画冻结。
- 渲染器接线：构造时 `mount`，`ResizeObserver` + `resize()` 同步 `Layout`，DPR 上限 2；
  `render(frame)` 直接传规则层数组，渲染器跳过已移除怪物；视口晕影走 CSS 变量。
- 输入：`src/input/pointer.ts`（半屏 → 轨道、pointerId 映射、鼠标仅左键）、
  `keyboard.ts`（↑/W、↓/S、P、Enter/Space）、`orientation.ts`（竖屏自动暂停 / 横屏恢复）。
- HUD 快照：`src/presentation/hudStore.ts`，脏检查后仅通知真正变化的字段；
  FEVER 秒数 `Math.ceil` 量化，BEST 取 `max(best, score)`。
- 验证：`npm run typecheck` / `lint` / `test`（180 用例）/ `build` / `verify-single-file`
  全绿；900×460 dsf2 下与旧 `source.html` 并排截图核对 HUD、双轨、角色、判定区、开始/结算层。
  Playwright 实测：开始 → 选 2★ → 游玩（8s 得 2000 分、6 暴击 / 1 普攻）→ 暂停/继续 →
  回主页 → 竖屏暂停/横屏恢复 → 结算 → 重开 → 刷新，均无 pageerror / console error。
- 最高分：得分 300 后自然结算，`localStorage["dualrail_best"]` 写入 `300`，重开与刷新后
  HUD BEST 仍为 300。
- 本票不包含 06+ 的 Pixi 渲染器与 10 的删除 `source.html`；`source.html` 继续作为对照物。
