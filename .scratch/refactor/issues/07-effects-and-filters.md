# 07 — 特效接入：bloom 图层 + 条件滤镜

Status: ready-for-agent
Blocked by: 06

## 目标

落地第一轮定下的特效范围：**战斗特效 + 全屏后处理**。这是"画面翻新"验收项的核心。

## 要做

1. **bloom 只挂 `glow` 图层**，不做全屏 bloom：
   - 把"该发光的东西"单独放进 `glow` 层：判定区光、暴击区、角色能量环、FEVER 光环、刀光残影、粒子、冲击环。
   - `glow` 层挂 `pixi-filters` 的 `AdvancedBloomFilter`。
   - **理由**：性能上省一个数量级（全屏 bloom 要对整屏做多 pass 模糊），美术上更可控 —— 辉光溢出到怪物身上正是想要的效果。
   - `AdvancedBloomFilter` 的 `resolution` 可调低以省像素成本；bloom 强度与阈值需要调（见 09）。

2. **条件滤镜**（不是常驻）：
   - `RGBShiftFilter`（色散）—— 仅 FEVER 期间启用，缓慢左右漂移。
   - `ShockwaveFilter`（冲击波）—— 暴击 / 双生同时击破时瞬时触发。
   - 滤镜切换必须**不重建 filter 实例**（重建会导致每帧分配），用参数插值过渡。

3. **战斗特效增强**（现有效果保留 + 提升）：
   - 粒子：现有 `burst()` 上限 260 —— 增加**暴击**与**FEVER**两种差异化粒子形态（形状 / 速度 / 颜色 / 生命周期）。
   - 刀光：现有三段式（飞行新月 / 冲击新月 / 垂直光柱）—— 暴击时追加余晖。
   - 冲击环：现有 `rings` —— 暴击环加粗 + 颜色分档。
   - 屏幕震动：现有 `shake` —— 暴击 / 双生 / FEVER 结束三档强度区分（当前全部压在一个上限 17 的值上）。
   - FEVER：现有金色泛光 + 轨道能量带 + 呼吸边框 —— 配合 bloom 后重新调参。

4. **UI 动效**（第一轮定的"顺手做"）：HUD 数字滚动、FEVER 徽章脉冲、结算面板入场 —— 用 `motion`（`motion/react`）。

## 硬性约束（性能）

- 滤镜**不得每帧重建实例**。
- bloom 层的 `resolution` 与主画布分辨率解耦，优先降采样。
- 粒子走 `ParticleContainer`，不用普通 `Container`。
- **不引入音频**（第一轮裁决：本轮不做音效）。

## 验收

- 暴击 / FEVER / 双生同破三个瞬间，画面表现力相对旧版有明确提升（并排对比截图）。
- FEVER 期间色散滤镜生效且不明显掉帧。
- FPS 挂件显示稳定 60。

## 备注

- `pixi-filters@6` 是 PixiJS 官方维护的，peer 要求 `pixi.js >=8`，与本项目匹配。
- 可用的滤镜不止 bloom：`glow` / `rgb-split` / `shockwave` / `motion-blur` / `crt` / `noise` / `color-overlay` / `drop-shadow` / `outline`。不要一次全上 —— 每个都是像素成本。
- **背景不动**（第一轮裁决）：现有 `bgStars` 星空保持原样，不要引入流体 / 粒子背景。
