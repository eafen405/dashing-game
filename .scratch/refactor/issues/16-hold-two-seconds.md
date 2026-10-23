# 16 — 长按贯穿时间从 3 秒改为 2 秒

Status: resolved
Blocked by: (none)

## 需求

长按怪的长按时间缩短为 2 秒（其余奖励与判定不变）。

## 实现

- `LONG_HOLD_TIME: 3 → 2`。长按进度条、HUD 提示、起手 toast 都读同一个常量，自动跟随。
- 1 秒中间奖励保持原样：2 秒里正好是半程，头 / 1 秒 / 尾三段各 +200 不变。
- 开始页说明改成「按住 2 秒贯穿」。
- 新增精确用例：按住 1.95 秒未完成，补满 2 秒后贯穿完成。

## 验证

- 194 tests / 19 files 全绿（tick 24 条）；typecheck、lint 通过。
- build + single-file 校验通过。
