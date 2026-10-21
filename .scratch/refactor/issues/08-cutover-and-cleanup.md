# 08 — 收口：默认切 Pixi，删除 Canvas 2D 实现

Status: ready-for-agent
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
