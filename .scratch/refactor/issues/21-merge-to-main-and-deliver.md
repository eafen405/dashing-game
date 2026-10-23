# 21 — 合并到 `main` + 交付收口

Status: resolved
Blocked by: 20

## 现状

- `main` 仍停在初始提交 `d2958e2`（「双轨打怪」旧版 `source.html` 的存档点）。
- **票 01–17 的全部成果只存在于 `feat/refactor-v2`**，远端**没有任何 PR**。
- 仓库默认分支现在打开看到的是旧版玩法，不是新玩法（棒子人 / 地面 / 天空大地双轨 / 棒尖判定框）。

## 要做

1. **开 PR**：`feat/refactor-v2` → `main`，CI 全绿再合。
2. **CHANGELOG 收口**：`[Unreleased]` → `[0.2.0]`，`package.json` 的 `version` 同步。
3. **README 首屏对齐**：确认「怎么跑」「怎么玩」两张表都对得上当前实现，
   并把票 11–17 带来的玩法变化（角色 / 地面 / 重力 / 2 秒长按 / 棒尖判定框）讲清楚。
4. **`source.html` 的定位写进 README**：旧版参照物、只读、不参与构建、
   初始版本在 git 历史 `d2958e2`。票 10 已裁决保留，本票只确认文档说清楚了。
5. **参考产物不入库**：`dashing-game(1).html` 与 `pelican-bicycle.html` 原本躺在仓库根，
   会让 `npm run format:check` 变红（Prettier 会读 `.gitignore`）。
   两者已于 2026-10-22 移入回收站，`format:check` 恢复绿色。
   核对结论：`dashing-game(1).html` 与 `npm run build` 的产物**逐字节相同**（1,068,167 B），
   所以不必入库 —— 产物由构建复现即可。若日后又把参考产物放进仓库根，记得加进 `.gitignore`。
6. 把 `dist/index.html` 交给用户做真机验收（票 22）。

## 验收

- [ ] `main` 上有 PR 且 CI 全绿（含 `npm run trace`）—— **留给编排者**（本票不推送、不开 PR、不合并）。
- [x] 干净工作区下 `npm run format:check` 通过。
- [x] CHANGELOG / README / GLOSSARY / ADR 与实现一致。

## 备注

- 合并前先确认票 18 已修 —— CI 红着合进 `main` 不合适。
- `source.html` **保留不删** —— 它是 golden trace 的生成源（`scripts/legacy/patch-legacy.mjs`
  现场读它）与旧版 e2e（`compare-legacy.mjs` / `fx-moments.mjs`）的对照对象（票 10 的裁决）。

## Answer

2026-10-22 完成。分支 `feat/ticket-21-merge-to-main`，基线 `feat/refactor-v2` @ `e46d4ae`。
**本票只做交付前的收口**：CHANGELOG / README / GLOSSARY / ADR / `.gitignore` / 交接说明。
**不推送、不开 PR、不合并 `main`** —— 那三步留给编排者（见「留给编排者」）。

### 1. CHANGELOG 收口

- 标题：`## [Unreleased] —— 规则层纯化 + 单文件产物重构` →
  `## [0.2.0] —— 规则层纯化 + 单文件产物重构（2026-10-22）`。
  `package.json` 的 `version` 本来就是 `0.2.0`，与标题一致，**未改**。
- 新增一节「**CI 门禁收口（票 18–20）**」，把三张票的收口工作写进发行说明：
  - **票 18** —— e2e 的 HUD 统计判据从帧率下限（`publishes > 600` ≈ 20fps）改成**结构性判据**
    （循环没冻 / 每帧发布一次 / 1fps 量级保险丝），同类的「出刀次数」判据也改成相对量。
    **ADR-0004「CI 不做性能断言」因此仍然成立** —— CI 里已没有任何一条判据取决于机器速度。
  - **票 19** —— 键盘长按怪脚本重写，从「过期脚本」变成真门禁（时长与 toast 文案从源码常量读、
    盯画面等头部进圈、等待期用指针清普通怪；判据 = toast 文案 + 分数增量 + 画面几何）。
  - **票 20** —— 5 个特效脚本 + 键盘长按怪脚本组成 `npm run test:visual`，CI 里是独立
    一个 `visual` job（与 `verify` 并行），验收拼图作为 artifact `visual-acceptance-shots` 留档。
- **D1–D14 一条没少、没重编号**，但补了一条**票 11 补记**（见下「文档一致性」）；
  随后的跟进提交又**追加了 D15–D17**（票 12 / 13 / 14 的玩法变化补账）。

### 2. README 首屏对齐（票 11–17 的玩法变化）

README 的玩法表此前描述的还是**旧版游戏**，现在按实现重写：

| 行 | 改前 | 改后 |
| --- | --- | --- |
| 轨道 | 战场分**上轨**与**下轨**两条水平通路；怪物只沿轨道移动，出刀只对轨道生效 | 战场分**上轨**与**下轨**两条通路：**上轨在天空一侧，下轨是大地**；角色默认在下轨的地面上跑，怪物只沿轨道移动 |
| 出刀 | 怪物进入判定区时，点击**上半屏**打上轨，点击**下半屏**打下轨 | 点击**上半屏**打上轨（角色从下轨**起跳**，约 1 秒后受重力落回），点击**下半屏**打下轨（原地抡棒下砸） |
| 判定区 | *（没有这一行）* | 新增：判定框的中心落在**棒尖**够得到的最大水平距离上（木棍加长到 2.55 倍角色半径） |
| 漏怪 | 怪物越过判定区抵达角色：失去 **20 点血量**，初始 **250** | **同轨**漏怪：失去 **20 点血量**，初始 **250**；**另一轨**上擦身而过**不扣血**，但连击 / FEVER 清零 |
| 失误 / 普攻 / 暴击 / 连击 / FEVER | —— | 不变 |

其它对齐：

- **开篇**：角色从「抽象角色」改成「大地上奔跑的棒球帽红球衣角色」；
  「只换实现、不换玩法」这句已经不成立（票 12–17 改过玩法），改成「玩家能察觉到的每一处变化都记在 CHANGELOG 里」。
- **操作**：补上手机长按**不再弹浏览器选词 /「标记广告」菜单**（票 15）；
  键盘表逐条对过 `src/input/mapping.ts`（`mapKeyDown` / `mapKeyUp`）—— 与实现一致，
  补了「开始界面上按 `↑`/`W`/`↓`/`S` 也能直接开始」这一条实现里有的行为。
- **特殊敌人**：双生补「角色大幅跳起、落下时双砸」；长按怪补「角色悬浮在轨道上方连续下砸」，
  并保留「按住 **2 秒**贯穿」。
- **开发流程表**：`npm run test:visual` 在（补上了 `npm run format:check` 一行）；
  「CI 跑的就是这条流水线」改成**两条并行流水线**：`verify` job
  （typecheck → lint → test → build → verify → e2e → trace）与 `visual` job
  （build → test:visual → 上传验收截图），各 30 分钟预算。
- **表现层措辞**：「刀光残影」→「命中特效（火花 / 冲击环）」—— 票 17 去掉了飞行剑气。

### 3. `source.html` 的定位

README 的「仓库结构」一节现在把它的四条定位写全了：**旧版参照物**、**只读**（绝不改写、绝不格式化）、
**不参与构建**（产物完全由 `src/` 编译而来）、以及**初始版本在 git 历史 `d2958e2`**
（附 `git show d2958e2:source.html`）。同时写明它是 golden trace 的生成源与旧版 e2e 的对照对象。

### 4. 参考产物不入库

- 仓库根现在只有 `index.html`（Vite 入口）与 `source.html`（旧版参照物）两个 HTML。
- `.gitignore` 新增**根锚定**的两条规则（`/dashing-game(1).html`、`/pelican-bicycle.html`），
  带注释说明为什么（前者的产物由 `npm run build` 逐字节复现，后者是别的项目的页面）与
  「`index.html` / `source.html` 必须入库，不在此列」。
- 实测 `npx prettier --file-info`：`dashing-game(1).html` / `pelican-bicycle.html` → `ignored: true`，
  `index.html` → `ignored: false`（仍被检查），`source.html` → `ignored: true`（`.prettierignore` 里，
  绝不格式化）。**Prettier 3 会读 `.gitignore`**，所以这两条忽略规则同时挡住了 format:check 变红。

### 5. 文档一致性核对（GLOSSARY / ADR / spec）

改掉的**真·不一致**（3 处）：

1. `GLOSSARY.md` 的**漏怪**：原文「怪物未被击破即越过判定区抵达角色。角色为此损失生命。」
   —— 票 12 之后不成立（另一轨擦身而过不扣血）。改成：同轨漏怪扣血，另一轨不扣血但连击 / FEVER 清零。
2. `GLOSSARY.md` 的**轨道**：补上「上轨在天空一侧，下轨是大地，是角色的落脚点」（票 14）。
3. `docs/adr/0004`：加一段「现状」补记，写清票 18 把 CI 里最后一条隐含的帧率断言拆掉了，
   **「CI 不做性能断言」仍然成立** —— 措辞不需要改，只需要把事实落上。

`.scratch/refactor/spec.md`：更新了顶部那段过期的交接状态（原文还写着「剩余工作是收口票 18–22」）；
另外顺手修了两行**已被票 08 证伪**的架构草稿（分层图与目录结构里还写着
「canvas2d/ 与 pixi/ 两套实现」—— Canvas 2D 实现早已删除）。

**只报告、没有改**的（留给编排者裁决）：

- **D1 的口径变了**（CHANGELOG 已补记，但值得单独看一眼）：`clearLane()` 的「只算长按怪占用」修法
  在**生产路径上已被票 11 撤回**（那会让长按怪刷进有普通怪的轨道、吞掉该轨输入）。
  生产路径恢复旧版的「完全空轨」语义，**模式 B′（旧版原样 × 新版生产路径）逐帧一致**
  —— 也就是说 D1 现在**不再是玩家能察觉到的差异**，那个修法只作为 golden trace 的对照开关
  （`GameState.legacyClearLane`）留着。CHANGELOG 的 D1 条目已加「票 11 补记」说明这件事。
- **票 12 / 13 / 14 的玩法变化没有进 D 账**：角色重做、可见的地面、天空 / 大地双轨与重力、
  以及「触碰式受伤」都是玩家能察觉到的变化，但当时的 D 账（D1–D14）里没有对应条目
  （现有条目只覆盖了票 15–17）。本票按「不重编号、不删条目」的要求**没有新增 D15+**，
  是否补账由编排者定。
  → **（跟进提交已补上）**：编排者裁决补账，随后的提交在 `CHANGELOG.md` 与 `spec.md` 里
  **追加了 D15–D17**（D15 角色重做 + 触碰式受伤、D16 看得见的地面、D17 天空 / 大地双轨与重力），
  D1–D14 一条没动、没重编号；两处的「D1–D14」字样已更新为「D1–D17」。

### 6. 交接说明（`handoff.md`）

票状态表（18–21 → resolved）、验证基线表、已知陷阱（新增「仓库根只保留两个 HTML +
Prettier 3 会读 `.gitignore`」一条）、「接下来怎么做」四段全部更新：
**票 21 的文档收口已完成，剩下的开 PR / 合并 `main` 由编排者执行，再往后只剩票 22（必须人做）。**

### 7. 验证（本机，2026-10-22，基线 `e46d4ae` + 本票改动）

| 命令 | 结果 |
| --- | --- |
| `npm run format:check` | ✅（干净工作区） |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm run test` | ✅ 30 个文件 / 360 个测试 |
| `npm run build` | ✅ `dist/index.html` 1,068.16 kB（gzip 321.92 kB） |
| `npm run trace` | ✅ Golden trace 门禁通过（模式 A / B′ 逐帧一致；模式 C 分叉归因 D1；零输入场景一致；11 条结算路径全覆盖） |

`npm run verify` / `npm run test:e2e` / `npm run test:visual` 未复跑（本票只改文档，未动构建产物与脚本），
沿用票 20 的复核结果。

### 留给编排者

1. **先推送**：本地 `feat/refactor-v2` @ `e46d4ae` 比 `origin/feat/refactor-v2`（`cf3051b`）
   **领先 8 个提交** —— 票 18 / 19 / 20 已合进本地分支但**尚未推送**。
   开 PR 前先把它推上去（或直接推 `feat/ticket-21-merge-to-main`，它包含全部内容），
   否则 PR 会漏掉票 18–20。
2. **开 PR**：→ `main`，标题 / 正文见交接说明；CI 全绿再合。合完后 `main` 上就有票 01–21 的全部成果。
3. **票 22**：把 `dist/index.html` 交给用户做真机验收（60fps / 长按 2 秒手感 / Firefox / Safari）。
4. 若 `visual` job 偶发超时：优先查 `fx-moments.mjs`（耗时随这一局有没有碰上 FEVER / 双生而波动）。

---

## 补记（2026-10-23）· PR 已开并合并

PR #1：`feat/merge-to-main-0.2.0` → `main`，合并提交 **`c7df4fc`**。

**为什么另开一条分支而不是直接推 `feat/refactor-v2`**：远端随时可能有别人推上来的东西，
抢同一条分支容易撞车。`feat/merge-to-main-0.2.0` 是从集成分支 tip 切出来的**同一条历史**，
PR 走它，两边互不干扰；集成分支 `feat/refactor-v2` 也一并快进推了（`cf3051b..641bf89`）。

**CI 结果**（PR 上跑了两遍，都是绿的）：

| job | 结果 |
| --- | --- |
| `verify`（typecheck → lint → test → build → verify-single-file → e2e → **trace**） | ✅ 7m07s / 7m22s |
| `visual`（6 个特效脚本 + artifact） | ✅ 11m15s / 11m24s |

`npm run trace` **不再被跳过** —— 票 18 的验收项在 GitHub Actions 上确认成立。

### 中途踩的坑：`visual` job 第一次红

`fx-moments.mjs` 的**并排图合成**步骤在 CI 上偶发
`Protocol error (Page.captureScreenshot): Unable to capture screenshot`。

排查过程（细节见票 20 补记）：先排除了 `/dev/shm`（64 MB，但加参数后照样红）和
**Chromium 版本**（本机 153 vs CI 156 —— 装上 156 复跑照样绿）。真正的规律是：
**同一个提交，两个 runner 一个绿一个红** —— 是 runner 资源（2 核 + 软件光栅）下的**偶发**失败。

修法是**把合成阶段与游戏阶段分开**：游戏阶段只拍两边的单图；游戏浏览器关掉之后，
再用一个干净的浏览器排版并排图 —— 合成页面不跟任何 WebGL 页面抢资源。
另外给截图加了重试、渲染进程真死时不再带崩整套（硬判据仍是「新版至少截到 1 个瞬间」）。

**判据一个字没改** —— 改的是失败传播路径与资源竞争，不是把门禁放松。
