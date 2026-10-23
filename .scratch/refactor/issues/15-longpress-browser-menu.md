# 15 — 长按被打手机浏览器的「标记广告」菜单抢走

Status: resolved
Blocked by: (none)

## 需求

长按是长条怪的核心操作（按住 3 秒）。但 UC / 360 / 小米自带浏览器会在长按时弹出
「标记广告」/ 选词菜单，手指被浏览器接管，长按中断，长条怪判定失败。

## 实现

- `GameSession` 在游戏舞台上监听 `touchstart`（`passive: false`）并 `preventDefault()`：
  抑制 WebView 自带的长按手势 / 选词 / 上下文菜单。
  - 只接管舞台：`button / a / input / select / textarea / .overlay` 上的触摸直接放行，
    开始页难度按钮、暂停 / 结束页按钮的正常点击不受影响。
- 全局样式加固：`* { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none }`
  + `::selection` 透明；`.stage { touch-action: none }`。
- 原有 `contextmenu` 阻止、`touchmove` 阻止保持不变。

## 验证

- 193 tests / 19 files 全绿；typecheck、lint、build、single-file 校验通过。
- Playwright（`hasTouch` + `isMobile`，900×460）：
  - 舞台 `touchstart` 的 `defaultPrevented === true`，按钮上的为 `false`；
  - 计算样式 `user-select: none`、`touch-action: none`；
  - 选难度 → 开始 → 点击半屏仍正常出招（生成 `.lane-flash`），无 console error。
- 说明：若某浏览器把「标记广告」做在浏览器外壳层（不经过页面手势），页面无法拦截，
  需在浏览器设置里关掉该功能，或换 Chrome / Safari 打开。
