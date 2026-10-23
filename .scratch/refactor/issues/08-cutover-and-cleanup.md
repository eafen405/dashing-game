# 08 — 收口：默认切 Pixi，删除 Canvas 2D 实现

Status: resolved（实机 60fps 待用户确认）

Blocked by: 05, 07

## 目标

让 Pixi 成为唯一渲染路径，移除过渡期的双实现。

## 要做

1. **默认切 Pixi**：`?renderer=` 参数保留但默认 `pixi`；`canvas2d` 实现在正式发布前保留一个版本，便于回滚。
2. **删除** `src/battlefield/canvas2d/` 与 `?renderer=canvas2d` 分支（见本票验收的"一个版本后再删"）。
3. **清理**：`BattlefieldRenderer` 接口保留（它仍是有效的抽象边界，未来可能换渲染器），但只留一个实现。
4. **DPR 策略定稿**：旧实现 `DPR = Math.min(devicePixelRatio, 2)`（`source.html:540`）。Pixi 侧确认是否可放宽到 3 —— bloom 是像素成本大户，需实测移动端是否掉帧后再定。

## 验收

- 只有一个渲染路径，`dist/` 体积比双实现时下降。
- golden trace 仍然全绿。
- `node scripts/verify-single-file.mjs` 通过。
- 移动端（用户实机）60fps 稳定。

## 备注

- 删掉 Canvas 2D 实现前，`source.html` 也还在，两者可以互为参照。两者都删掉之后就只剩 golden trace 这道防线了 —— 所以删 `source.html`（10 票）之前，golden trace 必须已经稳定跑了一段时间。

## Answer

2026-10-21 完成。改动与验证如下。

### 1. `verify-single-file.mjs` 的 WebGL 假阴性

旧检查用 `drawImage(canvas) → getImageData` 判断画面是否绘制。WebGL 画布默认
`preserveDrawingBuffer: false`，读到空 buffer，切 Pixi 后必误报。

改为**截图差分**：先截画布区域，`visibility: hidden` 隐藏画布后截同一区域，
在页面内用 2D canvas 逐像素比较（RGB 差 > 2 记为不同），差异 > 100 像素即判定「画了东西」。
不碰 `preserveDrawingBuffer`，避免每帧多一次显存拷贝。

### 2. 默认切 Pixi + 删除 Canvas 2D

- `src/App.tsx` 无条件 `createPixiRenderer()`；`?renderer=` 分支与 `RendererKind` 已删除。
- 删除 `src/battlefield/canvas2d/`（24 个文件，含测试）与死工具 `scripts/shot-compare.mjs`。
- `BattlefieldRenderer` 接口保留。
- 顺带把 e2e 脚本里冗余的 `?renderer=pixi` 换成 `?debug`（fx-moments / bloom-ab /
  fx-fever-readability / filter-center-probe），并清理源码 / 文档里指向已删目录的注释。

### 3. DPR

保持上限 2。放宽到 3 的收益未经移动端实机验证，bloom 又是像素成本大户，
按 ADR-0004 不做未经验证的改动；CHANGELOG 已记录「评估过 3，未采纳」。

### 4. 切默认后暴露的两个问题（已修）

- **Pixi 自带 ticker 与 GameSession 循环重复渲染**：`Application` 默认 `autoStart: true`，
  会自己每帧渲染；`GameSession` 也在 rAF 里调 `renderer.render()`。独立 ticker 可能在
  `rails.resize()` 销毁旧渐变之后、下一帧 `draw()` 之前抢先渲染，命中已销毁的纹理，
  竖屏 resize 时抛 `Cannot read properties of null (reading 'style')`。
  改为 `autoStart: false`，由 `PixiRenderer.render()` 末尾显式
  `app.renderer.render(app.stage)` 出帧；同时 `rails.resize()` 不再重建渐变
  （局部归一化渐变与像素尺寸无关）。
- **`verify-single-file.mjs` 残留对已删字段 `result.errors` 的读取**，导致浏览器检查通过后
  仍报 `TypeError: result.errors is not iterable`。已删除该行，页面异常由 `pageerror` 统一收集。

### 验收结果（本机，2026-10-21）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm test` | ✅ 30 个文件 / 360 个测试（canvas2d 测试随实现删除） |
| `npm run build` | ✅ `dist/index.html` **1,068.0 KB**（gzip 318.3 KB）；切换前 1,084.4 KB / 326.7 KB |
| `npm run verify` | ✅ 画面差分 197,122 像素，外部请求 0 |
| `npm run trace` | ✅ 模式 A / B′ 逐帧一致，模式 C 仍为已知 D1 分叉 |
| `npm run test:e2e` | ✅ 六个脚本全过 |
| `npm run format:check` | ✅ |

移动端 60fps 仍需用户实机确认（尤其 bloom 开启 + 多特效同时出现时）。
