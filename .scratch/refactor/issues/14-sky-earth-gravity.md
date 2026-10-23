# 14 — 天空与大地的双轨：默认在下轨跑，上跳约 1 秒后受重力落回

Status: resolved
Blocked by: (none)

## 需求

1. 两条轨道是上下的关系，不是左右两条路：上轨是天空，下轨是大地。
2. 角色有重力，默认在下轨的地面上跑。
3. 上跳打上轨怪，约 1 秒后掉回下轨；下轨才是落脚点。
4. 打击 / 漏怪 / 受伤的判定规则保持不变。

> 本条取代 ticket 13 里「地面铺满画面、左右双路」的读法：13 的地面保留为
> 下轨的大地，上半屏恢复成天空。

## 实现

- 规则层：
  - `GameState.airT`（上跳滞空剩余秒数），`TOP_AIR_TIME = 1`。
  - 出招 `strike()`：打上轨时从下轨起跳给满 1 秒，已在空中不刷新（重力不会因挥棒重置）；
    打下轨立即结束滞空（`airT = 0`）。
  - `tick()` 新增「滞空 / 落地」段：每步扣 `airT`，到 0 时 `playerLane` 改回 `'bottom'`；
    长按悬浮（`holdMonsterId !== null`）不消耗滞空时间，结束后下一次 tick 落回。
  - 初始 / 重置状态的 `playerLane` 改为 `'bottom'`。
  - 碰撞条件不变：`mateId !== null || playerLane === null || playerLane === m.lane`。
- 表现层：
  - `PlayerView` 以 `airT` 驱动一条对称抛物线：`p = 1 - airT / 1`，
    `y = bottomY - (bottomY - topY) * 4p(1-p)`；0.5 秒到最高点（脚底贴上轨），1 秒落回下轨。
  - `airT` 被下轨出招 / 长按结束提前打断时，改用 `FALL_GRAVITY = 2400 px/s²`
    从当前高度自由落体，落到下轨触发落地压缩与尘环（`LAND_DUR = 0.18s`）。
  - 只有站在下轨地面（`onGround`）才摆腿走路；空中有收腿 + 轻微前后倾的姿态。
  - 角色在下轨时地面接触光常亮；空中有投在下轨地面的高度阴影（越高越小越淡）。
  - 背景恢复上轨以上的星空，删掉中间那条地平线；`ground.ts` 重写为大地下缘：
    上缘贴在 `laneGroundY(layout, 'bottom')`，深土渐变 + 层理 + 会滚动的碎石；
    不再铺满画面。
  - 只有下轨在地面上：上轨的怪与长条怪不再投影；防线只画下轨接触平面。
- `FrameView` / `FrameContext` 增加 `playerLane` / `playerAirT`；
  `GameSession.emitFrenzy()` 的粒子环改到角色所在轨道，避免在空中炸开。

## 验证

- 193 tests / 19 files 全绿；typecheck、lint、build、single-file 校验通过。
- 新增用例：
  - 默认下轨，上轨漏怪从头顶飞过不扣血、只清连击；
  - 上跳 1 秒后 `playerLane` 回到 `'bottom'`、`airT` 归零；
  - 空中改打下轨立即结束滞空。
- Playwright 帧序列（点击上轨后 250 / 500 / 820 / 1170 ms）：
  起跳 → 脚底贴上轨 → 空中下落 → 落回下轨。
- 空中点下轨：角色从半空加速下坠并做下砸动作。
- 暂停时 `frameDt` 返回 0，跳跃 / 下落 / 落地压缩全部冻结。
- 30 秒实际游玩无 console error / pageerror；分数、暴击 / 普攻计数正常累计。
