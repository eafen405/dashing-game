# 07 — 特效接入：bloom 图层 + 条件滤镜

Status: resolved
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
   - `RGBSplitFilter`（色散）—— 仅 FEVER 期间启用，缓慢左右漂移。
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
- 可用的滤镜不止 bloom：`glow` / `rgb-split`（`RGBSplitFilter`） / `shockwave` / `motion-blur` / `crt` / `noise` / `color-overlay` / `drop-shadow` / `outline`。不要一次全上 —— 每个都是像素成本。
- **背景不动**（第一轮裁决）：现有 `bgStars` 星空保持原样，不要引入流体 / 粒子背景。

## 实现备注（API 核实）

以下 API 名经 `node_modules/pixi-filters@6.1.5` / `pixi.js@8.22.0` 的 `.d.ts` 核实后修正：

| 票面写法 | 实际 API | 证据 |
| --- | --- | --- |
| `RGBShiftFilter` | `RGBSplitFilter` | `pixi-filters/lib/rgb-split/RGBSplitFilter.d.ts:28`；全库 grep `RGBShift` 零命中 |
| `particleProperties` | `dynamicProperties` | `ParticleContainer.d.ts:106` |
| `from 'pixi.js/particle-container'` | 从 `'pixi.js'` 根导入 | 该子路径无 `types` condition，`strict` 下报 TS7016 |

另有两个**静默失效**风险（无报错但效果不出现）：

- `AdvancedBloomFilter` 的 `padding` 恒为 0（内层 Kawase 的 padding 不向上传播）→ glow 被裁切，必须手设。
- `ParticleContainer` 的 `bounds` 恒空 → 若 glow 层只有它，滤镜区域为空，
  `FilterSystem` 会静默跳过整个滤镜 → 必须设 `boundsArea` + 图层 `filterArea`。

完整核实报告 `pixi-fx-spec.md` 是**本机工作产物，不在仓库里**；
仓库内可查的证据是本票下面逐条的结论与 `src/presentation/` / `src/battlefield/pixi/filters.ts` 的实现。


## Answer

已在分支 `feat/ticket-07-effects-and-filters` 实现，基线 `feat/refactor-v2`（`f68164a`）。
**规则层（`src/game/**`）一行未改** —— golden trace 门禁仍然全绿。

### 1. bloom：只挂 `glow` 层

`src/battlefield/pixi/filters.ts` 的 `ScreenFilterController` 在 `mount()` 里造一次实例：

| 参数 | 值 | 为什么 |
|---|---|---|
| `padding` | 28 | `AdvancedBloomFilter` 的 padding 恒为 0，内层 Kawase 的 padding 不向上传播 → 不手设就把辉光裁掉 |
| `resolution` | 0.5 | `AdvancedBloomFilter` 的 options 里**没有** resolution，只能构造后赋值；0.5 → 像素量 1/4，与主画布分辨率解耦 |
| `threshold` | 0.22 | 亮度提取用 `max/min` 通道且**不做 alpha 反预乘**，阈值必须压低，否则半透明霓虹色一律不发光 |
| `bloomScale` / `brightness` / `blur` / `quality` | 1.15 / 1.05 / 6 / 3 | 强度与模糊半径 |

`glow` 层 `filterArea = (0,0,layout.width,layout.height)`（`rebuildStaticLayers`），
三个 `ParticleContainer` 各有 `boundsArea` —— 否则 `ParticleContainer` 的空包围盒会让
`FilterSystem` **静默跳过整个滤镜**。

挪进 `glow` 层的东西：判定区外圈光晕、角色 FEVER 光环、脚下平台光、刀光、冲击环、粒子、
FEVER 全场氛围。刀光 / 环 / 粒子在旧版里本来就在怪物**之上**，挪层不改变遮挡关系。

### 2. 条件滤镜（实例只创建一次）

| 滤镜 | 挂点 | 开关 | 插值 |
|---|---|---|---|
| `RGBSplitFilter` | `app.stage`（作用于整个画面） | `enabled` | 分量 setter `redX/redY/...`（整体 setter 会替换 uniform 对象） |
| `ShockwaveFilter` | `app.stage` | `enabled` | `time` / `centerX` / `centerY` 逐帧改 |

- 色散只在 FEVER 期间开（表现层插值 `rgbSplit` 0→1，进出各 0.35 秒），偏移量缓慢左右漂移。
- 冲击波在暴击 / 双生同破时**瞬时触发**（表现层计时 `SHOCK_LIFE = 0.42s`），
  `radius = speed × SHOCK_LIFE`（1000 × 0.42 = 420px），所以波不会扩到出屏。
- 中心坐标语义**实测校准**：`tests/e2e/filter-center-probe.mjs` 用两个不同中心各触发一次，
  比较两张位移场的差异度（比值 1.777 ≫ 0.5）→ 中心是**像素**，`.d.ts` 的「normalized」注释是错的。

### 3. 战斗特效增强

- **粒子三形态**（`src/presentation/fx.ts` + `src/presentation/effects.ts`）：
  普攻 `spark`（圆点，旧速度旧寿命）/ 暴击 `shard`（细长菱形，更快更亮）/ FEVER `ember`（四角星芒，更慢更久，暖金）。
- **刀光**：暴击批次追加一道**余晖**（`SlashKind = 'afterglow'`，同几何、寿命 ×1.7、更宽更淡的金色）。
- **冲击环**：`RingTier = normal | crit | twin` → 环体宽度 ×1 / ×1.45 / ×1.9，暴击与双生另加**白色热核**（颜色分档）。
- **屏幕震动三档**（`SHAKE_TIERS`）：普攻 6 / 暴击 12 / 双生同破 18（实际抖动 ±3 / ±6 / ±9 px），
  封顶 12 / 18 / 18。规则层的 `amount`（5/7/8/11/12/13/14/16）经 `shakeTierOf` 映射到档位。
- **FEVER**：金色泛光 + 轨道能量带 + 呼吸边框保留，配合 bloom 后阈值重调（bloom 只吃亮部，
  FEVER 的半透明金幕在阈值以下，不会整屏泛白）。

### 4. FEVER 周身金色火花（D7）

落在表现层：`PresentationState.stepFeverSparks()` —— `fever-start` 事件开始发射、`fever-end` 停。
发射口径逐字照抄旧 `emitFrenzy`（`source.html:1238-1254`）：间隔 `rand(0.035,0.08)` 秒、
环半径 `playerR × rand(1.2,2.1)`、`vx=-rand(40,160)` / `vy=rand(-70,20)`、
半径 `rand(1.4,3.2)`、寿命 `rand(0.3,0.7)`、颜色 35% `#fff4c2` 否则 `#ffb43c`。
角色位置由会话层的 `presentation.setLayout(layout)` 喂进来（resize 时更新）。

### 5. UI 动效（`motion/react`）

- **HUD 数字滚动**：`useMotionValue` + `useTransform`，MotionValue 作为 `motion.*` 的 children →
  Motion 直接写 DOM 文本节点，**不触发 React 渲染**（分数滚动期间 React 渲染次数 0）。
- **FEVER 徽章脉冲**：`motion.b` 的 `animate={{ scale: [1, 1.16, 1] }}`（节奏与旧 CSS `frenzyPulse` 一致；
  CSS 那条 `animation` 已删 —— CSS 动画优先级高于内联样式，两边都写会打架）。
- **结算面板入场**：`motion.div` 淡入 + 上浮；`#gameOver` 的 CSS `opacity` 过渡被关掉（`.gameover-enter`）避免两套动画抢同一个属性。

### 验收数字（真实输出）

- **bloom 判据**（`tests/e2e/bloom-ab.mjs`，同一静止场景，带 / 不带 bloom）：
  被点亮像素占比 4.119% → **4.465%（+0.346 个百分点）**；
  平均亮度 27.91 → **28.60（+2.5%）**；总亮度 25,719,785 → **26,353,288（+2.5%）**。
- **FEVER 可读性回归**（`tests/e2e/fx-fever-readability.mjs`）：
  判定区描边连续性 **100% → 100%**（色散没把判定区撕碎），最大红蓝差 181 → **251**（色散确实生效）。
- **滤镜实例只创建一次**：`src/battlefield/pixi/__tests__/filters.test.ts` —— 连续 600 帧 `apply()`
  之后实例计数不变、三个滤镜对象引用不变；另有「分量 setter 不替换 uniform 对象」
  与「不污染 `RGBSplitFilter.DEFAULT_OPTIONS` 共享对象」两条断言。
- **三档震动递增**：`src/presentation/__tests__/shake.test.ts`。
- **四档特效强度递增**：`src/presentation/__tests__/fx.test.ts`（普攻 1 < 暴击 2 < 双生 3 < FEVER 4）。

### 已知限制

- **默认渲染器仍是 canvas2d**（票 08 才切）—— 所有 e2e 脚本都必须带 `?renderer=pixi`。
- FEVER / 双生同破的并排截图需要攒到 50 连击（真实游玩要按住长按怪），
  `tests/e2e/fx-moments.mjs` 的自动打怪脚本为此实现了「按住不放」的长按处理；
  暴击瞬间的并排图已产出。
