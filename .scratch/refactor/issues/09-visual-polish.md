# 09 — 画面打磨：按验收标准调特效

Status: resolved（实机 60fps 待用户确认）
Blocked by: 08

## 目标

把特效参数调到"暴击 / FEVER / 双生同破三个瞬间明显更好看"，而不是"滤镜都开了"。

## 要做

1. **定义可度量的验收项**（写在票里，完工后逐条核对）：
   - 暴击命中时，判定区中心到角色之间有**贯穿全轨道**的高亮拖影，且屏幕震动强度明显区别于普攻。
   - FEVER 期间，整屏有持续但不刺眼的高光溢出，色散可见但不干扰读图（判定区与怪物必须仍然清晰可辨）。
   - 双生同破时，两轨同时产生冲击环 + 冲击波，颜色为双生的粉。
   - 普通普攻**不应该**有同等强度的特效 —— 特效要能区分普攻 / 暴击 / FEVER，否则"命中"失去信息量。

2. **调参**：bloom 强度 / 阈值 / 半径 / resolution，粒子密度与生命周期，震动强度分档，FEVER 呼吸周期。

3. **可读性回归**：特效不得遮挡判定区边界、暴击区标记、"暴击 / 普攻"文字标签、双生锁链。

4. **FEVER 期间的节奏**：FEVER 是 10 秒的持续状态，特效不能做成"第一次最强然后衰减"，要保持稳定但有呼吸。

## 验收

- 三个瞬间的并排对比截图达成上面 4 条验收项。
- 判定区与怪物在 FEVER 期间仍然清晰可辨。
- FPS 挂件显示稳定 60。

## 备注

- 调参靠**看**和**实机反馈**，不靠测量循环（ADR-0004）。这一票天然需要用户参与验收。
- 用户已明确：性能问题会在实机测试时反馈。所以这一票的验收是"看起来对 + 用户实机确认"。

## Answer

2026-10-21 完成。四条验收项逐条对照如下；证据图在
`dist/e2e-shots/09/acceptance-09.png`（2×2 拼图，`fx-acceptance.mjs` 可复现）。

> **证据留存（票 20 补）**：`dist/` 被 gitignore，验收拼图跑完就蒸发。
> 现在这 5 个特效脚本接进了 CI（`npm run test:visual`，CI 里是独立一个 `visual` job，失败即红），
> 跑完把 `dist/e2e-shots/` 作为 **artifact `visual-acceptance-shots`** 上传
> （`if: always()`，红了也留证据）。
> 在 CI run 的 **Artifacts** 区域下载它，拼图在 **`09/acceptance-09.png`**
> （拼图源文件 `dist/e2e-shots/09/acceptance-09.html` 一并留存）。

### 四条验收项

| # | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | 暴击有贯穿全轨道的高亮拖影，震动明显区别于普攻 | ✅（按实机体感改写，见下） | 挥棒残影 + 接触点金色余晖；震动 5 → 11 |
| 2 | FEVER 整屏高光不刺眼，色散可见但不干扰读图 | ✅ | 判定区描边连续性 100% → 100%；最大红蓝差 171 → 237；真实截图目检 |
| 3 | 双生同破两轨同时出粉色冲击环 + 冲击波 | ✅ | 两轨 `#ff5ecb` 环 + 全屏冲击波 + `pair-smash` 下砸；震动 16 |
| 4 | 普攻不能有同等强度特效 | ✅ | 普攻只有 26+10 粒木屑 / 0.4s 小环；暴击 36+16 粒 / 0.5s 大环 + 白热核 + 冲击波 |

**第 1 条的改写**：用户已把玩法改成"木棍实打实敲中"，判定框挪进了棒尖攻击范围
（`computeLayout` 里 `hitX = playerX + playerR * CLUB_REACH_R`），并明确不要剑气 / 飞行刀光。
所以"从判定区中心贯穿到角色"的旧刀光不再存在 —— 现在承担这条的是**木棒挥击残影**
（`player.ts` 的三道淡棒影 + 棒端弧线）和**接触点的金色余晖**
（`slash.ts` 的 `afterglow`：宽 5px / 0.22 与 2.5px / 0.3 两圈）。这是有意的产品决策，不是漏做。

### 这票实际改动

1. **把 FEVER 全场洗色移出 bloom 层**（`frenzy.ts`、`PixiRenderer.ts`）。
   洗色铺满屏幕，过 `AdvancedBloomFilter` 会变成一片黄雾 —— bloom 叠加的是亮度，
   而全屏半透明暖色每一像素都在阈值之上。拆成 `washContainer` 挂到 `floaters`
   （没有 bloom），能量带 / 边缘呼吸仍留在 `glow`。这是可读性回归的主因。
2. **FEVER 色散可读性度量改成真实截图**（`fx-fever-readability.mjs`）。
   WebGL `preserveDrawingBuffer: false` 下 `drawImage(canvas)` 读回不可靠（票 08 同款坑），
   改为 `page.screenshot({ clip })` + 页面内 2D canvas 解码；判据仍是描边连续性 / 红蓝差 / 彩色边面积。
3. **真实 WebGL 截图通道**（`scripts/browser.mjs`）。
   `CHROMIUM_ARGS` 带 `--enable-unsafe-swiftshader`，Chromium 实际跑在
   `--use-angle=swiftshader-webgl` 上 —— **无头就拿得到 WebGL**，Pixi 不回退 Canvas2D，
   bloom / 色散 / 冲击波全部生效，特效截图有效。
   （本条原先写的「无头拿不到 WebGL，要 `HEADED=1` + `xvfb-run`」已过期，票 20 更正。）
4. **可复现验收图脚本**（`tests/e2e/fx-acceptance.mjs`）。
   通过 `?debug` 的 `__FX_DEBUG__.apply()` 定点注入四组效果，固定 2×2 拼图；
   和 `fx-moments.mjs`（真实对局、等 toast）互补。
5. **旧版自动打怪判定区修正**（`fx-moments.mjs`）。
   旧版 `hitX` 是 `W*0.34`（1280 下约 430），新版是棒尖 250；脚本原先用同一个 x，
   旧版永远打不出暴击，在攒到 FEVER 前就 game over。现在两边各用自己的布局公式。

### 参数定稿

- bloom：`threshold 0.22 / scale 1.15 / brightness 1.05 / blur 6 / quality 3 / padding 28 / resolution 0.5`。
  阈值必须压低：pixi-filters 的亮度提取不做 alpha 反预乘，半透明霓虹色会被 alpha 压低。
- 色散：峰值横向偏移 7px，FEVER 呼吸 4.2 rad/s；洗色透明度 0.05–0.085。
- 冲击波：1000 px/s，寿命见 `SHOCK_LIFE`；暴击 1 档、双生 2 档。
- 粒子：普攻 26+10、暴击 36+16、双生每轨 34+12 粒；冲击环 0.4s / 0.5s。
- 震动：普攻 5、FEVER 中普攻 7、暴击 11、双生 13/暴击 16（`resolve.ts`）。

### 验证

| 检查 | 结果 |
| --- | --- |
| `fx-acceptance.mjs`（SwiftShader WebGL） | ✅ 四格图 + 页面无异常 |
| `fx-fever-readability.mjs`（SwiftShader WebGL） | ✅ 描边 100% → 100%，红蓝差 +66 |
| `bloom-ab.mjs`（SwiftShader WebGL） | ✅ 点亮像素 4.398% → 4.913%，平均亮度 +3.1% |
| `fx-moments.mjs`（SwiftShader WebGL，真实对局补充） | ◐ 暴击并排图成功；旧版该局未在 900 轮内触发 FEVER，按脚本设计跳过并排；新版 FEVER 图采到。不作为本票硬判据，硬判据是上面的定点注入图 |
| `npm run build && npm test && npm run trace && npm run test:e2e` | ✅（票 10 最终验收复跑） |

（票 20 更正：这 4 个脚本现在**无头**就能跑 —— `--enable-unsafe-swiftshader` 让 SwiftShader
提供了真实 WebGL，`HEADED=1 xvfb-run` 那套不再需要。它们已接进 CI 的 `npm run test:visual`。）

### FPS 说明

SwiftShader 是纯软件光栅（**无头也一样** —— 票 20 更正），
FPS 挂件只有 11–13，**不能作为 60fps 的证据**；
它只证明"代码在真实 WebGL 路径下能跑、滤镜没有异常"。验收图里已隐藏该调试挂件。
真机 60fps 与观感仍需用户用 `dist/index.html` 实测确认，和票 08 的遗留项合并验收。
