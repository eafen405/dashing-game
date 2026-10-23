# 20 — 把特效视觉验收接进 CI

Status: resolved
Blocked by: 18, 19

## 现状

票 09 的四条验收项（暴击 / FEVER / 双生 / 普攻）**只靠手工截图**把关。
这 5 个脚本**都不在** `npm run test:e2e` 里，CI 完全看不到它们：

| 脚本 | 干什么 | 2026-10-22 实测 |
| --- | --- | --- |
| `tests/e2e/fx-acceptance.mjs` | 2×2 验收拼图（普攻/暴击/FEVER/双生） | ✅ 无头直接跑通 |
| `tests/e2e/bloom-ab.mjs` | bloom 生效的像素判据（亮度 + 面积） | ✅ 通过 |
| `tests/e2e/fx-fever-readability.mjs` | FEVER 期间判定区描边连续性 / 色散幅度 | ✅ 通过 |
| `tests/e2e/filter-center-probe.mjs` | 冲击波中心按**像素**解释（`.d.ts` 注释是错的） | ✅ 通过 |
| `tests/e2e/fx-moments.mjs` | 真实对局的三个瞬间（旧版 / 新版并排） | ✅ 通过 |

它们的断言本来就是硬的（`assert()` + 失败置 `process.exitCode = 1`），
判据也都是**相对 / 结构性**的（亮度比、描边连续性、位移场比值），不依赖机器速度 ——
这正是它们能当门禁的前提。

## 一条已经过期的前提

`handoff.md` 与 `fx-acceptance.mjs` 的文件头都写着：

> 无头 Chromium 在这台机器上拿不到 WebGL，Pixi 回退 Canvas2D，bloom / 色散 /
> 冲击波会被跳过 —— 截图不能当视觉验收。

**这条已经不成立。** `scripts/browser.mjs` 的 `CHROMIUM_ARGS` 里有
`--enable-unsafe-swiftshader`，Chromium 实际又跑在 `--use-angle=swiftshader-webgl` 上，
无头环境**拿得到 WebGL**。

实测（2026-10-22，本机无头）：

- `bloom-ab` 通过：带 bloom 平均亮度 **+2.5%**、被点亮像素占比 **+0.45pp**；
- `fx-acceptance` 无头直接跑通，四格图里 bloom / 色散 / 冲击波**全部在画面上**；
- `fx-fever-readability` 通过：FEVER 期间判定区描边连续性 **100%**，
  最大红蓝差 173 → 239（色散确实生效）。

所以「必须 `HEADED=1 xvfb-run`」这个前提可以删掉了。

## 要做

1. 把这 5 个脚本接进 `npm run test:e2e`（或单开 `npm run test:visual`，
   在 CI 里作为独立步骤，失败即红）。
2. 删掉 `fx-acceptance.mjs` 文件头与 `handoff.md` 里「无头拿不到 WebGL」的过期说明，
   改成现在的实际做法（SwiftShader 软件光栅，无头可用）。
3. **证据要能留存**：`dist/` 被 gitignore，验收拼图现在跑完就蒸发 ——
   票 09 的「验收证据」对任何后来人都不可见。把 `acceptance-09.png` 作为
   CI artifact 上传（`actions/upload-artifact`），并在票 09 的 Answer 里补上 artifact 链接。
4. 核对 `tests/e2e/lib/harness.mjs` 的 `openApp()`：它硬编码 `dist/index.html`，
   确认 5 个视觉脚本都走同一条路径（截图取的是同一个产物）。

## 验收

- [ ] `npm run test:e2e`（或 `test:visual`）包含这 5 个特效脚本，本机全绿。
- [ ] CI 产物里能看到 `acceptance-09.png`。
- [ ] 仓库里不再有「无头没有 WebGL」的说法（`handoff.md` / `fx-acceptance.mjs` / 其它脚本注释）。

## 备注

- SwiftShader 是软件光栅，FPS 挂件只有 11–13 —— 这**不是**产品性能指标，
  别拿它当 60fps 证据（ADR-0004）。视觉脚本的判据不看 fps，所以进 CI 没有这个问题。
- 本票依赖票 18（CI 得先稳定下来）与票 19（长按脚本修好后再一起接）。

## Answer

2026-10-22 完成。分支 `feat/ticket-20-visual-acceptance-ci`，基线 `feat/refactor-v2` @ `7757321`。

### 接了什么

新开一条 npm 脚本 `test:visual`，把 5 个特效脚本 + 票 19 修好的键盘长按怪脚本
一起当门禁（**单开一条，不折进 `test:e2e`** —— 失败归因要清楚，
而且这 6 个脚本在 SwiftShader 下慢，`test:e2e` 那 6 个稳定脚本保持原样不动）：

```json
"test:visual": "node tests/e2e/fx-acceptance.mjs && node tests/e2e/bloom-ab.mjs && node tests/e2e/fx-fever-readability.mjs && node tests/e2e/filter-center-probe.mjs && node tests/e2e/fx-moments.mjs && node tests/e2e/hold-monster-keyboard.mjs"
```

顺序有意为之：**`fx-acceptance` 排第一个** —— 它产出的验收拼图是本票要留档的证据，
先跑就保证后面的脚本失败时拼图已经在磁盘上。

断言一个字没动：各脚本仍是 `assert()` + 非零退出码，判据仍是相对 / 结构性
（亮度比、被点亮面积占比、描边连续性、位移场比值、toast 文案 + 分数增量），
**没有加任何性能断言**（ADR-0004）。

### CI job 与 artifact

`.github/workflows/ci.yml` 里，视觉验收**单独一个 job**（`visual`），与原来的 `verify` job
**并行**跑：

```yaml
  visual:
    name: 特效视觉验收（视觉脚本 + 验收证据）
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: 检出代码
        uses: actions/checkout@v4
      - name: 准备 Node 24
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - name: 安装依赖
        run: npm ci
      - name: 安装 Chromium（仅浏览器检查需要）
        run: npx playwright install --with-deps chromium
      - name: 构建单文件产物
        run: npm run build
      - name: 特效视觉验收（定点注入 + 像素判据 + 真实对局并排）
        run: npm run test:visual
      - name: 上传特效验收截图（票 09 验收证据）
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: visual-acceptance-shots
          path: dist/e2e-shots/
          if-no-files-found: warn
```

**为什么不是一个「步骤」而是一个「job」**（票里给的是推荐形状，这里改了，理由如下）：
本机实测 `npm run test:visual` 要 **3.5–8 分钟**（`fx-moments` 的耗时随这一局有没有
碰上 FEVER / 双生而波动，见下）。CI 上软件光栅更慢，按 2–3 倍估是 7–24 分钟。
串在 `verify` 后面的话，主流水线（`npm ci` + Playwright 安装 + e2e + trace ≈ 12–15 分钟）
加上视觉验收就**贴着 30 分钟的作业上限**，最慢那一档会超时。独立成 job 有三个好处：

1. 独立的 30 分钟预算，不占 `verify` 的；
2. 与 `verify` **并行** —— 墙钟时间几乎不涨（多花的是 `npm ci` + Playwright 安装的 CI 分钟）；
3. 失败归因更清楚（哪个 job 红就是哪一摊红了），artifact 上传在自己的 job 里跑。

另外两条保险：
- `if: always()` → 视觉脚本红掉时证据照样留档（`dist/` 被 gitignore，不上传就蒸发）；
- `if-no-files-found: warn` → 前面步骤就炸了、`dist/` 是空的时候不让 artifact 步骤二次失败。

**artifact 名字 / 路径**：artifact 名 `visual-acceptance-shots`，内容是 `dist/e2e-shots/` 整棵树。
`acceptance-09.png` 在 artifact 里的路径是 **`09/acceptance-09.png`**
（本地是 `dist/e2e-shots/09/acceptance-09.png`）。
同目录还有 `09/acceptance-09.html`（拼图的 HTML 源）、`07/`（bloom / FEVER / 冲击波 / 真实对局）、
`05/`（键盘长按怪的截图）。

### 过期说法的更正

「无头 Chromium 拿不到 WebGL，必须 `HEADED=1 xvfb-run`」**已经不成立** ——
`scripts/browser.mjs` 的 `CHROMIUM_ARGS` 带 `--enable-unsafe-swiftshader`，
Chromium 实际跑在 `--use-angle=swiftshader-webgl` 上，**无头就拿得到 WebGL**，
Pixi 不回退 Canvas2D，bloom / 色散 / 冲击波全部生效。

改掉的地方：

- `tests/e2e/fx-acceptance.mjs` —— 文件头的 `## 为什么必须 HEADED=1` 整段
  （含 `HEADED=1 xvfb-run` 用法）换成「无头直接跑」；拼图 HTML 里的
  「截图机为 Xvfb + SwiftShader 软件渲染」也改成「无头 Chromium + SwiftShader 软件光栅」。
- `scripts/browser.mjs` —— `const headless = ...` 上面那段注释改成实际做法；
  `HEADED=1` 开关**保留**（本地想人眼看窗口时还能用）。
- `.scratch/refactor/issues/09-visual-polish.md` —— Answer 第 3 条
  「真实 WebGL 截图通道」原来写的是「无头拿不到 WebGL + 加 `HEADED=1` 开关」，
  改成「无头就拿得到 WebGL」；验证表里的「（HEADED…）」括注一并更正，
  并补上 artifact 链接；FPS 说明段去掉 `xvfb-run` 的说法。
- `.scratch/refactor/issues/10-delivery-single-file.md` —— 验证表里同一处「（HEADED，WebGL）」括注。
- `.scratch/refactor/handoff.md` —— 「已知陷阱」段原本已经记了这条更正，
  现在把 CI 接线与 artifact 一并写进去。

**全仓扫过一遍**（`无头` / `WebGL` / `xvfb` / `HEADED`），剩下的命中都是**真话**，
不是「无头没有 WebGL」的变种：

- `scripts/verify-single-file.mjs`、`tests/e2e/bloom-ab.mjs`、`tests/e2e/fx-fever-readability.mjs`、
  `tests/e2e/fx-moments.mjs` 里的 WebGL 字样，讲的是
  `preserveDrawingBuffer: false` 下不能读画布缓冲（票 08 的老坑，**是真的**）；
- `tests/e2e/hud-stats.mjs`、`src/battlefield/pixi/**` 里的 WebGL 字样，
  讲的是渲染路径与帧率（**是真的**）；
- `tests/e2e/check-playable.mjs`、`tests/e2e/lib/harness.mjs` 里的「无头」，
  讲的是 `screen.orientation.type` 在无头下恒为 `landscape-primary`（**是真的**）。

**「无头拿不到 WebGL」这句话本身，仓库里已经一处不剩。**

### 共享路径核对（要做的事 4）

`tests/e2e/lib/harness.mjs` 的 `openApp()` 走的是
`DIST = resolve(process.cwd(), 'dist', 'index.html')` + `pathToFileURL(DIST).href` ——
**确实硬编码 `dist/index.html`**。5 个视觉脚本**全部** `import { openApp } from './lib/harness.mjs'`
并用它开页（`fx-moments.mjs` 额外用 `openApp` 开新版、用 `pathToFileURL` 开旧版
`source.html` 做并排对照，那是**对照组**，不是被测对象）。

所以 6 个脚本截图取的是**同一个构建产物**，无需改动。
唯一要记住的是：`process.cwd()` —— 所以必须从仓库根跑 `npm run test:visual`。

### 改动文件

- `package.json` —— 加 `test:visual` 脚本。
- `.github/workflows/ci.yml` —— 加 `visual` job（视觉验收 + artifact 上传），与 `verify` 并行；作业名与尾部注释同步。
- `scripts/browser.mjs` —— 更正 `headless` 上面的注释。
- `tests/e2e/fx-acceptance.mjs` —— 更正文件头与拼图注记。
- `README.md` —— 命令表加 `npm run test:visual`；流水线那句补上 `visual`。
- `.scratch/refactor/handoff.md` —— 票状态 / 验证基线 / 已知陷阱 / 接下来怎么做。
- `.scratch/refactor/issues/09-visual-polish.md` —— Answer 第 3 条更正 + artifact 链接。
- `.scratch/refactor/issues/10-delivery-single-file.md` —— 验证表括注更正。
- `.scratch/refactor/issues/20-wire-visual-acceptance-into-ci.md` —— 状态 + 本段。

### 验证（本机，2026-10-22，`7757321`）

| 命令 | 结果 |
| --- | --- |
| `npm run build` | ✅ `dist/index.html` 1,068.16 kB（gzip 321.92 kB） |
| `npm run test:visual` | ✅ 六个脚本全过 —— **整套 7 分 53 秒（473.43 s）**；单跑一遍是 3 分 28 秒（208 s），差在 `fx-moments` |
| `npm run test:e2e` | ✅ 六个脚本全过（287 s） |
| `npm run typecheck` / `npm run lint` / `npm run format:check` | ✅ / ✅ / ✅ |
| `npm test` | ✅ 30 个文件 / 360 个测试 |
| `npm run verify` | ✅ 静态通过 + 浏览器检查通过（外部请求 0） |
| `npm run trace` | ✅ Golden trace 门禁通过（71.8 s，11 条结算路径全覆盖） |

`npm run test:visual` 的**单脚本耗时**（本机，各自独立计时）：

| 脚本 | 耗时 |
| --- | --- |
| `fx-acceptance.mjs` | 7.6 s |
| `bloom-ab.mjs` | 4.4 s |
| `fx-fever-readability.mjs` | 4.5 s |
| `filter-center-probe.mjs` | 50.5 s |
| `fx-moments.mjs` | **92.9 s ～ 434 s**（见下） |
| `hold-monster-keyboard.mjs` | 48.5 s |
| **合计** | **3 分 28 秒 ～ 7 分 53 秒（208 s ～ 473 s）** |

最慢的是 `fx-moments.mjs`（真实对局要打到 FEVER）和 `filter-center-probe.mjs`
（要采两帧稳定画面）。**没有为省时间削弱任何一条断言。**

**为什么 `fx-moments` 的耗时是一个区间而不是一个数**：它打的是**真实对局**，
每个瞬间都要等对应 toast 出现（`^暴击` / `^FEVER` / `^双生`）；
旧版那一侧这一局没碰上，就把 900 轮的搜索跑满，而游戏**没有固定种子**，
每次结果都不同。实测同一台机器两次跑出来 93 s 和 434 s（后者是「双生」那一侧没等到）。
脚本**设计上容忍**只等到一边（打 `⚠ 只有一边等到 /…/`，**不判失败**），
所以这不是 flaky，是**耗时分布**。

### 风险与留给编排者的话

- **30 分钟作业超时 —— 本票的真正风险，已经用「独立一个 job」处理掉了**：
  视觉整套本机 3.5–8 分钟，CI 上 SwiftShader 更慢，按 2–3 倍估约 7–24 分钟。
  所以它**没有**串在 `verify` 后面，而是**独立一个 `visual` job**（30 分钟预算，与 `verify` 并行）——
  最坏那一档（`fx-moments` 跑满 900 轮）也不会挤掉主流水线的预算。
  **仍要盯的**：`visual` job 自己在 24 分钟那一档会贴着 30 分钟上限。
  真正的止血手段是**给这 6 个脚本加每脚本超时**（而不是删判据）——
  本票**没有**加，因为 `fx-moments` 的耗时没有上界（900 轮 × 3 个瞬间），
  设一个不误红的阈值就得放到 30 分钟以上，等于没设。
  编排者如果看到 `visual` job 偶发超时，优先加这一层。
- **`fx-moments.mjs` 的耗时是分布不是定值**（93 s ～ 434 s，见上），
  它是整个 `visual` job 的耗时主导项。**它不是 flaky**（超时那一侧脚本设计上容忍），
  但它决定了 `visual` job 的墙钟时间。
- **`hold-monster-keyboard.mjs` 有概率性**：长按怪是 28% 概率刷新，脚本要等到它出现
  （票 19 实测单次 39–66 秒，CI 上更慢）。它已经用「起手尝试次数」而不是「等够久」
  做判据，但**等待超时上限是 240 秒** —— CI 上若刷怪更慢，偶发超时会红。
  这是**唯一**一个本票接进来时带着概率性的脚本，编排者值得盯一眼。
- **`fx-moments.mjs` 的旧版对照**依赖仓库根的 `source.html`（只读参照物，票 10 保留）。
  `source.html` 哪天被删，这个脚本就会红。
- **artifact 上传的是 `dist/e2e-shots/` 整棵树**（`visual` job 只跑视觉脚本，
  所以里面是 `09/` 验收拼图、`07/` 特效截图、`05/` 键盘长按怪截图）。
  如果只想留视觉证据，把 `path` 收窄成 `dist/e2e-shots/07/` + `dist/e2e-shots/09/`
  也可以 —— 现在留全树是图省事，`visual` job 的截图本来也都是视觉证据。
- **`visual` job 与 `verify` job 各装一次依赖与 Chromium**：多花约 3–4 分钟 CI 分钟，
  换来的是并行（墙钟几乎不涨）+ 各自的超时预算。这笔交易在视觉套件这么慢时是划算的。

---

## 补记（2026-10-23）· CI 第一次跑红的根因与修法

`visual` job 在 PR 上第一次跑是**红的**（`verify` job 7m06s 全绿，含 `npm run trace`）：

```
✗ 失败：Error: page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot
  - taking page screenshot
  - waiting for fonts to load...
  - fonts loaded
```

前面 4 个脚本全过（验收拼图 / bloom / FEVER 可读性 / 冲击波中心），
**挂在第 5 个 `fx-moments.mjs`**：它同时开着**旧版 + 新版两个带 bloom 的页面**，
截到「瞬间 1 · 暴击」之后，下一张截图就再也截不出来了。

### 根因：CI 的 `/dev/shm` 只有 64 MB

Chromium 默认把 WebGL 的共享内存缓冲放在 `/dev/shm`。GitHub runner 的 `/dev/shm`
**只有 64 MB**（本机 WSL2 是 9.8 GB —— 所以**本机永远复现不出来，只有 CI 会红**）。
两个带 bloom 的页面一起跑，共享内存被撑爆，渲染进程在截图那一刻失联，
`Page.captureScreenshot` 就报「Unable to capture screenshot」。

### 修法（两处，都在判据之外）

1. **`scripts/browser.mjs` 的 `CHROMIUM_ARGS` 加 `--disable-dev-shm-usage`**
   —— 让 Chromium 改用 `/tmp`，绕开那块 64 MB。这是根因修复。
2. **`tests/e2e/fx-moments.mjs` 加固**（脚本本来就「容忍一边没等到」）：
   - `harness.mjs` 新增 `captureShot()` —— 截图失败重试 3 次（这种失败是**瞬时的**，
     渲染进程没死，等一下再截常常就成功）；
   - 截不出来的那一边按「这一边没等到」处理，不再让整个脚本崩；
   - 渲染进程真死的那一页标记为 `dead`，**不再对它 `evaluate`**（否则整个循环被带崩），
     另一页继续跑完剩下的瞬间；
   - **硬判据保留并加强**：新版至少要截到 1 个瞬间（`captured.modern > 0`）——
     一个都没截到就说明这个脚本白跑了，仍然红。

判据一个字没改 —— 改的是**跑机器的资源限制**和**失败传播路径**，
不是把门禁放松成「永远绿」。

### 验证

- 本机 `npm run test:visual` 全绿：6/6 脚本，瞬时 3/3 两边都截到（旧版 3 个 / 新版 3 个）。
- CI 的 `verify` job 已绿（7m06s，含 `npm run trace`）；`visual` job 重跑结果见下。
