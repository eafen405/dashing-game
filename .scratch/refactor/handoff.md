# 交接说明 —— 双轨打怪重构

> 更新时间：2026-10-21
> 集成分支：`feat/refactor-v2`（已同步到 GitHub）
> 规格：[spec.md](spec.md) · 票：[issues/](issues/) · 差异记账：[CHANGELOG.md](../../CHANGELOG.md)

## 一句话现状

**票 01–07 已完成并合入集成分支；票 08（切默认 Pixi）、09（画面打磨）尚未开始；票 10（交付）完成了文档前半，剩余删 `source.html` 与最终验收。**

本次交接只做「已完成部分的收尾」：修掉票 07 数字滚动引入的 e2e 回归、修正过期文档、把 CI 触发接到集成分支，并留下这份说明。**没有启动 08/09/10。**

## 分支与提交

- 集成分支：`feat/refactor-v2`，已推送 `origin`。远端只有 `main` 与它。
- `main` 仍停在初始提交 `d2958e2`（旧版 `source.html` 的存档点），重构成果尚未合并到 `main`。
- 工作方式：每票从集成分支切一个 worktree 分支，完成后 merge 回 `feat/refactor-v2`。
  本机残留的 worktree 在 `/home/eafen405/refactor-wt/`，属于本地资产，**不在 GitHub 上**，接手机器不需要它们。
- 票的完成说明在各票的 `## Answer` 段；08/09/10 还没有 Answer。

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
| 08 | 收口：默认切 Pixi，删 Canvas 2D | ⏸ 未开始（`ready-for-agent`） |
| 09 | 画面打磨：按验收标准调特效 | ⏸ 未开始（`ready-for-agent`） |
| 10 | 交付：删 `source.html`、最终验收 | ◐ 文档前半已完成，其余待做 |

票 10 已完成的部分：README 改写、CHANGELOG、GLOSSARY / ADR 现状核对（提交 `bb2ca5c`，合并于 `43386f2`）。
票 10 剩余：产物体积上限告警、删除 `source.html`、最终验收。

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

## 验证基线（本机，2026-10-21）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm test` | ✅ 31 个文件 / 355 个测试 |
| `npm run build` | ✅ `dist/index.html` **1,084.42 KB**（gzip 326.69 KB） |
| `npm run verify` | ✅ 静态 + `file://` 浏览器检查；0 个外部请求 |
| `npm run trace` | ✅ Golden trace 门禁通过（模式 A / B′ 逐帧一致，模式 C 分叉归因 D1） |
| `npm run test:e2e` | ✅ 六个脚本全过（check-playable / flow-8-steps / input-desktop / portrait-progress / hud-stats / compare-legacy） |
| `npm run format:check` | ✅ |

`test:e2e` 跑的是 `dist/`，**必须先 `npm run build`**；`hud-stats` 单脚本约 70 秒。

## 接下来怎么做

顺序是 **08 → 09 → 10**，依赖关系见各票的 `Blocked by`。

### 票 08 —— 切默认 Pixi

1. **先修一个假阴性**：`scripts/verify-single-file.mjs` 的浏览器检查用
   `drawImage(canvas) → getImageData` 判断「画面画出来了」。WebGL 画布默认
   `preserveDrawingBuffer: false`，这样读到的是空 buffer —— 一旦默认渲染器切成 Pixi，
   `verify` 会误报「未绘制」。建议改用 `page.screenshot()` 统计像素（对 Canvas 2D / WebGL 都成立），
   而不是给 Pixi 开 `preserveDrawingBuffer`（每帧多一次显存拷贝）。
2. `src/App.tsx` 的默认 `renderer` 切成 `pixi`，删除 `?renderer=canvas2d` 分支与
   `src/battlefield/canvas2d/`；`BattlefieldRenderer` 接口保留。
3. DPR：**保持上限 2**（与旧版一致）。放宽到 3 的收益未经移动端实机验证，bloom 又是像素成本大户，
   按 ADR-0004 不做未经验证的改动；在 CHANGELOG 记一句「评估过 3，未采纳」。
4. 同步更新：README（默认渲染器）、ADR-0002 的「现状」段、CHANGELOG、e2e 脚本里冗余的
   `?renderer=pixi`（`fx-moments` 还要跟旧版对照，旧版不带这个参数）。
5. 验收：单一渲染路径、`dist/` 体积下降、`verify` / `trace` / e2e 全绿；移动端 60fps 由用户实机确认。

### 票 09 —— 画面打磨

票 07 已经把 bloom / RGBSplit / Shockwave / 差异化粒子 / 刀光余晖 / 冲击环分档 / 三档震动 / FEVER 火花落地，09 主要是**按四条验收标准调参并出并排截图**。这一票天然需要用户参与实机验收（性能与观感）。

### 票 10 —— 交付

剩余两件事，**动手前先裁决 `source.html` 的去留**：

- `scripts/legacy/patch-legacy.mjs` 在 `npm run trace` 时会读 `source.html` 现场生成
  `legacy-harness-*.html`（这些生成物被 gitignore）。
- `tests/e2e/compare-legacy.mjs`、`tests/e2e/fx-moments.mjs` 也直接打开 `source.html` 做旧版对照。

所以「删除 `source.html`」与「trace / e2e 继续可跑」目前是冲突的。两条路选一条：
保留它作为只读参照物；或者把 legacy harness 固化成可提交的基线、并改写对照脚本的数据源，再删。

## 已知陷阱

- **默认渲染器仍是 Canvas 2D**。所有要验 Pixi 的 e2e 必须显式带 `?renderer=pixi`（如 `bloom-ab.mjs`、`fx-moments.mjs`）。
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
