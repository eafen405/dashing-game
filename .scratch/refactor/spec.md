# 双轨打怪 重构规格

> **交接状态（2026-10-22）**：票 01–21 的工作全部完成 —— 票 18–20 的门禁收口已合进
> `feat/refactor-v2`，票 21 的 CHANGELOG / README 收口也已完成，成果**已备好待合并到 `main`**
> （开 PR / 合并由编排者执行）。剩余工作只有票 **22**：真机签字（60fps / 长按手感 /
> 浏览器兼容）—— 这一票必须人做。进度、验证基线与已知陷阱见 [handoff.md](handoff.md)。

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
战场层         BattlefieldRenderer 接口，PixiJS v8 唯一实现                  60fps
```

## 目录结构

```
src/
├── main.tsx
├── app/            App · GameSession · screens/ · hud/
├── game/           规则层：constants · types · state · rng · layout · reducer · rules/
├── presentation/   表现层：effects · shake · hudStore
├── battlefield/    types（接口）· palette · pixi/{views,filters,layers}
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

| # | 差异 | 判定 | 说明 | 验证方式 |
| --- | --- | --- | --- | --- |
| **D1** | 长按怪刷新频率偏低（**票 11 已回退 —— 现在与旧版一致，不再是玩家能察觉到的差异**） | **记账** | 旧版 `clearLane()`（`source.html:803`）用 `!m.done` 判轨道占用，而 `done` 只在长按怪上赋值 —— 看着像「普通怪也算占用」，其实**它是逐轨判断**的：普通怪只占自己那条轨，另一条仍可用，只有两轨都有怪时才返回「无空轨」。所以旧语义（**完全空轨**）本身是自洽的。票 02 曾把它改成「只算长按怪占用」（长按怪于是从约每 25 秒回到约每 20 秒），**票 11 已把这个改动从生产路径撤回** —— 改法会让长按怪刷进还有普通怪的轨道，而 `pressLane()` 优先走长按逻辑，那条轨的普通怪进了判定区也点不动（看起来像「判定坏了」）。今天的生产路径（`createGameState` 的 `legacyClearLane` 默认 `false`）与旧版**语义相同**，长按怪刷新节奏也相同。D1 的修法只作为 golden trace 的**对照变体**保留（`GameState.legacyClearLane`，只有回放器会打开），**不是产品行为**。 | 黄金轨迹**模式 B′**（旧版保留 bug × 新版生产路径）**逐帧一致** —— 这是「生产语义 == 旧版语义」的直接证据；**模式 C**（旧版保留 bug × 回放器的 D1 修法变体）报告第一处分叉并归因 D1：分叉落在**长按怪生成时机**那一帧，`rulesDraws` 的差值**小且随种子而变**（实测 1★ 三条轨迹是 2 / 1 / 1，2★ 三条轨迹也是 2 / 1 / 1），归因证据是「规则随机流错位」 |
| **D2** | 判定区 X 坐标的求值顺序 | **修** | `source.html:555` 的 `hitX` 用到了 `:560` 才算出来的 `playerX`，首次 resize 时 `playerX=0`。新实现 `computeLayout()` 按 `playerR → playerX → hitX` 的正确顺序重算。**实际影响范围仅限第一次 resize 的瞬时值** —— 旧代码的 `resize()` 会被调用多次（`:2665`/`:2666`/`:2667` + `updateOrientation` 里的 rAF 与两个 `setTimeout`），第二次之后 `hitX` 就是对的。 | 黄金轨迹模式 A：布局一致即逐帧一致；D2 补丁在旧 harness 上实测为**空操作**（证实影响仅限首帧） |
| **D3** | `done` / `dead` 两套语义交叉 | **修** | 旧代码 `done` 只在长按怪赋值（`:824`/`:1160`/`:1305`），`dead` 只在普通怪/双生赋值（`:930`/`:991`/`:1045`），两套语义交叉导致 `clearLane()` 与 `hasActivePair()` 口径不一致。统一为单一 `removed` 标志。 | 规则层单测 + 黄金轨迹模式 A |
| **D4** | `hasActivePair()` 的判定口径 | **修** | 旧实现用 `!m.done` 判双生占用（双生怪的 `done` 恒为 `undefined`）。改用 `removed` 统一口径。 | 规则层单测 + 黄金轨迹模式 A |
| **D5** | 顶部 HUD 统计项顺序 | **修** | 旧版顺序 `SCORE → COMBO → 暴击/普攻 → BEST`（`source.html:300-303`）。React 版曾把 `BEST` 提到 `COMBO` 前面，与旧版视觉不一致。**已记账并修正回旧顺序。** | DOM 文本顺序程序化比对 |
| **D6** | 固定随机种子 | **记账** | 新实现用固定种子（`DEFAULT_SEED`），每局完全一样，便于复现与 A/B 对照；旧版用 `Math.random()`，每局不同。 | — |
| **D7** | FEVER 期间角色周身的金色火花 | **已实现** | 旧 `emitFrenzy`（`source.html:1238-1254`）的周身火花由票 07 在表现层补齐（`PresentationState.stepFeverSparks()`），发射口径逐字照抄。规则层纯化阶段曾记为缺口。 | 代码口径对照 + 表现层单测 |
| **D8** | 旧 `setTimeout(resize, 70/260)` 兜底被取代 | **记账** | 改用 `ResizeObserver`。旧代码的两个 `setTimeout` 从不清理。 | — |
| **D9** | `quitToHome` 退出到主菜单 | **记账** | 旧实现是规则层的一个事件；新实现里由 UI 层（`GameSession.quitToHome()`）管理，规则层不感知。 | — |
| **D10** | `README.md:18` 上轨笔误 | 修 | 两句都写成"打下轨"，第一句应为"上轨" | — |
| **D11** | `zero-build zero-dependency` 表述 | 删 | 产物形态已变，见 ADR-0001 | — |
| **D12** | 长按贯穿时间 3s → 2s | 记账（用户要求） | 见票 16；harness 同步改为 2s，trace 仍逐帧一致 | 长按完成 / 失败 / 漏过覆盖计数 |
| **D13** | 判定区移到棒尖攻击范围 | 记账（用户要求） | 见票 17；`hitX = playerX + playerR * CLUB_REACH_R`，去掉飞行刀光 | `layout.test.ts` + 实机截图 |
| **D14** | 手机长按不再弹菜单 / 标记广告 | 修（用户要求） | 见票 15；舞台 `touchstart` / `touchmove` / `contextmenu` 阻止默认行为 | `pointer.test.ts` + 实机 |
| **D15** | 角色重做成棒子人 + 受伤改为「触碰」判定 | 记账（用户要求） | 见票 12；角色从持剑的发光人形改成会走路的棒球人（棒球帽 / 红球衣 / 木棒），攻击动作随之改变（打上轨 = 跳起上挥，打下轨 = 抡棒下砸，双生 = 大幅跳起落下砸，长按怪 = 悬浮连砸）。规则层新增 `playerLane` —— 另一轨漏怪**擦身而过不扣血**，只清连击 / FEVER；同轨漏怪仍扣血。 | `tick.test.ts` / `resolve.test.ts` / `reducer.test.ts` / `renderer.test.ts`（实机手感见票 22） |
| **D16** | 看得见的地面，角色走在陆地上 | 记账（用户要求） | 见票 13；脚下出现陆地与随世界左移的碎石，角色待机时持续摆腿，画面读成「角色持续向前走、途中遇到怪」。**只改表现**，不改打击 / 漏怪 / 受伤的规则；票 14 把它收窄为「下轨的大地」（见 D17）。 | Playwright 连续帧截图（腿 / 碎石 / 阴影）+ 暂停时地面像素差为 0 |
| **D17** | 天空 / 大地双轨与重力 | 记账（用户要求） | 见票 14；上轨 = 天空、下轨 = 大地，角色有重力、默认在下轨地面上跑；打上轨从下轨起跳约 1 秒后受重力落回，打下轨立即结束滞空，空中点下轨加速下坠。上轨漏怪从头顶飞过**不扣血**、只清连击。**判定规则本身不变。** | `tick.test.ts`（滞空 / 落回 / 空中改轨）+ Playwright 帧序列 |

### 不可观察的差异（10 条）

这些差异在**玩家可见层面**不产生任何差别（旧版与新版的输出逐位相同），
但内部实现不同，记账在此以免日后被当成"漏改"：

1. 已离场怪物在新侧滞留到下一 tick 开头才回收（旧侧当场 `filter`）。
2. `difficulty` 由 `now` 推导（旧侧独立变量）。
3. `dt` 钳制移进 `tick()`。
4. `spawnTimer` 的初值与重置时机等价化。
5. `best`（最高分）从规则层移到 HUD/存储层。
6. 视觉时间 `vt` 移出规则层（它与胜负无关）。
7. 粒子 / 刀光 / 冲击环 / 飘字从规则层移到表现层。
8. 震动强度 `shake` 从规则层移到表现层。
9. 随机数从 `Math.random()` 改为可注入的带种子 PRNG。
10. 特效参数由「效果事件」驱动，而非规则层直接调用渲染函数。

## 参考

- `GLOSSARY.md` —— 领域词汇（轨道 / 怪物 / 判定区 / 双生 / 长按怪 / 漏怪 / 失误 …）
- `docs/adr/0001-vite-react-build-with-single-file-output.md`
- `docs/adr/0002-pixijs-renderer-with-react-dom-ui.md`
- `docs/adr/0003-rules-immutable-presentation-mutable.md`
- `docs/adr/0004-performance-by-construction-not-by-benchmark.md`
