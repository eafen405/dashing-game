# 交接说明 —— 双轨打怪重构

> 更新时间：2026-10-22
> 集成分支：`feat/refactor-v2` @ `cf3051b`（已同步到 GitHub）
> 规格：[spec.md](spec.md) · 票：[issues/](issues/) · 差异记账：[CHANGELOG.md](../../CHANGELOG.md)

## 一句话现状

**票 01–17 的功能全部完成，但 `cf3051b` 的 CI 是红的，且成果还没有合并到 `main`。**
剩余工作不是「再做功能」，而是**收口**：修 CI → 把视觉验收接进门禁 → 合 `main` → 真机签字。

> ⚠️ 上一版交接说明写的「CI 全绿 / 没有待实现的票了」**与事实不符**。
> 核对结果见下节，票 18–22 是据此重新规划的。

## 情况核对（2026-10-22，本机逐条实测）

用户给的参考产物 `dashing-game(1).html` 是**「预期效果」的最新版**，核对结论：

| 核对项 | 结论 |
| --- | --- |
| `dashing-game(1).html` 是什么 | 与 `npm run build` 的产物**逐字节相同**（1,068,167 B）。它就是 `cf3051b` 的构建产物 —— **当前状态已经等于预期效果**，没有待补的画面差距。核对完已于 2026-10-22 移入回收站（产物由构建复现，不需要入库） |
| 它对应哪一版 | `origin/feat/refactor-v2` @ `cf3051b`（票 01–17 全部并入）。本机原先停在 `c7a7bcd`，已快进同步 |
| 里面的判定框位置 | `hitX = playerX + playerR * CLUB_REACH_R`（`CLUB_REACH_R = 3.07`）—— 票 17「判定框挪到棒尖」的实现，与源码一致 |
| CSS / UI 文案 | 与当前源码产物完全一致，无漂移 |
| 本机门禁 | typecheck ✅ · lint ✅ · 单测 30 文件 / 360 测试 ✅ · build ✅ · verify ✅ · trace ✅（11 条结算路径）· `test:e2e` 六个脚本 ✅ |
| **CI（`cf3051b`）** | ❌ **红** —— [run 39773140165](https://github.com/eafen405/dashing-game/actions/runs/39773140165) 的 e2e 步骤失败，`npm run trace` 被跳过。根因见票 18 |
| `main` | 仍停在初始提交 `d2958e2`，**没有任何 PR** —— 票 01–17 的成果只在 `feat/refactor-v2` 上 |
| 「无头 Chromium 没有 WebGL」 | **已过期**。`--enable-unsafe-swiftshader` 之后无头能拿到 WebGL；bloom / 色散 / 冲击波实测全部生效（票 20） |
| 特效验收脚本 | 5 个是**手动**的，不在 CI 里；其中 `hold-monster-keyboard.mjs` **已跑不过**（票 19） |

## 分支与提交

- 集成分支：`feat/refactor-v2` @ `cf3051b`，已推送 `origin`。远端只有 `main` 与它。
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
| 08 | 收口：默认切 Pixi，删 Canvas 2D | ✅ resolved（实机 60fps 待用户确认 → 票 22） |
| 09 | 画面打磨：按验收标准调特效 | ✅ resolved（实机观感 / 60fps 待确认 → 票 22） |
| 10 | 交付：`source.html` 裁决、最终验收 | ✅ resolved（`source.html` 按裁决保留为只读参照） |
| 11–17 | 实机手感调整（长按抢输入 / 角色 / 地面 / 重力 / 浏览器菜单 / 2 秒 / 判定框） | ✅ resolved |
| **18** | **修复 CI 红：`hud-stats` 的隐含帧率断言** | ⏸ ready-for-agent |
| **19** | **修复过期的键盘长按怪脚本** | ⏸ ready-for-agent |
| **20** | **把特效视觉验收接进 CI（5 个脚本）** | ⏸ ready-for-agent |
| **21** | **合并到 `main` + 交付收口** | ⏸ ready-for-agent |
| **22** | **真机验收：60fps / 长按手感 / 浏览器兼容** | ⏸ ready-for-human |

票 09 的完成说明见 [issues/09-visual-polish.md](issues/09-visual-polish.md)；
票 10 的完成说明见 [issues/10-delivery-single-file.md](issues/10-delivery-single-file.md)。
`source.html` 未删除：它是 golden trace 的现场生成源与旧版 e2e 的对照对象，
删除需要先冻结两份 114 KB 的 harness，成本高于收益。细节见票 10 Answer。

## 票 18–22 怎么串起来

```
18（修 CI 红）─┐
19（修长按脚本）┼→ 20（视觉验收进 CI）→ 21（合 main + 交付）→ 22（真机签字）
                ┘
```

18 与 19 可同时开工。21 之前不要合 `main`（CI 红着合不合适）。
22 必须人做 —— SwiftShader 的 11–13 FPS 不是产品性能。

## 上一轮收口改了什么（2026-10-21，票 07 回归修复）

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

## 验证基线（本机，2026-10-22，`cf3051b` 复核）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm run test` | ✅ 30 个文件 / 360 个测试 |
| `npm run build` | ✅ `dist/index.html` **1,068.16 kB**（gzip 321.92 kB）—— 与参考产物 `dashing-game(1).html` **逐字节相同** |
| `npm run verify` | ✅ 静态通过；截图差分 214,158 像素；0 个外部请求；raw 1,043.1 KiB / gzip 311.5 KiB |
| `npm run trace` | ✅ Golden trace 门禁通过（模式 A / B′ 逐帧一致，模式 C 分叉归因 D1；零输入场景一致；11 条结算路径全覆盖） |
| `npm run test:e2e` | ✅ 六个脚本全过（check-playable / flow-8-steps / input-desktop / portrait-progress / hud-stats / compare-legacy） |
| `npm run format:check` | ✅（2026-10-22 清掉仓库根的两个参考 HTML 后恢复绿色） |
| 手动特效脚本 | bloom-ab ✅ · fx-acceptance ✅ · fx-fever-readability ✅ · filter-center-probe ✅ · fx-moments ✅ · **hold-monster-keyboard ❌**（票 19） |
| **GitHub Actions（`cf3051b`）** | ❌ **红** —— e2e 步骤失败，`npm run trace` 被跳过（票 18） |

`test:e2e` 跑的是 `dist/`，**必须先 `npm run build`**；`hud-stats` 单脚本约 70 秒。
`verify` 的体积告警线为 raw 1,200 KB / gzip 380 KB（只告警不阻断）。

## 接下来怎么做

**功能做完了，剩下的是收口。** 顺序：**18 与 20 并行 → 19 → 21 → 22**。

1. **票 18（先做）**：`hud-stats.mjs:134` 的 `publishes > 600` 是一条**隐含帧率断言**。
   CI 的 SwiftShader 只跑到 ~13.7 FPS（30 秒 410 帧），本机 29 FPS（876 帧）——
   判据绑在机器速度上，所以 CI 红。改成结构性判据（循环没冻 + 每帧发布一次），
   绝对下限放到任何环境都够得着的高度。**这正是 ADR-0004 说的「CI 不做性能断言」。**
2. **票 19（可并行）**：`hold-monster-keyboard.mjs` 在票 16 / 17 之后跑不过了
   （长按 3 秒 → 2 秒、判定框挪到棒尖、脚本自己不打普通怪）。
3. **票 20**：把 5 个特效脚本接进 CI（判据都是相对 / 结构性的，能当门禁），
   并把验收拼图作为 artifact 留存（现在跑完就蒸发）。
4. **票 21**：CI 绿了之后开 PR 合 `main`，CHANGELOG 收口，仓库根保持只有 `index.html` / `source.html`。
5. **票 22**：把 `dist/index.html` 交给用户，手机横屏 60fps + 长按 2 秒手感 +
   Firefox / Safari 逐条签字。

若真机掉帧，优先按 ADR-0004 的「结构性优化」排查：bloom resolution / DPR、
每帧分配、滤镜实例是否被重建；不要加性能基准循环。

`source.html` 保留为只读参照物 —— 不要在没有冻结 harness 的前提下删除它。

## 已知陷阱

- **Pixi 的 ticker 已关（`autoStart: false`）**。帧循环由 `GameSession` 驱动，
  出帧在 `PixiRenderer.render()` 末尾显式调用 `app.renderer.render(app.stage)`。
  不要在 `mount()` 里重新打开 ticker —— 会与 GameSession 重复渲染，并可能在
  `resize()` 重建渐变后、下一帧 `draw()` 前抢先渲染到已销毁的纹理。
- **`verify` 用截图差分判断画面**，不再读 WebGL 缓冲区（`preserveDrawingBuffer: false`）。
- **（2026-10-22 更正）「无头 Chromium 没有 WebGL」已不成立**。
  `scripts/browser.mjs` 的 `CHROMIUM_ARGS` 带 `--enable-unsafe-swiftshader`，
  Chromium 实际跑在 `--use-angle=swiftshader-webgl` 上，无头**能拿到 WebGL** ——
  bloom / 色散 / 冲击波实测全部生效，`fx-acceptance.mjs` 无头直接跑通。
  `HEADED=1 xvfb-run` 那套可以不用了。
  SwiftShader 是软件光栅，FPS 挂件只有 11–13，**不能作为 60fps 证据**。
- **`fx-acceptance.mjs` 等 5 个特效脚本是手动的**，不在 `test:e2e` 里：
  它通过 `?debug` 定点注入四组效果，产出 `dist/e2e-shots/09/acceptance-09.png`。
  `npm run build` 会清空 `dist/`，所以每次重新构建之后都要再跑一次；票 20 会把它们接进 CI。
- **`hold-monster-keyboard.mjs` 现在跑不过**（票 16 / 17 之后过期）—— 修法见票 19。
- **分数有 0.45 秒滚动动画**。断言 HUD 数值请读 `#scoreText[data-value]`（`readHud()` 已处理），不要读 `textContent`。
- **`trace` 会重新生成** `scripts/legacy/legacy-harness-*.html`，依赖仓库根的 `source.html`；不要把它当成可随意删除的临时文件。
- **e2e 依赖构建产物**：改了 `src/` 先 `npm run build`，否则跑的是旧 `dist/`。
- **CI 超时 30 分钟**；Playwright 安装 + e2e 脚本在 CI 上比本机慢（软件光栅只有 ~13.7 FPS）。
  若超时，先看是不是 Chromium 安装或软件渲染拖慢。
- **CI 只在 `main` / `feat/**` 的 push 和 PR 上跑**；新建的分支名如果不在 `feat/**` 下，需要手动 `workflow_dispatch`。
- 规则层改动必须过 `npm run trace`；渲染层 / 表现层改动不应影响它 —— 这正是分层要保护的边界。

## 关键文档

- 规格与验收：[`.scratch/refactor/spec.md`](spec.md)
- 票与完成说明：[`.scratch/refactor/issues/`](issues/)
- 领域词汇：[`GLOSSARY.md`](../../GLOSSARY.md)
- 架构决策：[`docs/adr/`](../../docs/adr/)
- 行为差异与保真门禁：[`CHANGELOG.md`](../../CHANGELOG.md)
- 运行 / 构建 / 命令表：[`README.md`](../../README.md)
