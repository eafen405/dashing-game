# 06 — PixiJS v8 渲染器：12 个 view 逐个改写

Status: resolved
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


## Answer

已在分支 `feat/ticket-06-pixi-renderer-core` 实现（提交 `80216f1` + `9b53567`），
基线 `feat/refactor-v2`（合并到 `c336528`）。**尚未合并进集成分支**（等父会话接线）。

### 目录

```
src/battlefield/pixi/
  PixiRenderer.ts   BattlefieldRenderer 的 PixiJS v8 实现（基础设施 + 12 个 view 的装配）
  layers.ts         图层顺序 background → rails → defense → entities → glow → floaters
  palette.ts        色彩常量（金 / 双生粉 / 长按绿 / 上轨青 / 下轨橙 / FEVER 两轨）+ hexA
  gfx.ts            v8 的 fill()/stroke() 路径复用陷阱的封装 + 可复用路径工具
  gradient.ts       FillGradient（局部归一化坐标）—— 实例复用，不每帧重建
  textures.ts       星点 / 粒子用的圆点纹理（一次性创建）
  context.ts        每帧复用的 FrameContext（与 canvas2d 版同构）
  math.ts / text.ts 数值与文本工具
  background.ts rails.ts defense-line.ts hit-zone.ts ring.ts floater.ts slash.ts
  particle.ts player.ts monster.ts twin.ts hold-monster.ts frenzy.ts     ← 12 个 view
  __tests__/        三个 seam 的契约测试
scripts/shot-compare.mjs   A/B 并排截图 + 黑屏检测 + 逐像素差异率
scripts/fps-check.mjs      FPS / 帧时挂件读数
```

### 三个 Pixi v8 硬性陷阱（都踩过并解决了）

1. **`fill()` / `stroke()` 不是「结束当前路径」**。
   只有 `fill()` 之后的 `stroke()` 会复用路径；`stroke()` 之后的 `stroke()` 走的是
   「克隆当前路径」分支 —— 而当前路径已被清成一个孤零零的 `moveTo`（退化路径，**画不出来**）。
   解法：**同一形状描边多次时把形状存进可复用的 `GraphicsPath`，每次描边前重新挂一次**
   （`gfx.ts` 的 `attachPath`）。
2. **`ParticleContainer` 从包根导入**（`pixi.js/particle-container` 子路径 strict 下报 TS7016）；
   选项键是 **`dynamicProperties`**（`position` + `vertex` + `color` + `rotation`，`uvs` 保持 false）；
   必须用 `addParticle` / `removeParticle`（`addChild` 抛错）。
3. **每帧零分配**：样式对象、路径对象、容器、文本、粒子全部复用；
   **不得每帧 `new Graphics()`**（每个 view 持有自己的实例，每帧 `clear()` 后重建路径）。

### 其它关键决策

- **`preference: 'webgl'` 显式锁定**（Pixi v8 默认试 WebGPU，`file://` 下黑屏）；
  `backgroundAlpha: 0`（旧版画布透明，背景氛围由 DOM 的 `#tint` / `#vignette` 提供）。
- **`unmount()` 彻底销毁**：`app.destroy({removeView, releaseGlobalResources},
  {children, texture, textureSource, context: true})` —— `context: true` 才销毁 WebGL 上下文。
  渐变纹理不在渲染器的纹理池里，**额外**显式 `destroy()`。
- **渐变用 `FillGradient` 的局部归一化坐标**（`textureSpace: 'local'`）：
  渐变跟着形状走 → 形状动了渐变自动贴合；一个实例可以复用于所有同类形状。
  v8.22 的 `FillGradient` **没有 `update()`**（改 `colorStops` 也不会重建纹理），
  所以逐帧变化的 alpha 改成在 `fill` 的**整体 alpha** 上施加（渐变本体按参考脉冲值烘焙一次）。
- **零高度 / 零宽度的路径不能承载局部渐变**（归一化会除零）——
  旧版那些「1px 水平线」在 Pixi 版改成等面积细矩形（覆盖像素一致）。
- **`stroke()` 不支持虚线**（`StrokeAttributes` 没有 dash）—— 双生锁链的流动虚线
  改成手工按 `[9,8]` 节奏切段。
- 星空用 `Sprite`（不是 `Graphics`）：旧版每帧 30~90 次 `ctx.arc`，
  在 Pixi 里每次圆弧都要细分成多边形；用精灵只改 `x`，GPU 侧合批成 1 次绘制。
- 轨道流动刻度的 alpha 量化成 8 档，同档合并成一次描边（绘制批次少一个数量级）。
- **普通怪与长按怪共用一个 `Graphics`** —— 才能保持旧代码「同一个循环里按类型分派」的交错 z 序。

### 验收（真实输出）

- `typecheck` / `lint` / `test`（29 个文件 / 316 个测试）/ `build` 全绿；
  `node scripts/verify-single-file.mjs` → `✓ 校验通过：产物自包含，file:// 下可运行`
- 产物 `dist/index.html` **906 KB**（gzip 270.5 KB）—— Canvas 2D 版是 293 KB，Pixi 多占 ~610 KB
- **`file://` 下画面正常**：非透明像素占比 canvas2d **29.98%** / Pixi **29.92%**（idle 阶段）
  → **不是黑屏**（黑屏 = 0%）
- 逐像素平均差异率：idle **1.39%** / play **4.70%** / fever **4.79%**
- 并排截图：`/home/eafen405/refactor-notes/shots/06/{canvas2d,pixi}-{idle,play,fx,fever}.png`
- **golden trace 门禁 `npm run trace` 仍然全绿**（渲染层改动不影响规则层 —— 这正是分层的收益）

### 已知限制

- **FEVER 全场氛围（`FrenzyView`）没有并排截图证据** —— 自动打怪攒不到 50 连击
  （长按怪的失败惩罚与空挥都会把 combo 清零），机器人在 ~30s 内就会把玩家打死。
  该 view 的实现与 canvas2d 版逐行对照（同样的 rgba / 渐变 / 描边参数），
  但**只做了代码层核对，没有像素证据**。
- **Pixi 的渐变把「零面积路径」换成了等面积矩形**：轨道主线、背景中线、防线、
  能量刃、竖向光柱。覆盖像素与旧版描边一致，但**端点形状**从圆头变成方头
  （能量刃的枪尖有星光盖住，看不出来）。
- **挥击光幕（`swing` 扇形）的径向渐变**用的是「形状包围盒归一化」，
  峰值落在扇形包围盒中心而不是手臂原点（旧版是绕手臂原点的圆）——
  软光，差异肉眼不可见。
- **长按怪的进度条渐变**：旧版渐变铺满整条槽（`gx → gx+gw`），
  Pixi 版只画已填充的那一段 → 填充段的尾色提前到达轨道色。
- **粒子用 8×8 的圆点纹理缩放**到 1~7px（旧版是硬边 `ctx.arc`）——
  线性过滤下比旧版略软。
- **FPS 读数是在 headless + SwiftShader 软件渲染下测的**（无 GPU）：
  Pixi 41~60 FPS（末值 55），canvas2d 稳定 60 FPS。软件光栅化整屏是 CPU 活，
  这个数字**不能外推到真机**。挂件测的是会话层帧间隔，Pixi 的 GPU 绘制在它自己的
  ticker 里，不计入。
- **没做性能基准套件**（按 ADR-0004）：只留了轻量 FPS / 帧时挂件。
- `pixi-filters` **没有安装**（票 07 的事）；`glow` 层的 `filterArea` /
  粒子容器的 `boundsArea` 已经先立好，票 07 直接挂 bloom 即可。
