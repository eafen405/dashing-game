# 双轨打怪 重构规格

## 背景

`source.html`（2683 行）是整个游戏：CSS 268 行 + 一个包含约 120 个函数、45 个可变全局变量的 IIFE。
Canvas 2D 绘制全部战斗内容，DOM 负责 HUD 与覆盖层。零外部资源、零音频、零构建。

重构目标已通过一轮设计访谈确定，决策记录在 `docs/adr/`，术语在 `GLOSSARY.md`。

## 目标

- **主线：可维护性** —— 把 2314 行命令式 JS 拆成可单测的纯函数规则层 + 声明式 UI，并留出后续加玩法的插槽。
- **验收项：画面翻新** —— 战斗特效与全屏后处理（bloom 辉光）落地，暴击 / FEVER / 双生瞬间的表现力明确提升。

## 非目标

- 不换视觉风格（保持赛博霓虹）。
- 不做音效（已裁决推迟）。
- 不改玩法规则、数值、手感（1:1 复刻，差异显式记账）。
- 不做 3D 化。
- 不引入端到端测试（第二阶段再议）。

## 已完成的验证（Phase 0 Spike）

最小 Vite 8 + React 19 + Pixi 8 工程已跑通，`scripts/verify-single-file.mjs` 在 headless Chromium 下以 `file://` 打开产物验证通过：

| 验证项 | 结果 |
| --- | --- |
| Pixi 渲染器 | `webgl`（`preference: 'webgl'` 锁定，规避 WebGPU 在 `file://` 下的不稳定性） |
| `localStorage` 读写 | ✓ |
| 画面实际渲染 | ✓（截图确认，非空画布） |
| 外部网络请求 | 0（仅 1 个 `file://` 自身） |
| 产物自包含 | ✓ `dist/index.html` 单文件，729 KB，无外部 `src`/`href`、无裸 `import` |

Firefox / Safari 未在本机验证（Playwright 缓存里只有 Chromium），留待实机阶段。

## 架构决策

| 议题 | 决策 | 记录 |
| --- | --- | --- |
| 构建分发 | Vite + React 项目，产物用 `vite-plugin-singlefile` 打成开盖即食单文件 | ADR-0001 |
| 战场渲染 | PixiJS v8 承载，React 只管 DOM UI，不用 `@pixi/react` | ADR-0002 |
| 状态分层 | 规则层纯函数不可变 + 表现层可变，两层分离 | ADR-0003 |
| 性能策略 | 以结构保证，不做基准测试循环 | ADR-0004 |

## 分层

```
React DOM 层   HUD / 菜单 / 结算 / 竖屏提示   低频，订阅 hudStore（脏检查）
     ▲ 只读快照
规则层 game/   纯函数 tick(state,dt,rng)，带种子 PRNG，无 DOM 无 Pixi    60fps
     ▲ 事件
表现层         particles / slashes / rings / floaters / shake，可变      60fps
     ▲ FrameView
战场层         BattlefieldRenderer 接口，canvas2d/ 与 pixi/ 两套实现      60fps
```

## 目录结构

```
src/
├── main.tsx
├── app/            App · GameSession · screens/ · hud/
├── game/           规则层：constants · types · state · rng · layout · reducer · rules/
├── presentation/   表现层：effects · shake · hudStore
├── battlefield/    types（接口）· palette · canvas2d/ · pixi/{views,filters,layers}
├── input/          pointer · keyboard · orientation
└── styles/
```

## 迁移阶段

| 阶段 | 内容 | 票 |
| --- | --- | --- |
| 1 地基 | ESLint / Prettier / Vitest / CI | 01 |
| 2 规则层纯化 | 剥出 `src/game/` 全部纯函数 | 02 |
| 2 保真门禁 | golden trace 对照 | 03 |
| 3 渲染器搬迁 | Canvas 2D 绘制代码搬进 `src/battlefield/canvas2d/` | 04 |
| 3 UI React 化 | HUD / 菜单 / 结算 / 暂停 / 竖屏提示 | 05 |
| 4 Pixi 迁移 | 12 个 view 逐个改写 | 06 |
| 4 特效接入 | bloom 图层 + 条件滤镜 | 07 |
| 5 收口 | 默认切 Pixi，删 canvas2d | 08 |
| 6 画面打磨 | 按验收标准调特效 | 09 |
| 7 交付 | 产物校验脚本入 CI、README 改写、CHANGELOG、删 `source.html` | 10 |

## 保真验证

1. 给旧 `source.html` 打补丁：把 `rand()` 换成带种子 PRNG，并记录事件流（每次 strike 的轨道与时刻）。
2. 新规则层回放同一种子、同一事件流，产出每帧 `hp / score / combo / kills / 怪物位置`。
3. 两条 trace 逐帧 diff，必须完全一致。CI 门禁。

这是**行为正确性**校验（headless、无渲染、毫秒级），不是性能测量。

## 性能约束

帧预算 16.67ms @60fps：规则层 ≤1ms，表现层 ≤2ms，Pixi 渲染 ≤10ms，React/DOM ≤1ms，余量 ≥2ms。

以结构保证，不做基准测试：固定帧预算、规则层与表现层分离、粒子与刀光用对象池、Pixi 侧复用 `Graphics` 实例、静态图层仅在 resize 时重建、bloom 只挂 `glow` 图层。开发期提供轻量 FPS / 帧时挂件作观察手段，CI 不做性能断言。

必须消除的已知结构性问题：

- `source.html:1989` 怪物绘制循环内的 `monsters.indexOf`（O(n²)）
- `source.html:1633` 每帧每轨的 `monsters.some` 扫描
- `source.html:978` 等 7 处用 `filter` 重建 `monsters` 数组
- `source.html:1276` 每帧调用 `syncHUD()`（改为事件驱动订阅）

## 已知行为差异

| 差异 | 判定 | 说明 |
| --- | --- | --- |
| 长按怪刷新频率 | **不修（D1 误判，已回退）** | 旧 `clearLane()` 的空轨语义是正确的：`some()` 逐轨判断，普通怪只占自己那条轨；只有两轨都有怪时才推迟刷新。曾按「只算长按怪占用」修复，结果长按怪刷进有普通怪的轨道，而 `pressLane()` 让长按逻辑优先吞掉整轨输入 —— 普通怪进了判定区也点不动。现已恢复空轨判断；实测 900×405、正常游玩约 20–22 秒一只。进 CHANGELOG。 |
| `README.md:18` 上轨笔误 | 修 | 两句都写成"打下轨"，第一句应为"上轨" |
| `zero-build zero-dependency` 表述 | 删 | 产物形态已变，见 ADR-0001 |

## 参考

- `GLOSSARY.md` —— 领域词汇（轨道 / 怪物 / 判定区 / 双生 / 长按怪 / 漏怪 / 失误 …）
- `docs/adr/0001-vite-react-build-with-single-file-output.md`
- `docs/adr/0002-pixijs-renderer-with-react-dom-ui.md`
- `docs/adr/0003-rules-immutable-presentation-mutable.md`
- `docs/adr/0004-performance-by-construction-not-by-benchmark.md`
