# 双轨打怪 (Dual-Rail Monster Slayer)

一款双轨道点击战斗小游戏：怪物沿上下两条轨道自右侧袭来，角色在**判定区**内**出刀**迎击。

源码是标准的 Vite + React + TypeScript 工程，但**构建产物仍是单个 HTML 文件** ——
双击 `dist/index.html` 即可离线游玩，不需要服务器、不需要联网。

本次重构只换实现、不换玩法：规则与数值保持 1:1，重构带来的每一条行为差异都记在
[CHANGELOG.md](CHANGELOG.md) 里。

## 运行

### 玩（发布形态）

```bash
npm install
npm run build
```

产物是 `dist/index.html` —— 一个**自包含**的 HTML 文件（JS 与 CSS 全部内联，无任何外部引用）。
双击用浏览器打开即可离线游玩。

### 开发服务器

```bash
npm install
npm run dev
```

Vite 开发服务器默认监听 <http://localhost:5173>，改动即时热更新。
战场由 PixiJS v8 渲染（唯一渲染路径，见[技术架构](#技术架构)）。

### 操作

- **手机**：仅支持横屏，竖屏会显示旋转提示页；点击屏幕开始。
- **桌面**：`↑` / `W` 控制上轨，`↓` / `S` 控制下轨，`P` 暂停，`Enter` / `空格` 开始或重开，
  右上角可切换全屏。

跨局**最高分**存放在 `localStorage["dualrail_best"]`。

## 玩法

| 规则 | 说明 |
| --- | --- |
| 轨道 | 战场分**上轨**与**下轨**两条水平通路；怪物只沿轨道移动，出刀只对轨道生效 |
| 出刀 | 怪物进入判定区时，点击**上半屏**打上轨，点击**下半屏**打下轨 |
| 普攻 | 出刀击破怪物、但落点不在暴击区内：**200 分** |
| 暴击 | 出刀击破怪物、且落点位于判定区中央的暴击区（约五成宽度）：**300 分** |
| 漏怪 | 怪物越过判定区抵达角色：失去 **20 点血量**，初始 **250** |
| 失误 | 出刀时机不对或长按未完成：**连击**清零，**不扣血** |
| 连击 | 连续成功的击破所累积的计数，失误会使其归零 |
| FEVER | 每累计 **50 连击**触发 FEVER，持续 **10 秒**，期间得分 **×1.5** |

### 特殊敌人

- **双生**：一对锁链相连、分别占据上下两轨的怪物。需要在同一个时间窗（**0.18 秒**）内两轨
  先后各击中一次：成功 **700 分**（两轨都打进暴击区 **1000 分**）；只破一只的话，另一只会自爆
  并扣 **20 血**。
- **长按怪**：一种细长的怪物。头部进入判定区后按住对应半屏**起手**，持续按住 **2 秒**贯穿，
  头部 / 按住满 1 秒 / 尾部各 **+200** 分。放弃或按住不足即告失败：**连击**清零、FEVER 中断，
  **不扣血**。

### 难度星级

难度星级在开局前选择，决定刷新频率与移速倍率。

- **★ 1 星** —— 标准节奏
- **★★ 2 星** —— 刷新速度 ×2，移速与最终上限 ×1.5

## 开发流程

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装依赖 |
| `npm run dev` | 启动 Vite 开发服务器（热更新） |
| `npm run build` | 构建单文件产物 → `dist/index.html` |
| `npm run preview` | 本地预览构建产物（`http://localhost:4173`） |
| `npm run verify` | 校验产物：自包含检查 + `file://` 下可运行检查 |
| `npm test` | 单元测试（Vitest） |
| `npm run test:watch` | 单元测试 watch 模式 |
| `npm run test:e2e` | 端到端检查（Playwright 驱动 `file://` 产物）**需先 `npm run build`** |
| `npm run test:visual` | 特效视觉验收（特效脚本 + 验收拼图）**需先 `npm run build`** |
| `npm run trace` | 黄金轨迹保真门禁：旧版 harness × 新规则层逐帧比对 |
| `npm run typecheck` | TypeScript 类型检查（`tsc --noEmit`） |
| `npm run lint` | ESLint 检查 |
| `npm run format` | Prettier 格式化（`prettier --write .`） |

`npm run verify` 分两步：先用静态检查确认产物自包含（无外部 `src`/`href`、无裸 `import`），
再用 Playwright + Chromium 以 `file://` 打开产物，验证画布真的画出了东西、`localStorage`
可读写、且没有发起任何外部网络请求。产物体积超过 **1,200 KB**（gzip **380 KB**）时
会打印告警（不阻断构建），提示检查 Pixi / React 是否被整包引入。

`npm run trace` 是**行为正确性**门禁，不是性能测量：旧版 `source.html` 的 harness 与新规则层
喂同一种子、同一份事件流，逐帧比对快照（离散字段逐位相等，连续字段 1e-9 容差）。

`npm run test:visual` 是**特效视觉验收**门禁（票 20）：6 个脚本定点注入特效并量像素
（bloom 开/关的亮度与面积、FEVER 判定区描边连续性、冲击波中心、2×2 验收拼图、真实对局并排、
键盘长按怪）。判据都是**相对 / 结构性**的，不绑机器速度；截图落在 `dist/e2e-shots/`，
CI 会把它作为 artifact 上传（`dist/` 被 gitignore，不留档就看不见）。

CI 跑的就是这条流水线：typecheck → lint → test → build → verify → e2e → visual → trace。
其中 `visual` 在 CI 里是**独立一个 job**（与主流水线并行）—— 视觉脚本在软件光栅下慢，
单独一个 job 才不会挤掉主流水线的 30 分钟预算。

## 技术架构

游戏分四层，边界由接口划定：

```
React DOM 层   HUD / 菜单 / 结算 / 竖屏提示   低频，订阅 hudStore（脏检查）
     ▲ 只读快照
规则层 game/   纯函数 tick(state,dt,rng)，带种子 PRNG，无 DOM 无渲染器    60fps
     ▲ 事件
表现层         particles / slashes / rings / floaters / shake，可变      60fps
     ▲ FrameView
战场层         BattlefieldRenderer 接口，PixiJS v8 唯一实现                 60fps
```

- **规则层**（`src/game/`）：血量、分数、连击、FEVER、怪物生命周期与移动、生成与结算。
  纯函数、状态不可变、随机数来自可注入的带种子 PRNG —— 因此完全可复现、可单测。
- **表现层**（`src/presentation/`）：粒子、刀光残影、冲击环、飘字、屏幕震动。
  可变对象逐帧原地更新，不进入 React 渲染路径。
- **战场层**（`src/battlefield/`）：把战斗内容画出来的部分，抽象成 `BattlefieldRenderer` 接口。
  唯一实现是 PixiJS v8（`src/battlefield/pixi/`），默认带 bloom / 色散 / 冲击波后处理。
- **React DOM 层**（`src/app/`）：HUD、开始界面、暂停、结算、竖屏提示。
  只订阅规则层派生出的 HUD 快照，且只在相关数值变化时才通知 —— 不做 60fps 的 React 协调。

### 为什么产物是单文件

`vite-plugin-singlefile` 把打包后的 JS 与 CSS **全部内联**进一个 `dist/index.html`，
产物没有任何外部引用，双击就能离线玩 —— 这条「发给别人一个文件就能玩」的传播路径
不能丢。代价是仓库本身不再是「零依赖、零构建」：开发期需要 `npm install` 与一条构建命令。
这个取舍记在 [ADR-0001](docs/adr/0001-vite-react-build-with-single-file-output.md)。

## 仓库结构

```
.
├── src/                 # 游戏源码（Vite + React + TypeScript）
│   ├── app/             # 会话层与 React DOM 界面（HUD / 菜单 / 结算）
│   ├── game/            # 规则层：纯函数，不碰 DOM 也不碰渲染器
│   ├── presentation/    # 表现层：粒子 / 刀光 / 冲击环 / 飘字 / 震动
│   ├── battlefield/     # 战场层：BattlefieldRenderer 接口 + PixiJS v8 实现
│   ├── input/           # 输入映射：指针 / 键盘 / 屏幕方向
│   └── styles.css
├── tests/
│   ├── e2e/             # Playwright 端到端检查（跑的是构建产物）
│   └── tooling/         # 工具链自身的约束测试
├── scripts/             # 产物校验、黄金轨迹门禁、截图对比
├── docs/adr/            # 架构决策记录
├── docs/agents/         # issue tracker、triage 标签、领域文档的约定
├── source.html          # 旧版单文件实现 —— 保真参照物，只读不改
├── GLOSSARY.md          # 领域词汇
├── CHANGELOG.md         # 行为差异记账
└── README.md
```

`source.html` 是重构前的单文件实现，保留下来作为**黄金轨迹保真门禁**与端到端对照的参照物，
只读不改。

## 约定文档

- 领域词汇：[GLOSSARY.md](GLOSSARY.md) —— 轨道 / 判定区 / 出刀 / 漏怪 / 失误 / 双生 / 长按怪 …
- 架构决策：[docs/adr/](docs/adr/)
- Issue 采用本地 markdown 管理（`.scratch/<feature>/`），约定见
  [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)
