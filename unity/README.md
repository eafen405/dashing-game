# 双轨打怪 · Unity 2D

这是现有 Web 游戏的原生 C# / Unity 2D 版本。工程使用本机已安装的
**Unity 2022.3.62f3c1**、内置渲染管线、正交相机、2D Sprite / Mesh 和 UGUI。
不依赖 WebView、浏览器、React、Pixi 或联网服务。

## 直接试玩

双击 `Play.cmd`，或者运行 `Builds/Windows/Dashing.exe`。
发布给其他电脑时，需要一并保留整个 `Builds/Windows` 文件夹，不能只复制 exe。

## 用 Unity 继续开发

1. Unity Hub → Add / 添加磁盘中的项目 → 选择本目录 `unity`。
2. 使用 **2022.3.62f3c1** 打开。
3. 打开 `Assets/Scenes/Dashing.unity`，点击 Play。
4. 编辑器菜单 `Dashing` 提供工程初始化、规则校验和 Windows 构建。

包依赖全部来自该编辑器的内置模块，不需要额外安装 URP、DOTween 或付费插件。
`Assets`、`Packages`、`ProjectSettings` 和对应 `.meta` 文件属于工程源码；
`Library`、`Temp`、`Builds`、日志与测试输出已忽略。

## 已迁移

- 双轨攻击、中心暴击、同轨碰撞 / 异轨擦过、连击和分数。
- 哲（300 HP）、凛（125/250 HP、命中回血、满血燃魂 ×2）。
- 四档难度，沿用原版不同的密度 / 移速倍率与难度曲线。
- 双生敌人的 0.18 秒补齐窗口、单破自爆。
- 长按敌人的头 / 中 / 尾得分、2 秒贯穿、暂停锚定、6 秒续按宽限。
- 长按期间另一轨灵魂代打。
- 每 50 连击触发 10 秒 FEVER ×1.5，可与燃魂叠加。
- 角色 / 难度菜单、玩法说明、自由改键与三套预设、上下 / 左右手法、暂停、结算、重开、全屏。
- 分辨率变化时同步更新相机、判定几何、轨道与 HUD；窄窗口使用双排 HUD。
- 本地最高分按角色和难度保存；与浏览器 localStorage 相互独立。

凛沿用现有的 26 张原始动作图，转换为 PNG。待机往返序列、骑镰 12fps、攻击帧末短混合
均带入原生版本；使用一次绘制完成两帧预乘透明混合，避免双层淡入造成角色变暗。
原素材依然是逐帧动画，没有声称新增骨骼或手绘中间帧。

### 角色表现补全

- 修正凛的骑镰触发条件：正常下轨跑动播放 9 帧骑乘，菜单使用站姿呼吸；
  暂停时保留骑乘姿态并冻结帧混合。原版骑镰不是上轨专属动作。
- 恢复上轨攻击的 1 秒抛物线、0.5 秒顶点、下轨打断后的重力下落，
  落地压缩 / 尘环，以及双生击破的 0.62 秒起跳下砸。
- 长按使用原版 0.24 秒完整挥镰循环；暂停锚定 / 等待续按时保留举镰姿势。
- 补回角色血量弧、地面光 / 投影、受伤红闪、FEVER 金色旋转弧，
  燃魂的红黑彗尾、上升烟焰、浮动余烬、发梢红焰和镰刀拖尾。
- 判定区恢复半透明填充、柔光 / 锐线双描边、中心点、方向箭头，
  暴击 / 普攻及点击半屏提示随布局和手法更新。

上述视觉对象预建并复用；表现状态独立于规则，攻击 / 得分 / 碰撞窗口不变。

### 凛的清晰化画质

默认启用精细画质，按 `F8` 可即时切换「精细 / 原版」，菜单 / 暂停页显示当前设置。
设置在正常试玩时保存；自动验证不会修改用户选择。

- 26 张动作图保留原 PNG，独立生成 `RinRefined/`：站姿 / 出招为 1100×686，
  骑乘为 820×570。使用有界局部细节增强、半透明白边清理、预乘 alpha 的 2 倍重采样。
- 采用无压缩贴图、Kaiser mipmap 和轻微负偏移，改善不同窗口大小下的细节采样。
- 呼吸 / 骑镰的相邻姿态用离线双向局部匹配图补偿位移，减少五官 / 轮廓的双影；
  不可靠匹配跟随整体头部移动，并限制位移梯度，避免发丝 / 刀刃被拉破。
- 映射图在加载时复用；游戏中不运行匹配算法，也不逐帧生成图像 / 材质。
  攻击 / 长按的帧末混合和原来的时长保持不变，灵魂分身沿用同一画质选择。

这是现有 2D 逐帧原画的保真处理，未调用 AI 重绘，也未新增骨骼 / 几何细节。
放大后的细节仍受原始素材约束。原始 PNG / WebP 和游戏判定不变。

FEVER 使用由当前规则状态驱动的背景 / 轨道光效，退出约 0.35 秒恢复。
不使用可能残留的全屏模糊滤镜。

## 操作

- 默认上轨：`W` / `↑`；下轨：`S` / `↓`。
- 主菜单 / 暂停页点击「按键设置」，每轨可绑定 **1–3 个**键；点键位后按下新键。
- 支持添加 / 移除、恢复默认，以及 `D/F + J/K`、`←/A + →/L` 三套预设。
- 重复键与开始 / 暂停 / F8 / F11 等控制键不可绑定；`Esc` 取消听键，再按一次返回。
- 修改立即生效并保存到本地；重启后保留。每轨始终至少保留一个键，损坏设置自动回退。
- 鼠标 / 触摸支持上下、左右两种手法；按住发起长按的那一个输入直到完成。
- `Enter` / `Space`：开始或重开；`P` / `Esc`：暂停 / 继续。
- `F11` 或右上角方框按钮：全屏。
- `F8`：凛的精细 / 原版画质即时切换，方便直接比较。
- 失去窗口焦点自动暂停，防止切出窗口时漏怪。

## 代码结构

```text
Assets/Dashing/Core/       纯 C# 规则、状态、布局、Mulberry32；无 Unity 依赖
Assets/Dashing/Runtime/    原生场景、帧动画、输入、UGUI、音效、持久化
Assets/Dashing/Editor/     场景 / 构建配置与规则检查
Assets/Resources/Rin/      26 张 PNG 动作图
Assets/Resources/RinRefined/  独立的 26 张清晰化动作图
Assets/Resources/RinMotion/   呼吸 / 骑镰的 24 张双向位移图
Assets/Resources/Shaders/  双纹理帧混合 shader
Assets/Scenes/             可直接运行的 Dashing 场景
Tools/                     构建、资源格式转换、TypeScript 对照回放生成
```

规则遵循 Web 版本 `src/game` 的数值、判定和时序。表现层使用 Unity 原生实现，
怪物、地面、菜单、反馈和短音效重新制作，不是 Pixi 滤镜逐像素复刻。
原生版已支持每轨 1–3 键编辑、冲突检查和持久化；设置与 Web 版本分别保存。
Windows 为本次实际构建 / 验证平台，其他平台未声称完成打包验证。

## 重建 / 校验

在本目录的 PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\Tools\Build-Windows.ps1
```

加 `-VerifyReference` 会调用原 Web 规则生成确定性回放再对照 C#：

```powershell
# 父目录需要已有 npm.cmd ci 安装的开发依赖。
powershell -ExecutionPolicy Bypass -File .\Tools\Build-Windows.ps1 -VerifyReference
```

`-ValidateOnly` 只校验，`-EditorPath '...\Unity.exe'` 可指定编辑器路径。
构建前关闭占用本工程的 Unity 编辑器。构建结果在 `Builds/Windows`，日志在 `build-script.log`。

`Tools/convert-rin.mjs` 可从 WebP 源文件重新生成 PNG，需要父目录的 Node / Playwright 依赖和系统浏览器。
PNG 已直接纳入本工程，正常打开和构建无需再次转换。

重做清晰化资源无需联网或安装图像库，在父工程目录运行：

```powershell
node unity/Tools/rin-clarity.mjs
node unity/Tools/test-rin-clarity.mjs
```

`--motion-only` 只重新计算位移图，沿用已有增强图。原始素材不会被写入。
处理报告 / 原图 SHA-256 / 对应误差与位移梯度检查在 `TestResults/RinClarity/`。

## 验证说明

- 编辑器规则检查包含得分 / 回血时序、双生超时与重复输入、长按 / 代打 / 暂停 / 续按、
  燃魂下限、四档难度的 FEVER 自然退出 / 碰撞 / 异轨漏怪 / 长按失败等路径。
- `Tools/reference.mjs` 为两名角色 × 四难度生成各约 100 秒的真实 Web 规则回放；
  C# 逐事件重放并比较计数、时钟和每只敌人的坐标 / 状态。
- Windows 原生程序传 `--dashing-smoke` 可运行自动试玩，检查截图非空、暂停冻结、
  长按 / 代打、FEVER 恢复、窗口缩放、哲 / 凛、结算重开。
- 截图与报告保存在 `TestResults/Player/`；规则报告在 `TestResults/rule-checks.txt`。
- `TestResults/presentation-checks.txt` 校验地面骑镰、暂停保姿、抛物线顶点、
  打断下落、落地、长按等待、双生 / 代打和 FEVER 退场。
- 原生自动试玩额外输出 `11-ground-ride-a.png` 至 `17-hold-wait.png`，
  逐段检查真实渲染器的动画推进和姿态选择；结果见 `character-presentation.txt`。
- `--dashing-input-check` 仅用于真实键鼠验证，输出 `TestResults/input-probe.json`。
- `TestResults/key-binding-checks.txt` 记录绑定数量、保留键、重复键、存储恢复等 36 项检查。
- `Tools/Test-Input.ps1` 验证真实改键、取消、冲突、增删、暂停设置和改键后出刀；
  改键界面截图保存在 `TestResults/KeyBindings/`，测试不写入玩家的按键设置。
- `--dashing-clarity` 在原生窗口中比较同一时刻 / 尺寸的站姿、骑镰、出招及燃魂，
  保存 `TestResults/RinClarity/clarity-comparison.png` 等对比图；自动结束，不写入玩家设置。
- 编辑器额外检查 26 张增强图的尺寸 / 导入方式和 24 张线性位移图。

两套工程可分别构建。源码与原画由 Git 管理；构建、测试报告与截图保留在本地，不进入版本库。
