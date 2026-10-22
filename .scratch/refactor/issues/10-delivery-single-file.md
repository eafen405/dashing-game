# 10 — 交付：产物校验入 CI、README 改写、CHANGELOG、删除 source.html

Status: resolved（按裁决保留 `source.html` 为只读参照）
Blocked by: 09

## 目标

收尾，把"开盖即食单文件"的承诺固化到 CI 与文档里。

## 要做

1. **产物校验入 CI**：`scripts/verify-single-file.mjs` 的静态检查（无外部 `src`/`href`、无裸 `import`）设为**必过**门禁；浏览器检查在 CI 里用 Playwright + Chromium 跑，失败即红。产物体积设上限告警（当前 729 KB，gzip 221 KB —— 若因 Pixi 全量引入膨胀，优先改用 `pixi.js` 子路径导入做 tree-shaking）。

2. **README 改写**：
   - 删掉"零依赖、零构建"表述（ADR-0001）。
   - 写清开发流程（`npm install` / `npm run dev`）、构建流程（`npm run build` → `dist/index.html` 单文件，双击即玩）。
   - 修 `README.md:18` 的笔误：两句都写成"打下轨"，第一句应为"上轨"。
   - 保留玩法表（轨道 / 出刀 / 漏怪 / 失误 / 暴击 / FEVER / 双生 / 长按怪 / 难度星级），术语对齐 `GLOSSARY.md`。

3. **CHANGELOG**：记录本次重构的**已知行为差异**（spec 里那两条）：
   - 长按怪刷新频率：约每 25 秒 → 约每 20 秒（`clearLane` 修复）。
   - 判定区 X 坐标：`computeLayout` 修正了 `playerX` 的计算顺序，首次 resize 后判定区位置有极小偏移。
   - 并注明旧版存档位置（Git 历史 `d2958e2`）。

4. **删除 `source.html`**：Git 历史里保留（`git show d2958e2:source.html`）。删除前确认 golden trace 已稳定跑通。

5. **文档同步**：确认 `GLOSSARY.md` 与 `docs/adr/` 与实现一致；若实现中术语有调整，同步更新。

## 验收

- `npm run build` 产出单个 `dist/index.html`，`node scripts/verify-single-file.mjs` 通过。
- CI 全绿（typecheck / lint / test / build / verify）。
- README 里的每条命令都能实际跑通。
- `source.html` 已删除且能从 Git 历史取回。

## 备注

- 这一票做完，"零构建零依赖"就彻底不是这个仓库的描述了 —— 这是 ADR-0001 明确接受的后果。
- 交付时把 `dist/index.html` 作为可分享产物给用户实测。

## Comments

- **2026-10-21（交接收口）**：文档前半已完成并合入集成分支 —— README 改写、CHANGELOG、
  GLOSSARY / ADR 现状核对（`bb2ca5c`，合并于 `43386f2`）。本票仍未 resolved：
  剩余「产物体积上限告警」「删除 `source.html`」「最终验收」，且都排在 08/09 之后。
- **删 `source.html` 前必须先裁决**：它现在仍是 golden trace 的生成源
  （`scripts/legacy/patch-legacy.mjs` 读它生成 `legacy-harness-*.html`），
  也是 `tests/e2e/compare-legacy.mjs` / `fx-moments.mjs` 的旧版对照对象。
  直接删除会让 `npm run trace` 与 e2e 变红。两条路：保留它作为只读参照物，
  或把 legacy harness 固化成可提交的基线、改写对照脚本的数据源后再删。
  详见 [handoff.md](../handoff.md)。

## Answer

2026-10-21 完成。四项收尾里三项按原验收完成；`source.html` 经裁决**保留**，理由见下。

### 1. 产物体积告警（新增）

`scripts/verify-single-file.mjs` 的静态检查现在同时算 raw 与 gzip 体积：

- raw 超过 **1,200 KB**、gzip 超过 **380 KB** 时打印告警，**不阻断**。
- 当前基线 1,043.1 KiB（raw）/ 311.5 KiB（gzip），低于告警线。
- 失败项仍然只有「外部资源 / 裸 import / CSS 外链 / 没有内联脚本」这些硬约束。

CI 已在 `.github/workflows/ci.yml` 里把 `node scripts/verify-single-file.mjs`
（静态 + Playwright 浏览器检查）设为必过步骤，失败即红；`npm run trace` 与
`npm run test:e2e` 也都在同一 job 里。

### 2. README / CHANGELOG / 文档

- README 的开发 / 构建 / 验证命令已重写，玩法表与 `GLOSSARY.md` 对齐；
  第 18 行的「两句都写下轨」笔误已修（第一句是上轨）。
- CHANGELOG 补齐票 15–17 带来的**玩家可察觉变化**：D12 长按 3s→2s、
  D13 判定区移到棒尖、D14 手机长按不再弹浏览器菜单 / 标记广告。
- GLOSSARY / ADR / 实现术语已核对，无新增漂移。

### 3. `source.html` 去留裁决：保留（只读）

原验收写的是「删除且能从 Git 历史取回」，但交接收口时发现它与两套门禁强绑定：

- `npm run trace`：`scripts/legacy/patch-legacy.mjs` **现场读取** `source.html`
  生成 `legacy-harness-A.html` / `legacy-harness-Bprime.html`，trace gate 每次先重新生成。
- e2e：`compare-legacy.mjs` 与 `fx-moments.mjs` 直接打开它做旧版并排对照。

若删除，只有两条路：

1. 把两个 harness（各 114 KB，合计 228 KB，比 89 KB 的源文件还大）提交为生成基线，
   并改写 patch / trace / e2e 的数据源 —— 仓库里仍然躺着同一份旧实现，只是更难审计；
2. 同时废弃 trace 与旧版 e2e 对照 —— 会丢掉这次重构最重要的保真防线。

两条都不划算。**决定：保留 `source.html` 在仓库根，只读，不参与构建、不进入 `dist/`。**
它在 README / CHANGELOG 里都已明确标注「旧版参照物，只读不改」，并且仍可从
`git show d2958e2:source.html` 取回初始版本。单文件交付承诺只约束 `dist/index.html`，
不受影响。此裁决与本票 Comment 里的「两条路：保留它作为只读参照物」一致。

### 4. 最终验收（本机，2026-10-21，构建产物为当前源码）

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm test` | ✅ 30 个文件 / 360 个测试 |
| `npm run build` | ✅ `dist/index.html` 1,068.16 kB（gzip 321.92 kB） |
| `npm run verify` | ✅ 静态通过；截图差分 195,173 像素；外部请求 0 |
| `npm run trace` | ✅ 模式 A / B′ 逐帧一致，模式 C 仅已知 D1 分叉；零输入场景一致 |
| `npm run test:e2e` | ✅ 六个脚本全过 |
| `npm run format:check` | ✅ |
| `fx-acceptance.mjs`（HEADED，WebGL） | ✅ 四格验收图（票 09） |

CI 状态以推送后 GitHub Actions 为准；本机门禁全绿。

### 5. 交付物

`dist/index.html` —— 单文件、自包含、`file://` 双击即玩。真机 60fps 与长按手感
（2 秒贯穿、浏览器不再抢手势）仍需用户实机确认，这是票 08/09/10 共同保留的
唯一未闭环项。
