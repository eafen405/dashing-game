# 20 — 把特效视觉验收接进 CI

Status: ready-for-agent
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
