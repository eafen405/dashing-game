# 21 — 合并到 `main` + 交付收口

Status: ready-for-agent
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

- [ ] `main` 上有 PR 且 CI 全绿（含 `npm run trace`）。
- [ ] 干净工作区下 `npm run format:check` 通过。
- [ ] CHANGELOG / README / GLOSSARY / ADR 与实现一致。

## 备注

- 合并前先确认票 18 已修 —— CI 红着合进 `main` 不合适。
- `source.html` **保留不删** —— 它是 golden trace 的生成源（`scripts/legacy/patch-legacy.mjs`
  现场读它）与旧版 e2e（`compare-legacy.mjs` / `fx-moments.mjs`）的对照对象（票 10 的裁决）。
