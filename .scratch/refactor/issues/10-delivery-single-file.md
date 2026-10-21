# 10 — 交付：产物校验入 CI、README 改写、CHANGELOG、删除 source.html

Status: ready-for-agent
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
