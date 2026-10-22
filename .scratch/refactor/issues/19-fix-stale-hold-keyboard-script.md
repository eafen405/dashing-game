# 19 — 修复过期的键盘长按怪脚本

Status: ready-for-agent
Blocked by: (none)

## 现象

`tests/e2e/hold-monster-keyboard.mjs` 现在**跑不过**（2026-10-22 实测）：

```
✗ 键盘长按怪检查失败：Error: 游戏在长按怪出现前就结算了
```

它是手动脚本，不在 `npm run test:e2e` 里，所以票 16 / 17 改完长按之后没人发现。

## 三处过期

1. **长按时长**：票 16 把 `LONG_HOLD_TIME` 从 3 改成 2（`src/game/constants.ts:42`），
   toast 文案也跟着变成「长按中… 保持 2 秒」（`src/game/rules/resolve.ts:466`）。
   脚本的文件头、断言消息、`waitToast` 的 12 秒超时全都按 3 秒写的。
2. **判定框位置**：票 17 把判定框挪到棒尖
   （`hitX = playerX + playerR * CLUB_REACH_R`，1280×665 下 430 → 250）。
   怪要走到更靠左的位置才进判定区，等待窗口因此变长。
3. **脚本自己不打普通怪**：它只按住方向键等长按怪刷新，期间普通怪全部漏过掉血。
   判定框左移之后这段时间更长 → **玩家在长按怪到判定区之前就结算了**（就是上面那句报错）。

## 要做

1. 让脚本能撑到长按怪进判定区：等待期顺手清掉普通怪
   （复用 `tests/e2e/fx-moments.mjs` 里的 `AUTO_PLAY` 自动打怪片段），
   或把难度 / 起始节奏调到能活到长按怪出现。
2. 长按时长按 `LONG_HOLD_TIME`（2 秒）改文案与超时，不要写死 3。
3. 分数增量按当前常量核对（`LONG_HEAD_GAIN` / `LONG_1S_GAIN` / `LONG_TAIL_GAIN`，
   见 `src/game/constants.ts:44-46`）。
4. 脚本文件头「要证明的事」那段引用的是 `brief-05 §4`，已不是现行依据 —— 改成指向票 16 / 17。

## 验收

- [ ] `node tests/e2e/hold-monster-keyboard.mjs` 通过。
- [ ] 连续跑 3 次都通过（长按怪是概率性刷新的，判据不能只靠一次运气）。
- [ ] 脚本里不再出现「3 秒」。

## 备注

- 桌面键盘是**有文档的输入路径**（README 玩法表 / `tests/e2e/input-desktop.mjs`），
  长按怪的键盘路径不该没有回归覆盖。
- 另一条路是删掉这个脚本（长按怪已有 `fx-moments.mjs` 覆盖），但那样键盘长按就完全没测了
  —— 不建议。
- 本票与票 20 相互独立，但建议在票 20 把它接进 CI 之前先修好。
