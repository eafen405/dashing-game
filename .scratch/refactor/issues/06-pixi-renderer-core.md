# 06 — PixiJS v8 渲染器：12 个 view 逐个改写

Status: ready-for-agent
Blocked by: 04

## 目标

用 PixiJS v8 重新实现战场渲染，产出 `BattlefieldRenderer` 的第二个实现。这是画面翻新验收项的主体。

## 要做

1. **基础设施** `src/battlefield/pixi/`：
   - `PixiRenderer.ts` —— `Application.init({ preference: 'webgl', ... })`。**必须显式锁 webgl**：Pixi v8 默认会尝试 WebGPU，而 WebGPU 对非安全上下文更挑剔，`file://` 打开会黑屏（Phase 0 已验证 `preference: 'webgl'` 在 `file://` 下正常）。
   - `layers.ts` —— 图层顺序（自底向上）：`background` → `rails` → `defense` → `entities` → `glow` → `floaters`。
   - `palette.ts` —— 色彩常量，与 `GLOSSARY.md` 的语义对应：金 `#ffd24a` = 得分，粉 `#ff5ecb` = 双生，绿 `#a6ff5e` = 长按怪，青 `#4fd1ff` = 上轨，橙 `#ff8a4f` = 下轨。**不得改这套配色**（ADR-0001 附带决定：保持赛博霓虹）。

2. **12 个 view** 逐个从 Canvas 2D 版本改写，顺序按"风险从低到高"：
   `BackgroundView` → `RailsView` → `DefenseLineView` → `HitZoneView` → `RingView` → `FloaterView` → `SlashView` → `ParticleView` → `PlayerView` → `MonsterView` → `TwinView` → `HoldMonsterView`

   API 映射：`ctx.arc` → `Graphics.circle`；`ctx.fill()` → `Graphics.fill(color)`；`ctx.stroke()` → `Graphics.stroke({ width, color })`；`createRadialGradient` → `FillGradient`；`ctx.fillText` → `Text`。

3. **A/B 对照**：用 `?renderer=canvas2d|pixi` 切换，两套实现并存，逐 view 比对截图。

4. **换掉 `ParticleView` 的实现**：用 `pixi.js/particle-container` 承载高频粒子（见 07）。

## 硬性约束（性能）

- **复用 `Graphics` 实例**：每个 view 持有一个 `Graphics`，每帧 `clear()` 后重建路径，**不得每帧 `new Graphics()`**。
- **静态图层只在 resize 时重建**：星空、轨道、防线不每帧重画。
- **每帧零分配**：渲染路径上不得创建临时对象（数组、闭包、`{x, y}` 字面量）。
- **`ParticleContainer`** 用于粒子，粒子上限 260 与旧实现一致。

## 验收

- `?renderer=pixi` 与 `?renderer=canvas2d` 并排截图**无视觉回归**（逐 view 比对）。
- golden trace 仍然全绿（渲染层改动不应影响规则层 —— 这正是分层的收益）。
- 开发期 FPS 挂件在 60fps 稳定。

## 备注

- Pixi v8 的 `Graphics` API 与 v7 差异较大（路径构建方式、渐变），照着 v8 文档写，不要照抄 v7 示例。
- `RendererType` 是**数值枚举**（WEBGL=1, WEBGPU=2, CANVAS=4），判断渲染器类型别拿字符串比。
