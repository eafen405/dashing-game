# 18 — 修复 CI 红：`hud-stats` 的隐含帧率断言

Status: ready-for-agent
Blocked by: (none)

## 现状

`origin/feat/refactor-v2` @ `cf3051b` 的 CI **是红的** ——
[run 39773140165](https://github.com/eafen405/dashing-game/actions/runs/39773140165)
的「端到端检查」步骤失败，`npm run trace` 步骤被跳过。

`handoff.md` 与票 10 的 Answer 都写着「CI 全绿」，与事实不符。失败点只有一个：

```
✗ HUD 统计检查失败：Error: 断言失败：静置 30 秒跑了 410 帧（确实在跑）
```

## 根因

`tests/e2e/hud-stats.mjs:134`：

```js
assert(a.stats.publishes > 600, `静置 30 秒跑了 ${a.stats.publishes} 帧（确实在跑）`);
```

这条断言**名义上**判「游戏循环在跑」，**实际上**是一条**帧率下限**
（600 次 / 30 秒 = 20fps）。判据绑在「跑测试那台机器有多快」上，与被测代码无关。

- 票 08 之前默认渲染器是 Canvas 2D；票 08 之后是 Pixi/WebGL。
- CI 跑在 GitHub 的 `ubuntu-latest` 上，WebGL 走 SwiftShader **软件光栅**。
- 实测（2026-10-22）：CI 上 30 秒只有 **411 帧（≈13.7 FPS）**；
  本机同一条命令有 **876 帧（≈29 FPS）**。`publishes` 与 `frames` 几乎相等
  （CI：410 / 411），因为 `hudStore.publish()` 本来就是每帧调一次
  （`src/app/hud/hudStore.ts:124`）。
- 410 < 600 → 红。

补充事实：同一条断言在 `c7a7bcd`（默认渲染器还是 Canvas 2D）时 CI 是**绿的**
（[run 39606233508](https://github.com/eafen405/dashing-game/actions/runs/39606233508)），
`cf3051b` 变红 —— 渲染路径切到 WebGL + 场景变重（地面 / 角色 / 木棒）之后，
软件光栅撑不住 20fps。**但这不改变结论**：判据本来就不该跟机器速度挂钩。

## 与 ADR-0004 冲突

`docs/adr/0004` 写死：「开发期只提供一个轻量的 FPS / 帧时挂件作为观察手段，
**CI 不做性能断言**」。当前这条断言就是性能断言。

## 要做

1. 把 `publishes > 600` 改成**结构性**判据（判「循环在跑」，不判「跑多快」）：
   - `publishes > 0` —— 循环没冻；
   - `publishes >= frames * 0.9` —— 每帧发布一次（这是**结构**，与机器速度无关）；
   - 绝对下限放到任何环境都够得着的高度（例：30 次 / 30 秒 ≈ 1fps），只当「没冻」的保险丝。
2. 通读 `hud-stats.mjs`，把其余**绝对帧数**判据一并改成相对判据。
3. 在文件头写清楚这条判据的**意图**：「证明 HUD 不随帧重渲染」是结构判据，
   「跑多快」不是 CI 的职责（ADR-0004）。现在的注释容易让人以为 600 是随手写的。
4. 本机复跑 `npm run test:e2e` 确认通过。

## 验收

- [ ] `npm run test:e2e` 本机通过。
- [ ] 人为把阈值调到远高于本机帧率（例如 5000）时，**不再**因帧率不足失败 ——
      证明判据已经与机器速度解耦。
- [ ] CI 在 `cf3051b` 上重新变绿，且 `npm run trace` 步骤不再被跳过。
- [ ] 代码里能看出遵守了 ADR-0004 的「CI 不做性能断言」。

## 备注

- **不要**为了「让 CI 绿」去优化 SwiftShader 下的帧率 —— 那是软件光栅的固定成本，
  与真机性能无关，ADR-0004 已明确拒绝基准循环。
- 本票是**合并到 `main` 的前置条件**（票 21）。
