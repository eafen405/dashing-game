# 12 — 角色重做：棒子人动作 + 触碰式受伤

Status: resolved
Blocked by: (none)

## 需求

1. 角色从抽象光球改成会走路的棒球人（棒球帽 / 红球衣 / 木棒）。
2. 上轨攻击：跳起 + 向上挥棒。
3. 下轨攻击：原地抡起后向下砸。
4. 双生击破：大幅跳起，落下时下砸。
5. 长按怪：悬浮在对应轨道上方，棒子连续向下击打。
6. 受伤改为**触碰**判定：角色只驻守一条轨道，另一轨漏怪擦身而过 —— 不扣血，
   但连击 / FEVER 清零；同轨漏怪仍然扣血。双生两轨各有一只，触线必定撞上角色。
7. 长按怪自身的机制（头 / 1 秒 / 尾判定、不伤人等）本轮不改。

## 实现

- 规则层 `GameState.playerLane`：`null` = 尚未出招、两轨都会撞；否则只有该轨漏怪会碰撞。
  - `strike()` / `startHold()` 设置驻守轨道。
  - `tick()` 触线时计算 `collides = 双生 || playerLane === null || playerLane === m.lane`。
  - `hurtPlayer(state, id, collides = true)`：`collides=false` 只清 combo / FEVER，
    并在怪物位置放灰蓝爆点 + `错过 · COMBO 清零` 飘字，不闪红、不震动、不扣血。
- 表现层 `pair-smash` 事件 → `PresentationState.pairSmashT`（0.62 s）→
  `FrameView.pairSmash` 归一化进度 → `PlayerView` 的双生跳砸动作。
- `PlayerView` 重写为棒子人：
  - 换轨：`displayY` 指数平滑，腿随视觉时钟摆动，走出「会走路」的感觉。
  - 上轨：蹲身 → 跳起 → 上挥棒（收在 -1.05 rad，避免棒尖顶到舞台边缘）。
  - 下轨：抡到头顶 → 下砸。
  - 双生：蓄力 → 2.5R 跳起 → 落地下砸 + 冲击环。
  - 长按：悬浮 1.15R，收腿、脚下留阴影，按 0.24 s 周期连续下砸 + 绿色冲击带。
  - 挥棒残影从「大扇形填充」改为三道淡棒影 + 细弧线，不再遮住角色。
  - 生命环 / FEVER 光环跟随身体，不再留在轨道上。
- `FrameView` 新增 `playerLane` / `pairSmash`；`FrameContext` 缓存
  `holdMonster`（正在被按住且未逃脱的长按怪），驱动悬浮连击。

## 验证

- 单测：`tick.test.ts` 新增驻守上轨吃下轨漏怪 / 驻守下轨吃上轨漏怪 /
  同轨漏怪扣血 / 双生必受伤 4 条；`resolve.test.ts` 新增擦身而过只断连击；
  `reducer.test.ts` 断言 `playerLane` 的初始值与出招 / 长按后的值；
  `state.test.ts` 覆盖 `pair-smash` 的触发、衰减与 reset。
- 渲染：`renderer.test.ts` 覆盖上轨出招 / 下轨 + 双生下砸 / 长按悬浮三帧。
- 190 tests / 19 files 全绿；typecheck、lint、build、single-file 校验通过。
- Playwright 冻结姿态截图逐项核对：待机、上挥、下砸、双生跳砸、长按悬浮连击；
  实际游玩 30 秒无 console error / pageerror。
