# 战场渲染迁移到 PixiJS v8，React 只负责 DOM UI

原实现用 Canvas 2D 绘制全部战斗内容（`source.html:1455-2500`，约 1200 行程序化矢量绘制）。本次重构把战场迁移到 PixiJS v8（WebGL），React 只负责 HUD、菜单、结算、暂停、竖屏提示等 DOM 界面；**不引入 `@pixi/react`**，战场场景图由代码直接驱动，不经过 React 协调。

**为什么**：全屏后处理（bloom 辉光）在 Canvas 2D 中没有对应实现，`shadowBlur` 只能伪造且代价高昂；Pixi v8 的 `Graphics` API 与现有 Canvas 2D 绘制语义一一对应（`ctx.arc` → `Graphics.circle`、`createRadialGradient` → `FillGradient`），迁移是机械改写而非美术重设计；官方 `pixi-filters` 提供 `advanced-bloom`/`rgb-split`/`shockwave`/`motion-blur` 等后处理滤镜；`pixi.js/particle-container` 为高频粒子提供高性能路径。

**被否决的替代方案**：

- *保留 Canvas 2D* —— 放弃真 bloom，不满足特效目标。
- *Canvas 2D + 自建 WebGL 后处理通道*（把 2D canvas 当纹理喂给 bloom shader）—— 1200 行绘制代码零改动，看似最省；但矢量与文字先被光栅化再上屏，高 DPR 下清晰度受损，且拿不到 `pixi-filters` 全家桶，两层画布合成还有色彩与缩放对齐的隐性成本。
- *react-konva* —— 每次状态变化重建场景树，不适合逐帧刷新的粒子。
- *Three.js + react-three-fiber* —— 3D 化会作废全部绘制代码，越过"1:1 保真"的边界，属于另一件事。
- *`@pixi/react`* —— 每帧走 react-reconciler 协调，与"表现层不触发 React 渲染"的架构冲突，且多拉一个 reconciler 依赖。

**后果**：战场渲染必须抽象成可替换的接口，以便迁移期同时保留 Canvas 2D 与 Pixi 两套实现做 A/B 对照。

**现状**（2026-10）：PixiJS v8 渲染器是**唯一渲染路径**（`src/battlefield/pixi/`）。票 08 完成了默认切换并清退了 Canvas 2D 实现（`src/battlefield/canvas2d/` 已删除，`?renderer=` 分支已移除）；`BattlefieldRenderer` 接口保留，作为未来更换渲染器的抽象边界。本决策的另两条约束也已落地：未引入 `@pixi/react`（战场场景图由代码直接驱动），React 只负责 DOM 界面（`src/app/`）。DPR 上限保持 2 —— 放宽到 3 的收益未经移动端实机验证，而 bloom 是像素成本大户，按 ADR-0004 不做未经验证的改动。
