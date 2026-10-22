# 交接说明 —— 双轨打怪重构

> 更新时间：2026-10-21
> 集成分支：`feat/refactor-v2`（已同步到 GitHub）
> 规格：[spec.md](spec.md) · 票：[issues/](issues/) · 差异记账：[CHANGELOG.md](../../CHANGELOG.md)

## 一句话现状

**票 01–10 全部完成（11–17 的实机手感调整也已并入）；只剩用户真机验收 60fps 与长按手感。**

票 08 已把默认渲染路径切到 Pixi、删除 Canvas 2D 实现与 `?renderer=` 分支；
票 09 完成特效调参与可读性回归；票 10 完成体积告警、文档同步与最终验收。
`source.html` 经裁决保留为**只读参照物**（trace / 旧版 e2e 的生成源），不参与构建。
移动端 60fps 仍需用户实机确认。

## 分支与提交

- 集成分支：`feat/refactor-v2`，已推送 `origin`。远端只有 `main` 与它。
- `main` 仍停在初始提交 `d2958e2`（旧版 `source.html` 的存档点），重构成果尚未合并到 `main`。
- 工作方式：每票从集成分支切一个 worktree 分支，完成后 merge 回 `feat/refactor-v2`。
  本机残留的 worktree 在 `/home/eafen405/refactor-wt/`，属于本地资产，**不在 GitHub 上**，接手机器不需要它们。
- 票的完成说明在各票的 `## Answer` 段；01–17 均已有 Answer。

## 票状态

| 票 | 内容 | 状态 |
| --- | --- | --- |
| 01 | 工程基线（ESLint / Prettier / Vitest / CI） | ✅ resolved |
| 02 | 规则层纯化（`src/game/`） | ✅ resolved |
| 03 | Golden trace 保真门禁 | ✅ resolved |
| 04 | Canvas 2D 渲染器搬迁 | ✅ resolved |
| 05 | React UI 层（HUD / 菜单 / 结算 / 竖屏） | ✅ resolved |
| 06 | PixiJS v8 渲染器（12 个 view） | ✅ resolved |
| 07 | bloom + 条件滤镜 + 战斗特效 + UI 动效 | ✅ resolved |
| 08 | 收口：默认切 Pixi，删 Canvas 2D | ✅ resolved（实机 60fps 待用户确认） |
| 09 | 画面打磨：按验收标准调特效 | ✅ resolved（实机观感 / 60fps 待确认） |
| 10 | 交付：`source.html` 裁决、最终验收 | ✅ resolved（`source.html` 按裁决保留为只读参照） |
| 11–17 | 实机手感调整（长按抢输入 / 角色 / 地面 / 重力 / 浏览器菜单 / 2 秒 / 判定框） | ✅ resolved |

票 09 的完成说明见 [issues/09-visual-polish.md](issues/09-visual-polish.md)；
票 10 的完成说明见 [issues/10-delivery-single-file.md](issues/10-delivery-single-file.md)。
`source.html` 未删除：它是 golden trace 的现场生成源与旧版 e2e 的对照对象，
删除需要先冻结两份 114 KB 的 harness，成本高于收益。细节见票 10 Answer。

## 本次收口改了什么

票 07 给分数加了 0.45 秒的滚动动画（Motion 直接写 DOM，不经过 React）。这让票 05 留下的几条 e2e 断言开始偶发失败（读到滚动中间值 / DOM 变更数被动画写撑大）。这些不是产品回归，是测试口径过期：

- `src/app/hud/ScorePanel.tsx`：`#scoreText` 增加 `data-value={score}`（**目标分数**）；显示文本仍是滚动值。
- `tests/e2e/lib/harness.mjs`：`readHud()` 的分数优先读 `data-value`，不再读滚动中的文本。
- `tests/e2e/flow-8-steps.mjs`：暂停前先停自动出刀；冻结基线改在**暂停后**取；恢复后只断言分数（连击可因漏怪合法清零）。
- `tests/e2e/portrait-progress.mjs`：基线改在暂停后取；恢复断言改成「分数不变 / 血量不回升 / 连击不凭空增加」，不再抢 `resize` 事件那一帧。
- `src/app/hud/hudStats.ts`：把 Motion 动画写单独计为 `animatedMutations`（用 `data-motion` 标记），`domMutations` 只统计 React 提交；判据不再被滚动动画污染。
- `tests/e2e/compare-legacy.mjs`：HUD 标签选择器改为 `.stat > span`（排除分数面板内部的 `<motion.span>`）；旧版路径改为仓库相对路径。
- `tests/e2e/fx-moments.mjs`：旧版路径改为仓库相对路径（原先是 `/home/eafen405/...`，CI 上必挂）。
- `CHANGELOG.md` / `spec.md`：D7（FEVER 周身火花）已由票 07 实现，改为「已实现」，不再记成缺口。
- `.github/workflows/ci.yml`：`push` 触发加上 `feat/**` —— 否则集成分支 push 不跑 CI，只能等 PR。
- 全仓 Prettier 对齐（票 07 合并后遗留的格式漂移）。

## 验证基线（本机，2026-10-21，票 10 收口后）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm test` | ✅ 30 个文件 / 360 个测试 |
| `npm run build` | ✅ `dist/index.html` **1,068.16 kB**（gzip 321.92 kB） |
| `npm run verify` | ✅ 静态通过；截图差分 195,173 像素；0 个外部请求；raw 1,043.1 KiB / gzip 311.5 KiB |
| `npm run trace` | ✅ Golden trace 门禁通过（模式 A / B′ 逐帧一致，模式 C 分叉归因 D1；零输入场景一致） |
| `npm run test:e2e` | ✅ 六个脚本全过（check-playable / flow-8-steps / input-desktop / portrait-progress / hud-stats / compare-legacy） |
| `npm run format:check` | ✅ |

`test:e2e` 跑的是 `dist/`，**必须先 `npm run build`**；`hud-stats` 单脚本约 70 秒。
`verify` 的体积告警线为 raw 1,200 KB / gzip 380 KB（只告警不阻断）。

## 接下来怎么做

**没有待实现的票了。** 剩余工作只有用户实机验收：

1. 用手机打开 `dist/index.html`（或交付链接），确认横屏 60fps、bloom / FEVER 观感可接受。
2. 长按怪按住 2 秒，确认浏览器不再弹「标记广告」/ 选词菜单，贯穿手感正常。
3. 若真机掉帧，优先按 ADR-0004 的「结构性优化」排查：bloom resolution / DPR、
   每帧分配、滤镜实例是否被重建；不要加性能基准循环。

票 08 / 09 / 10 的其余验收已在本机闭环，详见各票 `## Answer`。
`source.html` 保留为只读参照物 —— 不要在没有冻结 harness 的前提下删除它。

## 已知陷阱

- **Pixi 的 ticker 已关（`autoStart: false`）**。帧循环由 `GameSession` 驱动，
  出帧在 `PixiRenderer.render()` 末尾显式调用 `app.renderer.render(app.stage)`。
  不要在 `mount()` 里重新打开 ticker —— 会与 GameSession 重复渲染，并可能在
  `resize()` 重建渐变后、下一帧 `draw()` 前抢先渲染到已销毁的纹理。
- **`verify` 用截图差分判断画面**，不再读 WebGL 缓冲区（`preserveDrawingBuffer: false`）。
- **无头 Chromium 在这台机器上没有 WebGL**，Pixi 会回退 Canvas2D，bloom / 色散 / 冲击波被跳过。
  需要真实 WebGL 目检时用 `HEADED=1 xvfb-run -a node tests/e2e/fx-acceptance.mjs`
  （或 `fx-fever-readability` / `bloom-ab` / `fx-moments`）。
  SwiftShader 是软件光栅，FPS 挂件只有 11–13，**不能作为 60fps 证据**。
- **`fx-acceptance.mjs` 是手动的视觉验收脚本**，不在 `test:e2e` 里：它通过 `?debug` 定点注入
  四组效果，产出 `dist/e2e-shots/09/acceptance-09.png`。`npm run build` 会清空 `dist/`，
  所以每次重新构建之后都要再跑一次。
- **分数有 0.45 秒滚动动画**。断言 HUD 数值请读 `#scoreText[data-value]`（`readHud()` 已处理），不要读 `textContent`。
- **`trace` 会重新生成** `scripts/legacy/legacy-harness-*.html`，依赖仓库根的 `source.html`；不要把它当成可随意删除的临时文件。
- **e2e 依赖构建产物**：改了 `src/` 先 `npm run build`，否则跑的是旧 `dist/`。
- **CI 超时 30 分钟**；Playwright 安装 + 六个 e2e 脚本在 CI 上比本机慢。若超时，先看是不是 Chromium 安装或软件渲染拖慢。
- **CI 只在 `main` / `feat/**` 的 push 和 PR 上跑**；新建的分支名如果不在 `feat/**` 下，需要手动 `workflow_dispatch`。
- 规则层改动必须过 `npm run trace`；渲染层 / 表现层改动不应影响它 —— 这正是分层要保护的边界。

## 关键文档

- 规格与验收：[`.scratch/refactor/spec.md`](spec.md)
- 票与完成说明：[`.scratch/refactor/issues/`](issues/)
- 领域词汇：[`GLOSSARY.md`](../../GLOSSARY.md)
- 架构决策：[`docs/adr/`](../../docs/adr/)
- 行为差异与保真门禁：[`CHANGELOG.md`](../../CHANGELOG.md)
- 运行 / 构建 / 命令表：[`README.md`](../../README.md)
