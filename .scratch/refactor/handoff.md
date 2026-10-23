# 交接说明 —— 双轨打怪重构

> 更新时间：2026-10-22
> 集成分支：`feat/refactor-v2` @ `5719125`（票 01–21 已合入，**已推送**）
> PR 分支：`feat/merge-to-main-0.2.0`（同一 tip，专门用来开 PR 到 `main`）
> 本轮：**`feat/review-fixes`**（两轴代码评审的收口修复，基线 `a5826fa`；
> **PR 与合并由编排者执行**）
> 规格：[spec.md](spec.md) · 票：[issues/](issues/) · 差异记账：[CHANGELOG.md](../../CHANGELOG.md)

## 一句话现状

**票 01–21 全部完成；本轮把两轴评审的 13 条发现收掉了；剩下的仍然只有票 22（真机签字）。**
票 21 的文档收口（CHANGELOG / README / GLOSSARY / ADR）已做完，
本轮又补了 ADR-0005（端到端测试的「非目标反转」）与 D1 的真实状态重写，
**开 PR 与合并由编排者执行**（本轮不推送、不开 PR）；
再往后只剩票 22 —— 真机验收，必须人做。

> ⚠️ 上一版交接说明写的「CI 全绿 / 没有待实现的票了」**与事实不符**，
> 核对结果见下节，票 18–22 是据此重新规划的（18 / 19 / 20 已按这个规划完成）。

## 情况核对（2026-10-22，本机逐条实测）

用户给的参考产物 `dashing-game(1).html` 是**「预期效果」的最新版**，核对结论：

| 核对项 | 结论 |
| --- | --- |
| `dashing-game(1).html` 是什么 | 在**票 21 收口时**与 `npm run build` 的产物**逐字节相同**（1,068,167 B）。⚠️ **评审收口那轮之后不再逐字节相同**（1,068,487 B，差 320 B）—— 爆散签名常量搬进规则层、删掉了一个从未被引入的样式表，打包结果自然不同。**行为没变**（golden trace 逐帧一致 · 360 个单测全绿 · 验收拼图不变）。核对完已于 2026-10-22 移入回收站（产物由构建复现，不需要入库；`.gitignore` 已挡住同名文件回流） |
| 它对应哪一版 | `feat/refactor-v2` @ `5719125`（票 01–21 全部并入，**已推送**；PR 走 `feat/merge-to-main-0.2.0`） |
| 里面的判定框位置 | `hitX = playerX + playerR * CLUB_REACH_R`（`CLUB_REACH_R = 3.07`）—— 票 17「判定框挪到棒尖」的实现，与源码一致 |
| CSS / UI 文案 | 与当前源码产物完全一致，无漂移 |
| 本机门禁 | typecheck ✅ · lint ✅ · 单测 30 文件 / 360 测试 ✅ · build ✅ · verify ✅ · trace ✅（11 条结算路径）· `test:e2e` 六个脚本 ✅ · `test:visual` 六个脚本 ✅ |
| **CI（`cf3051b`）** | ✅ **verify 已绿** —— 票 18 修完并合入后，PR #1 上 `verify` job **7m06s 全绿**（含 `npm run trace`，不再被跳过）。`visual` job 第一次跑红在 `fx-moments` 的**并排图合成**（CI 2 核 runner 上，合成页面跟两个带 bloom 的 WebGL 页面抢资源）—— 已改成「游戏阶段拍单图 → 关掉游戏浏览器 → 单独一个浏览器合成」，见票 20 补记 |
| `main` | 仍停在初始提交 `d2958e2` —— PR 从 `feat/merge-to-main-0.2.0` 发出，合并由编排者执行 |
| 「无头 Chromium 没有 WebGL」 | **已过期**。`--enable-unsafe-swiftshader` 之后无头能拿到 WebGL；bloom / 色散 / 冲击波实测全部生效（票 20） |
| 特效验收脚本 | 5 个特效脚本 + 键盘长按怪已接进 CI（`npm run test:visual`，票 20），验收拼图作为 artifact 留档 |

## 分支与提交

- 集成分支：`feat/refactor-v2` @ `5719125`（**已推送**，`cf3051b..5719125` 快进）。
- PR 分支：`feat/merge-to-main-0.2.0`（同一 tip，**已推送**）——
  专门开 PR 到 `main` 用，**不**与别人的推送抢同一条分支。
  远端目前是 `main` + `feat/refactor-v2` + `feat/merge-to-main-0.2.0`。
- `main` 仍停在初始提交 `d2958e2`（旧版 `source.html` 的存档点），重构成果尚未合并到 `main`。
- 本轮分支：`feat/review-fixes`（本机 worktree 在 `refactor-wt/23-review-fixes`）——
  它只做**评审收口**：改文档里的**不实陈述**、删死代码、去重复。
  **不推送、不开 PR、不合并 `main`**（那是编排者在用户确认后做的事）。
- 工作方式：每票从集成分支切一个 worktree 分支，完成后 merge 回 `feat/refactor-v2`。
  本机残留的 worktree 属于**本地资产**，**不在 GitHub 上**，接手机器不需要它们。
- 票的完成说明在各票的 `## Answer` 段；01–21 均已有 Answer。

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
| **18** | **修复 CI 红：`hud-stats` 的隐含帧率断言** | ✅ resolved |
| **19** | **修复过期的键盘长按怪脚本** | ✅ resolved |
| **20** | **把特效视觉验收接进 CI（5 个脚本）** | ✅ resolved（验收拼图作为 artifact 留档） |
| **21** | **合并到 `main` + 交付收口** | ✅ resolved（文档收口已完成；**PR 与合并由编排者执行**） |
| **22** | **真机验收：60fps / 长按手感 / 浏览器兼容** | ⏸ ready-for-human（本轮已改成「当前状态 + 5 条待签字」；`dist/index.html` 已就绪） |
| — | **两轴代码评审的收口**（`feat/review-fixes`） | ✅ 本轮完成：13 条发现全部收掉（7 条真相修正 + 4 条代码清理 + 2 条文档补记）；**不推送、不开 PR、不合并 `main`** |

票 09 的完成说明见 [issues/09-visual-polish.md](issues/09-visual-polish.md)；
票 10 的完成说明见 [issues/10-delivery-single-file.md](issues/10-delivery-single-file.md)；
票 21 的完成说明见 [issues/21-merge-to-main-and-deliver.md](issues/21-merge-to-main-and-deliver.md)。
`source.html` 未删除：它是 golden trace 的现场生成源与旧版 e2e 的对照对象，
删除需要先冻结两份 114 KB 的 harness，成本高于收益。细节见票 10 Answer。

## 票 18–22 怎么串起来

```
18（修 CI 红）─┐
19（修长按脚本）┼→ 20（视觉验收进 CI）→ 21（合 main + 交付）→ 22（真机签字）
                ┘
```

18 / 19 / 20 已完成并合进 `feat/refactor-v2`（@ `a5826fa`）。
21 的**文档收口**已完成，**开 PR / 合并 `main` 留给编排者**（票 21 本身不推送）。
两轴评审的收口（`feat/review-fixes`）也已完成 —— 它只改文档里的不实陈述与死代码，
**不改变任何游戏行为**（golden trace 逐帧结果与基线完全一致）。
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

## 本轮改了什么（2026-10-22，两轴代码评审的收口，`feat/review-fixes`）

评审分**两条轴**：一条看「文档说的是不是真的」，一条看「代码干不干净」。
两条轴都提了同一个东西 —— **D1 的账记错了**。本轮把两轴的发现全部收掉。

### 真相修正（文档，零行为变化）

- **D1 按票 11 回退后的真实状态重写**（`spec.md` / `CHANGELOG.md` / 票 02 / 票 03）。
  票 11 把「只算长按怪占用」的修法从**生产路径**撤回了 ——
  生产路径今天的语义与旧版**完全相同**（`legacyClearLane` 默认 `false`），
  所以 **D1 不再是玩家能察觉到的差异**。
  D1 的修法现在只作为 golden trace 的**对照变体**活着（回放器的模式 A / C 打开它）。
  连带改了 `CHANGELOG.md` 的**模式表**与 `scripts/trace-gate.mjs` 的表头 ——
  三个模式都是「同一条规则线的两个变体」之间的比较，**不是**「旧版 vs 新生产」。
- **D1 的验证方式改成实测值**：模式 C 的第一处分叉落在**长按怪生成时机**那一帧，
  `rulesDraws` 的差值**小且随种子而变**（实测 1★ 是 2 / 1 / 1，2★ 也是 2 / 1 / 1），
  原文写的「恰好是 1」是错的。
- **性能约束那条改写**：`filter` 重建 `monsters` 数组是**渲染路径**上的 7 处，已全部消除；
  规则层每 tick **一处**回收是**有意为之**（记在「不可观察的差异」第 1 条），不是没改完的残留。
- **spec 目录结构对齐真实树**（`hudStore` 在 `app/hud/`；`styles.css` 是单文件；
  `game/` 与 `battlefield/pixi/` 的子目录补全）。
- **spec 非目标 5 反转**：端到端测试在收口阶段（票 05 / 18 / 19 / 20）补上 ——
  记在**新增的 ADR-0005**，并从 spec 的架构决策表与 README 的约定文档节链过去。
- **GLOSSARY「已知用词偏差」补记 4 条**：`COMBO`（连击）、`漏掉了`（漏怪）、
  `双生敌人`（双生）三条玩家可见文案，外加内部标识符家族 `lane`（轨道）。
- **`legacy-patch-spec.md` 入库**（`scripts/legacy/legacy-patch-spec.md`）——
  原文写在仓库外，被 6 个文件引用，仓库克隆出来复现不了 golden trace harness。
  连带清掉**所有**跟踪文件里的 `/home/eafen405/...` 绝对路径。
- **票 22 改成「当前状态 + 5 条待签字」**，`Status: ready-for-human` 保持不变
  （真机验收机器代替不了）。

### 代码清理（行为不变）

- **`laneColorOf` 去重**：原先 `game/rules/resolve.ts` 与 `battlefield/pixi/palette.ts`
  各有一份**逐字节相同**的拷贝。实现统一落在 `game/constants.ts`（规则层的常量层），
  战场层照旧从 `./palette` 取 —— 符合 ADR-0003 的分层方向。
- **全屏逻辑归位**：`src/app/fullscreen.ts` 之前**没有任何 importer**，
  `App.tsx` 却自己又写了一份。现在 App.tsx 用模块，模块是唯一实现。
- **爆散签名归位**：`src/presentation/fx.ts` 之前用 `CRIT_POWER = 1.45` /
  `SINGLE_CRIT_COUNT = 36` 这类魔数**反推**规则层的「这是不是暴击 / 双生」，
  测试里还另抄了一份。签名词表现在住在规则层（`game/effects.ts` 的 `BURST`），
  表现层与测试都从那儿取 —— **数值一个没改**，画面不变。
- **删掉 `src/app/app.css`**（720 行）：它**从未被 import**（`main.tsx` 只引 `styles.css`），
  类名是上一轮迭代的旧词表（`.dual-app` / `.icon-btn` / `.lane-zone` …）。
  逐条比对过：它与 `styles.css` 同名的那些规则**都是旧版定义**
  （例如 `.toast` 少了 `opacity: 0`、`.game` 少了 `display: none`）——
  就算接进去也会**覆盖**现行样式，所以是删，不是接。
- **`scripts/fps-check.mjs` 去掉 `?renderer=`**（票 08 已删那个分支），
  保留为开发期观察工具（ADR-0004：不做 CI 性能断言），并在文件头写清这一点。
- **`Monster['kind']` 判定收拢**（P2）：新增 `game/kinds.ts` 的 `isHoldMonster` /
  `isTwinMonster`，用在 `rules/spawn.ts` 与 `rules/strike.ts` 的 6 处**纯类别判定**上。
  剩余散点见「已知陷阱」。

## 验证基线（本机，2026-10-22，票 21 收口后复核，基线 `e46d4ae`）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | ✅（本票复跑） |
| `npm run lint` | ✅（本票复跑） |
| `npm run test` | ✅ 30 个文件 / 360 个测试（本票复跑） |
| `npm run build` | ✅ `dist/index.html` **1,068.16 kB**（gzip 321.92 kB）（本票复跑）—— 与参考产物 `dashing-game(1).html` **逐字节相同** |
| `npm run format:check` | ✅（本票复跑，干净工作区）—— 仓库根只有 `index.html` / `source.html`，`.gitignore` 已挡住参考产物回流 |
| `npm run trace` | ✅ Golden trace 门禁通过（本票复跑）：模式 A / B′ 逐帧一致，模式 C 分叉归因 D1，零输入场景一致，11 条结算路径全覆盖 |
| `npm run verify` | ✅ 静态通过；截图差分 214,158 像素；0 个外部请求（票 20 复核；本票未改构建产物） |
| `npm run test:e2e` | ✅ 六个脚本全过（票 20 复核；本票只改文档，未动脚本） |
| `npm run test:visual` | ✅ 六个脚本全过（票 20 复核；同上） |
| **GitHub Actions（`cf3051b`）** | ❌ **红**（历史记录）—— e2e 步骤失败，`npm run trace` 被跳过；票 18 已修并合入集成分支，**待编排者开 PR 后由 Actions 复跑确认** |

`test:e2e` / `test:visual` 跑的都是 `dist/`，**必须先 `npm run build`**；
`hud-stats` 单脚本约 70 秒；`test:visual` 整套本机 **3.5–8 分钟**
（两次实测 208s / 473s，差在 `fx-moments` 有没有跑满 900 轮）。
`verify` 的体积告警线为 raw 1,200 KB / gzip 380 KB（只告警不阻断）。

### 本轮复核（2026-10-22，`feat/review-fixes`，基线 `a5826fa`）

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm run format:check` | ✅ |
| `npm test` | ✅ 30 个文件 / **360 个测试**（一个没改 —— 测试的期望值改成从规则层取，断言本身没动） |
| `npm run build` | ✅ `dist/index.html` **1,068,487 B**（gzip 322.02 kB）—— 比票 21 的基线大 320 B（爆散签名搬进规则层 + 删掉一个从未被引入的样式表），**不再与参考产物 `dashing-game(1).html` 逐字节相同**；产物仍是单文件、`file://` 下可运行 |
| `npm run trace` | ✅ Golden trace 门禁通过 —— 模式 A / B′ 逐帧一致，模式 C 分叉归因 D1（第一处分叉的 `rulesDraws` 差值 1★ 是 2 / 1 / 1，2★ 是 2 / 1 / 1），零输入场景一致，11 条结算路径全覆盖 |
| `npm run test:e2e` | ✅ 六个脚本全过 |
| `npm run test:visual` | ✅ 六个脚本全过（验收拼图 `dist/e2e-shots/09/acceptance-09.png` 照常产出） |

**行为未变**：本轮没有改任何规则逻辑 —— golden trace 的逐帧结果与基线**完全一致**。

## 接下来怎么做

**功能做完了，剩下的是合 `main` 与真机签字。**
顺序：**18 / 19 / 20 / 21 / 评审收口 已完成 → 开 PR 合 `main` → 22**。

1. ~~**票 18**：修 `hud-stats.mjs` 的隐含帧率断言。~~ ✅ 已完成
   （判据改成结构性判据：循环没冻 + 每帧发布一次，绝对下限压到 1fps 量级）。
2. ~~**票 19**：修过期的键盘长按怪脚本。~~ ✅ 已完成
   （时长 / toast 文案从源码读，盯画面等头进圈，等待期用指针清普通怪）。
3. ~~**票 20**：把 5 个特效脚本接进 CI。~~ ✅ 已完成
   （`npm run test:visual` 接进 CI 的 `visual` job，与 `verify` 并行；
   验收拼图 `dist/e2e-shots/09/acceptance-09.png` 作为 artifact
   `visual-acceptance-shots` 留档）。
4. ~~**票 21**：合并到 `main` + 交付收口。~~ ✅ **文档收口已完成**
   （CHANGELOG `[0.2.0]` 收口、README 首屏对齐当前玩法、`source.html` 定位写清、
   参考产物不入库、GLOSSARY / ADR / spec / 交接说明同步）。
   **剩下的开 PR 与合并 `main` 由编排者执行** —— 票 21 本身不推送、不开 PR。
5. ~~**评审收口**（`feat/review-fixes`）：两轴评审的 13 条发现。~~ ✅ **本轮完成**
   （7 条真相修正 + 4 条代码清理 + 2 条文档补记；**不改变游戏行为**，
   golden trace 与 360 个单测照旧全绿）。
6. **票 22（唯一剩下的）**：把 `dist/index.html` 交给用户，手机横屏 60fps + 长按 2 秒手感 +
   棒尖够得到怪 + 棒尖判定框 + Firefox / Safari 逐条签字（5 条）。

若真机掉帧，优先按 ADR-0004 的「结构性优化」排查：bloom resolution / DPR、
每帧分配、滤镜实例是否被重建；不要加性能基准循环。

`source.html` 保留为只读参照物 —— 不要在没有冻结 harness 的前提下删除它。

## 已知陷阱

- **仓库根只保留 `index.html` / `source.html` 两个 HTML**（票 21）。参考产物
  `dashing-game(1).html` / `pelican-bicycle.html` 已于 2026-10-22 移出，
  `.gitignore` 里加了根锚定的两条忽略规则挡它们回流 —— **Prettier 3 会读 `.gitignore`**，
  它们躺在根目录会让 `npm run format:check` 变红。
  `source.html` **不要删**：它是 golden trace 的生成源与旧版 e2e 的对照对象。
- **Pixi 的 ticker 已关（`autoStart: false`）**。帧循环由 `GameSession` 驱动，
  出帧在 `PixiRenderer.render()` 末尾显式调用 `app.renderer.render(app.stage)`。
  不要在 `mount()` 里重新打开 ticker —— 会与 GameSession 重复渲染，并可能在
  `resize()` 重建渐变后、下一帧 `draw()` 前抢先渲染到已销毁的纹理。
- **`verify` 用截图差分判断画面**，不再读 WebGL 缓冲区（`preserveDrawingBuffer: false`）。
- **（2026-10-22 更正）「无头 Chromium 没有 WebGL」已不成立**。
  `scripts/browser.mjs` 的 `CHROMIUM_ARGS` 带 `--enable-unsafe-swiftshader`，
  Chromium 实际跑在 `--use-angle=swiftshader-webgl` 上，无头**能拿到 WebGL** ——
  bloom / 色散 / 冲击波实测全部生效，`fx-acceptance.mjs` 无头直接跑通。
  `HEADED=1 xvfb-run` 那套可以不用了（`HEADED=1` 开关仍在，留给本地人眼看窗口）。
  SwiftShader 是软件光栅，FPS 挂件只有 11–13，**不能作为 60fps 证据**。
- **5 个特效脚本不再是手动的**（票 20）：现在跑 `npm run test:visual`，
  CI 里是**独立一个 job**（`visual`，和 `verify` 并行，失败即红），
  跑完把 `dist/e2e-shots/` 作为 artifact `visual-acceptance-shots` 上传
  （`if: always()`，红了也留证据）。
  `fx-acceptance.mjs` 通过 `?debug` 定点注入四组效果，产出
  `dist/e2e-shots/09/acceptance-09.png`（artifact 里是 `09/acceptance-09.png`）。
  `npm run build` 会清空 `dist/`，所以每次重新构建之后都要再跑一次。
- **特效脚本是 6 个不是 5 个**：`test:visual` 里除 5 个特效脚本外还有
  `hold-monster-keyboard.mjs`（票 19 修好的键盘长按怪，判据是 toast 文案 +
  分数增量 + 画面几何，不依赖帧率）。整套本机约 **3.5–8 分钟**（见下），
  CI 上软件光栅更慢 —— 所以它**单独一个 job**，不占 `verify` 的 30 分钟预算。
- **`fx-moments.mjs` 的耗时随这一局的内容波动**（3.5 分钟 ↔ 8 分钟）。
  它打的是**真实对局**，每个瞬间要等「暴击 / FEVER / 双生」的 toast；
  旧版那一侧这一局没碰上，就只能把 900 轮的搜索跑满（而且游戏**没有固定种子**，
  每次结果都不同）。所以整套装机的耗时是**有分布的**，不是固定值。
- **分数有 0.45 秒滚动动画**。断言 HUD 数值请读 `#scoreText[data-value]`（`readHud()` 已处理），不要读 `textContent`。
- **`trace` 会重新生成** `scripts/legacy/legacy-harness-*.html`，依赖仓库根的 `source.html`；不要把它当成可随意删除的临时文件。
- **e2e 依赖构建产物**：改了 `src/` 先 `npm run build`，否则跑的是旧 `dist/`。
- **CI 超时 30 分钟**（`verify` 与 `visual` **各 30 分钟**，两个 job 并行）。
  Playwright 安装 + e2e 脚本在 CI 上比本机慢（软件光栅只有 ~13.7 FPS）。
  视觉验收已经**单独一个 job**，所以它再慢也不会挤掉 `verify` 的预算 ——
  但 `visual` job 自己有 30 分钟上限：整套装机本机 3.5–8 分钟，CI 上按 2–3 倍估
  约 7–24 分钟，**最慢的那一档（`fx-moments` 跑满 900 轮）贴着上限**。
  若 `visual` 超时，优先查 `fx-moments`（它随这一局有没有碰上 FEVER / 双生而波动）。
- **CI 只在 `main` / `feat/**` 的 push 和 PR 上跑**；新建的分支名如果不在 `feat/**` 下，需要手动 `workflow_dispatch`。
- 规则层改动必须过 `npm run trace`；渲染层 / 表现层改动不应影响它 —— 这正是分层要保护的边界。

- **`Monster['kind']` 还在 7 个模块里分派**（P2，已知后续项）。本轮只把**纯类别判定**
  收进了 `src/game/kinds.ts`（`isHoldMonster` / `isTwinMonster`，用在 `rules/spawn.ts`
  与 `rules/strike.ts` 的 6 处）。剩下的是**真正的行为分派** ——
  `rules/resolve.ts`（结算分支）· `rules/tick.ts`（长按计时）· `game/trace.ts`（轨迹快照）·
  `PixiRenderer.ts` 与 `pixi/monster.ts`（渲染分支）——
  把它们合成一个 dispatch 会动到规则层与渲染层的结构，
  **在交付前不值得冒 golden trace 与 360 个单测的风险**。
  理由：这是**判断题**（ smell ）而不是 bug —— 散是散，但没有一处会算错。
  下一个窗口单独开票做，且要连带跑视觉验收。
- **`src/game/trace.ts` 会被 `patch-legacy.mjs` 单独转译内联进旧 harness** ——
  `transpileModule` **不解析 import**，所以 `trace.ts` 只能有**类型导入**，
  不能有值导入（这是它至今没引入 `game/kinds.ts` 的原因）。
  想让它用上共享谓词，得先把 `trace.ts` 改成多文件可打包的形状 —— 另开票。
- **D1 的修法不在生产路径**（票 11）。别看到 `GameState.legacyClearLane` 就以为产品带着这个开关 ——
  `createGameState` 的默认是 `false`（旧语义），只有 golden trace 的回放器会把它打开。
  差异账本上 D1 现在是**记账**，不是**修**。

## 关键文档

- 规格与验收：[`.scratch/refactor/spec.md`](spec.md)
- 票与完成说明：[`.scratch/refactor/issues/`](issues/)
- 领域词汇：[`GLOSSARY.md`](../../GLOSSARY.md)
- 架构决策：[`docs/adr/`](../../docs/adr/)
- 行为差异与保真门禁：[`CHANGELOG.md`](../../CHANGELOG.md)
- 旧版 harness 的补丁方案：[`scripts/legacy/legacy-patch-spec.md`](../../scripts/legacy/legacy-patch-spec.md)
  （`patch-legacy.mjs` 的方案书，**已入库**；引用方统一指这里）
- 运行 / 构建 / 命令表：[`README.md`](../../README.md)
