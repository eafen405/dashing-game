# 旧版 `source.html` 黄金轨迹 harness —— 精确打补丁方案

> **本文件是 `scripts/legacy/patch-legacy.mjs` 的方案书（已入库）。**
> 原文写在仓库外，而 §4.4 / §7.1 / §7.4 / §8.6 等小节被仓库里 6 个文件引用 ——
> 方案书留在仓库外，别人克隆这个仓库就复现不出黄金轨迹 harness。
> 所以把它**原样收进 `scripts/legacy/`**：内容不改，只把文中的本机绝对路径
> 换成仓库相对路径；引用方一律指向本文件。
>
> 产出对象：票 03「保真门禁：golden trace 逐帧对照」中**旧版一侧**的改造方案。
> 权威来源：仓库根的 `source.html`（**只读**）。
> 本文件只描述「怎么给旧文件打补丁」，不描述新规则层怎么写（那部分在票 02 的 worktree 里）。

---

## 0. 基线、约束与验收口径

### 0.1 基线

| 项 | 值 | 证据 |
|---|---|---|
| 文件 | 仓库根的 `source.html` | — |
| md5 | `7e7dc6ebd282ffa1b27d4e9108c9b668` | `md5sum source.html` |
| 行数 | 2683 | `wc -l source.html` |
| 与 `d2958e2` 的差异 | **无**（`git diff d2958e2 HEAD -- source.html` 为空） | 所以 `legacy-semantics.md` §1 的行号全部可用 |
| 当前 HEAD | `d4b806e`（票 01 工程基线已合入） | `git log --oneline -1` |

### 0.2 硬约束

1. **不改 `source.html`**。补丁脚本读它 → 在内存里做精确字符串替换 → 写出 `scripts/legacy/legacy-harness.html`（生成物，不入 git）。
2. **每个锚点在 `source.html` 里必须恰好出现一次**。补丁脚本对每个锚点断言 `count === 1`，否则直接失败（宁可炸掉也不要静默改错地方）。
3. **补丁后必须跑「随机点白名单断言」**（§7.4）：打完之后，文件里剩下的 `Math.random` / `rand(` 调用点必须**恰好**是规则层的 15 个调用点（§2.4 表）。这是防止「视觉随机把规则随机序列搅乱」的唯一硬保险。
4. 补丁后的 harness **只在 `?fixedstep=1` 下工作**；不带该参数时行为与原文件一致（方便本地人工对照）。

### 0.3 三种模式

| 模式 | 旧 harness 打的补丁 | 比对要求 | 用途 |
|---|---|---|---|
| **A（CI 门禁）** | D1 + D2 + 全部 harness 补丁 | **逐帧完全一致** | 真正的回归门禁 |
| **B（记账）** | D2 + 全部 harness 补丁，**不**打 D1 | 见 §6.3 —— **不建议按 brief 的原写法做**，理由是 PRNG 流会错位 | 证明差异只来自 D1 |
| **B′（推荐替代 B）** | D2 + harness 补丁，**两边都保留旧的 `clearLane` bug** | 逐帧完全一致 | 直接证明「D1 是唯一语义差异」 |

---

## 1. 补丁总览

| # | 目的 | 锚点行号 | 模式 | § |
|---|---|---|---|---|
| P0 | 注入 harness 运行时（PRNG / 合成时钟 / 固定 viewport / 轨迹 / API） | 新增（插在 L492 前） | A/B/B′ | 2.1 |
| P1 | `rand(a,b)` 改走规则 PRNG | L493 | A/B/B′ | 2.2 |
| P2 | 规则层直接 `Math.random()` 改走规则 PRNG | L752 / L760 / L766 / L806 | A/B/B′ | 2.3 |
| P3 | 视觉随机全部改走**独立** PRNG | L584-588 / L1241-1252 / L1261-1268 / L1463 | A/B/B′ | 2.5 |
| P4 | 合成时钟：屏蔽 rAF 自动递归 + 固定 dt | L1276-1277 / L1279-1282 | A/B/B′ | 3 |
| P5 | 事件注入点：先应用事件、再推进 tick | L1285-1286 | A/B/B′ | 4 |
| P6 | 逐帧快照记录 | L1397 之后 | A/B/B′ | 5 |
| P7 | 确定性 viewport / 布局 | L535 + L2662-2667 | A/B/B′ | 6 |
| D1 | `clearLane` 修复（只有长按怪算占用） | L804-805 | **仅 A** | 2.6 |
| D2 | `playerX` 先于 `hitX` 计算 | L554-560 | A/B/B′ | 2.7 |
| P8 | 双生怪打上永久 `kind` 标记（快照用，不参与判定） | L842-844 | A/B/B′ | 5.3 |

---

## 2. 逐条补丁清单

> 所有锚点均为 `source.html` 原文（缩进逐字保留）。每条给出「锚点 / 替换成 / 为什么」。

### 2.1 P0 —— 注入 harness 运行时（新增块）

**锚点**（唯一，count === 1）：

```
  /* =============== 工具 =============== */
  function rand(a,b){ return a + Math.random()*(b-a); }
```

**替换成**：

```
  /* =============== HARNESS (golden trace) =============== */
  /* 由 patch-legacy.mjs 注入；不修改 source.html 本身。 */
  const __q = new URLSearchParams(location.search);
  const __seed = (__q.get("seed") !== null ? Number(__q.get("seed")) : 20240101) >>> 0;
  const __diff = (__q.get("diff") === "2") ? 2 : 1;
  const __vw = Number(__q.get("w") || 900);
  const __vh = Number(__q.get("h") || 600);
  const __fixedStep = (__q.get("fixedstep") !== "0");
  const __fixedDt = 1 / 60;                 // 0.016666666666666666
  const __tsBase = 1000;                    // 非零、单调递增的时间戳起点（见 §3.2）
  const __trace = [];
  let __frame = 0;
  let __rulesRng = null;
  let __visRng = null;

  /* mulberry32 —— 必须与 src/game/rng.ts 的 createRng 逐字等价 */
  function __mulberry32(a){
    let s = a >>> 0;
    return function(){
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function __rulesNext(){ return __rulesRng(); }
  function __visNext(){ return __visRng(); }
  function vrand(a,b){ return a + __visNext()*(b-a); }   // 仅供视觉层使用

  __rulesRng = __mulberry32(__seed);
  __visRng   = __mulberry32((__seed ^ 0x9e3779b9) >>> 0);
  diffLevel  = __diff;                      // diffLevel 是模块级变量（L408），不在 resetGame 里重置

  if (__fixedStep){
    /* 屏蔽 rAF：startGame(L680) / resumeGame(L697) / 启动(L2666,L2679) / updateOrientation(L517) 全部不再自动排队 */
    window.requestAnimationFrame = function(){ return 0; };
    window.cancelAnimationFrame  = function(){};
  }

  function __harnessRect(){
    return { x:0, y:0, left:0, top:0, right:__vw, bottom:__vh, width:__vw, height:__vh };
  }

  function __monsterKind(m){
    if (m.long) return "hold";
    if (m.__kind === "twin") return "twin";
    return "normal";
  }
  function __monsterState(m){
    if (m.long){
      if (m.holding)  return "hold-holding";
      if (m.anchored) return "hold-anchored";
      if (m.escaped)  return "hold-escaped";
      return "hold";
    }
    if (m.pairPending) return "twin-pending";
    if (m.__kind === "twin") return "twin";
    return "normal";
  }

  function __recordFrame(){
    if (state !== "running") return;
    const ms = [];
    for (const m of monsters){
      /* 旧实现里「离场」与「从数组移除」是同一次调用里完成的，
         所以下面两个分支在旧版恒为 false —— 断言而非静默过滤。 */
      if (m.dead) throw new Error("harness invariant: dead monster still in monsters[] @frame " + __frame);
      if (m.long && m.done) throw new Error("harness invariant: done long monster still in monsters[] @frame " + __frame);
      ms.push({
        kind: __monsterKind(m),
        lane: m.lane,
        x: m.x, y: m.y, w: m.w, h: m.h,
        state: __monsterState(m)
      });
    }
    __trace.push({
      frame: __frame,
      dt: __fixedDt,
      hp: hp, score: score, combo: combo, maxCombo: maxCombo, kills: kills,
      critCount: critCount, normalCount: normalCount,
      frenzyActive: frenzyActive, feverT: feverT,
      now: now,
      hitX: hitX, zoneHalf: zoneHalf, critHalf: critHalf,
      monsters: ms
    });
    __frame++;
  }

  function __applyEvents(frameIdx){
    const evs = __eventSource(frameIdx);          /* 共享脚本，见 §6 */
    for (const ev of evs){
      if (ev.type === "press")         pressLane(ev.lane, ev.id);
      else if (ev.type === "release")  releaseHold(ev.id);
      else if (ev.type === "cancel-hold") cancelHold();
    }
  }

  function __stepFrames(n){
    let done = 0;
    for (; done < n; done++){
      if (state !== "running") break;
      const ts = __tsBase + __frame * (1000/60);
      loop(ts);
    }
    return { frames: __frame, state: state, stopped: (state !== "running"), stepped: done };
  }

  window.__harness = {
    seed: __seed, diff: __diff, vw: __vw, vh: __vh, dt: __fixedDt,
    start: function(){ startGame(); },
    stepFrames: __stepFrames,
    trace: function(){ return __trace; },
    reset: function(){ __trace.length = 0; __frame = 0; }
  };

  /* =============== 工具 =============== */
  function rand(a,b){ return a + __rulesNext()*(b-a); }
```

**为什么**：

* 注入点选在 L492 之前，是因为它必须在 **L2666 / L2679（启动时排 rAF）之前**执行，才能屏蔽 rAF；也必须在 **L2665 `resize()` 之前**就绪（`resize` → `buildStars` → `rand`）。同时它引用的 `diffLevel`（L408 `let`）已在 L408 初始化，所以 L492 处赋值合法。
* `mulberry32` 与新规则层 `src/game/rng.ts` 的 `createRng` **逐字等价**（`a >>> 0` → `(a + 0x6d2b79f5) | 0` → `Math.imul` 两次 → `>>> 0 / 4294967296`），保证两边随机序列完全一致。
* `range(min,max) = min + next()*(max-min)` 与旧 `rand(a,b) = a + Math.random()*(b-a)` 的「先乘后加」顺序一致（IEEE754 乘法可交换，不引入差异）。
* **视觉 PRNG 与规则 PRNG 必须分开**：`buildStars` 一次 resize 就消耗 150 次（§7.4），`killMonster` 一次击杀就消耗 144 次（§7.4），`draw()` 每帧抖动 2 次。若它们走规则 PRNG，规则随机序列会被彻底搅乱。

### 2.2 P1 —— `rand(a,b)` 改走规则 PRNG

**锚点**（count === 1）：

```
  function rand(a,b){ return a + Math.random()*(b-a); }
```

**替换成**：

```
  function rand(a,b){ return a + __rulesNext()*(b-a); }
```

**为什么**：`rand` 是规则层与视觉层**共用**的入口，不能整体改指向；所以 P1 只改「指向哪个 PRNG」，视觉侧的调用点由 P3 逐个改写。规则侧的随机消费点一共 **15 个调用点**：

| 类型 | 调用点 | 数量 |
|---|---|---|
| `rand(` → `__rulesNext()` | L735 / 754 / 762 / 775 / 779 / 789 / 790 / 823 / 835 / 841 / 846 | 11 处（其中 **L846 每次刷双生会被执行 2 次**，见 §7.13） |
| `Math.random()` → `__rulesNext()` | L752 / 760 / 766 / 806 | 4 处（其中 **L806 只在 `clearLane()` 两轨都空时才执行**） |

（`legacy-semantics.md` §9 的随机点表列了 14 行，与上表基本一致；需要补的是「双生 `wob` 抽 2 次」，以及 L846 的实际行号是 846 而非表中写的 847。）

### 2.3 P2 —— 规则层直接 `Math.random()` 改走规则 PRNG

四处，逐字替换（每条 count === 1）：

| 锚点 | 替换成 | 备注 |
|---|---|---|
| `      if (lane && Math.random() < 0.28){` | `      if (lane && __rulesNext() < 0.28){` | L752，长按怪 28% 判定；**短路语义不变**（`lane` 为 null 时不消费 PRNG） |
| `    if (!hasActiveLong() && !hasActivePair() && now > 6 && pairCooldown <= 0 && Math.random() < 0.20){` | `    if (!hasActiveLong() && !hasActivePair() && now > 6 && pairCooldown <= 0 && __rulesNext() < 0.20){` | L760，双生 20% 判定 |
| `    let lane = Math.random() < 0.5 ? "top" : "bottom";` | `    let lane = __rulesNext() < 0.5 ? "top" : "bottom";` | L766，普通怪选轨 |
| `    if (!topBusy && !botBusy) return Math.random() < 0.5 ? "top" : "bottom";` | `    if (!topBusy && !botBusy) return __rulesNext() < 0.5 ? "top" : "bottom";` | L806，**在 `clearLane()` 内部** |

**为什么**：这四处是规则判定用的随机数，必须与新规则层的 `rng.next()` 一一对应。注意 L806 的消费**只在两轨都空时**发生；D1 修复前后消费次数不同（§6.3），这是模式 B 的核心风险点。

### 2.4 P3 —— 视觉随机全部改走独立 PRNG

把下列调用点逐个改写（`rand(` → `vrand(`，`Math.random()` → `__visNext()`）。每条锚点 count === 1。

| # | 锚点 | 替换成 | 位置 |
|---|---|---|---|
| V1 | `        x: Math.random()*W,`<br>`        y: Math.random()*H,` | `        x: __visNext()*W,`<br>`        y: __visNext()*H,` | L584-585 `buildStars` |
| V2 | `        r: rand(0.5,1.6),`<br>`        a: rand(0.08,0.35),`<br>`        s: rand(2,10)` | `        r: vrand(0.5,1.6),`<br>`        a: vrand(0.08,0.35),`<br>`        s: vrand(2,10)` | L586-588 `buildStars` |
| V3a | `    frenzySparkT = rand(0.035, 0.08);`<br>`    // 角色周身金色火花`<br>`    const a = rand(0, Math.PI*2);`<br>`    const rr = playerR * rand(1.2, 2.1);` | 全部 `rand(` → `vrand(` | L1241-1244 `emitFrenzy` |
| V3b | `      vx: -rand(40, 160), vy: rand(-70, 20),`<br>`      r: rand(1.4, 3.2),`<br>`      life: rand(0.3, 0.7),`<br>`      t: 0,`<br>`      color: Math.random() < 0.35 ? "#fff4c2" : GOLD` | 全部 `rand(` → `vrand(`；`Math.random()` → `__visNext()` | L1248-1252 `emitFrenzy` |
| V4 | `      const a = Math.random()*Math.PI*2;`<br>`      const sp = rand(60,300)*power;`<br>`      particles.push({`<br>`        x:x, y:y,`<br>`        vx:Math.cos(a)*sp,`<br>`        vy:Math.sin(a)*sp,`<br>`        r:rand(1.2,3.6),`<br>`        life:rand(0.25,0.65),` | `Math.random()` → `__visNext()`；`rand(` → `vrand(` | L1261-1268 `burst` |
| V5 | `      ctx.translate(rand(-shake,shake)*0.5, rand(-shake,shake)*0.5);` | `      ctx.translate(vrand(-shake,shake)*0.5, vrand(-shake,shake)*0.5);` | L1463 `draw()` 抖动 |

**为什么**：这 6 处是**纯视觉**，不进快照。它们消耗随机数的量级极大：

* `buildStars`：900×600 下 `n = Math.round(clamp(900*600/26000, 30, 90)) = 30` → **每次 resize 消耗 30×(2 + 3) = 150 次**。旧版 `resize()` 至少被调 2 次（还可能被 `updateOrientation` 的 3 个 `setTimeout` 再调 3 次）→ **一次开局就能把规则随机序列挪动 300~600 个数**。
* `burst`：每个粒子消耗 1 次 `Math.random` + 3 次 `rand`。`killMonster` 一次击杀 = `burst(26) + burst(10)` = 36 粒子 → **144 次**；暴击 36+16 = 52 粒子 → 208 次；`killPair` 两只 = 2×(28+12)+… → 200+ 次。
* `draw()` 的抖动：`shake > 0.2` 期间每帧 2 次。每次击杀 `shake` 被抬到 5~17，随后按 `shake *= Math.pow(0.001, dt)` 衰减到 0.2 以下要 ~0.5~1s → 每次击杀后有 30~60 帧在抖 → **每次击杀额外挪动 60~120 个随机数**。
* `emitFrenzy`：FEVER 期间每次发射 8 次。

**结论：这些必须全部走视觉 PRNG，一条都不能漏。** §7.4 的白名单断言就是用来兜底的。

### 2.5 D1 —— `clearLane` 修复（**仅模式 A**）

**锚点**（count === 1）：

```
    const topBusy = monsters.some(function(m){ return m.lane === "top" && !m.done; });
    const botBusy = monsters.some(function(m){ return m.lane === "bottom" && !m.done; });
```

**替换成**：

```
    const topBusy = monsters.some(function(m){ return m.long && !m.done && m.lane === "top"; });
    const botBusy = monsters.some(function(m){ return m.long && !m.done && m.lane === "bottom"; });
```

**为什么（必读）**：

* `done` 只在长按怪上赋值（`spawnLong` L824 / `completeLong` L1160 / 逃逸滑出 L1305），普通怪和双生怪的 `done` **恒为 `undefined`（falsy）** → 只要场上有任何普通怪，两轨都判「占用」→ `clearLane()` **恒返回 `null`** → 长按怪几乎刷不出来。
* 于是：**不改这一行，模式 A 的长按怪路径（`pressLane` → `startHold` → `completeLong` / `failLong` / `missLong`）在旧版根本走不到**，覆盖清单里的 6/7/8 三条全部无法验证。
* 修复后 `clearLane()` 只把长按怪算作占用，与新规则层 `src/game/rules/spawn.ts:75-82` 的 `clearLane` **完全一致**（该文件已按 D1 修复实现）。
* ⚠️ **PRNG 消费差异**：旧版（有 bug）在「场上有普通怪」时 `clearLane()` 走到 `return null`，**不消费** PRNG；修复后 `clearLane()` 返回一条轨 → L752 的 `Math.random() < 0.28` **会消费**一次 PRNG。这正是模式 B 的雷区（§6.3）。

### 2.6 D2 —— `playerX` 先于 `hitX` 计算

**锚点**（count === 1）：

```
    playerR = clamp(H * 0.115, 22, 46);
    hitX = Math.max(clamp(W * 0.34, 150, 430), playerX + playerR*2.6 + 120);
    hitW = clamp(W * 0.070, 58, 100);
    // 暴击区半宽 = 外圈半宽的一半：判定落在中心区间的概率约 50%
    zoneHalf = hitW * 0.5 + clamp(W * 0.030, 16, 44);
    critHalf = zoneHalf * 0.50;  // 中心暴击区半宽（约五成暴击率）
    playerX = Math.max(clamp(W * 0.085, 48, 120), playerR * 2.05 + 12);
```

**替换成**：

```
    playerR = clamp(H * 0.115, 22, 46);
    /* [D2] playerX 必须在 hitX 之前算出来 —— 与新规则层 computeLayout 的顺序一致 */
    playerX = Math.max(clamp(W * 0.085, 48, 120), playerR * 2.05 + 12);
    hitX = Math.max(clamp(W * 0.34, 150, 430), playerX + playerR*2.6 + 120);
    hitW = clamp(W * 0.070, 58, 100);
    // 暴击区半宽 = 外圈半宽的一半：判定落在中心区间的概率约 50%
    zoneHalf = hitW * 0.5 + clamp(W * 0.030, 16, 44);
    critHalf = zoneHalf * 0.50;  // 中心暴击区半宽（约五成暴击率）
```

**为什么**：旧版 L555 用到了 L560 才算出来的 `playerX`，首次 `resize()` 时 `playerX = 0` → `hitX = 306`；第二次起 `playerX = 106.3` → `hitX = 345.9`。新规则层 `src/game/layout.ts:30-37` 已按「playerR → playerX → hitX」的正确顺序实现。**两边都按正确顺序算，hitX 才恒等**。

> 模式 B（不打 D2）时**必须**让旧版跑满 2 次以上 `resize()`（§6.2），否则第 0 帧的 `hitX` 就是 306，与新侧 345.9 不等。

### 2.7 P8 —— 双生怪打永久 `kind` 标记

**锚点**（count === 1）：

```
    const mk = function(lane){
      return {
        lane: lane, x: startX, y: laneY[lane],
```

**替换成**：

```
    const mk = function(lane){
      return {
        __kind: "twin",   // [HARNESS] 仅供快照用，不参与任何规则判定
        lane: lane, x: startX, y: laneY[lane],
```

**为什么**：旧版双生怪的「身份」只能从 `m.partner` / `m.pairId` 反推，而这两个字段在解除锁链时会被清零（`killMonster` L974 `p.pairId = 0`、`resolvePairSolo` L1034/L1037）。虽然当前代码路径里「解除锁链的怪」总是立刻被移除（§5.4），但新规则层的 `kind` 是**静态判别式**（`'normal' | 'twin' | 'hold'`，永不改变）→ 旧版必须有一个等价的静态标记，否则两边 `kind` 语义不对齐。`__kind` 不被任何规则代码读取，纯粹是快照用的旁路标记。

---

## 3. 合成时钟的确切设计

### 3.1 补丁

**锚点 A**（count === 1，L1276-1277）：

```
  function loop(ts){
    raf = requestAnimationFrame(loop);
```

**替换成**：

```
  function loop(ts){
    if (!__fixedStep) raf = requestAnimationFrame(loop);
```

> 注：`    raf = requestAnimationFrame(loop);`（4 空格缩进）在文件里**出现 3 次**（L680 `startGame`、L697 `resumeGame`、L1277 `loop`），所以必须带 `function loop(ts){` 一起做锚点。

**锚点 B**（count === 1，L1279-1282）：

```
    if (!lastT) lastT = ts;
    let dt = (ts - lastT)/1000;
    lastT = ts;
    dt = Math.min(dt, 0.05);
```

**替换成**：

```
    if (__fixedStep){
      dt = __fixedDt;     /* [HARNESS] 合成时钟：每帧固定 1/60，与时间戳彻底解耦 */
      lastT = ts;         /* 保持 lastT 单调，仅为回退路径兜底 */
    } else {
      if (!lastT) lastT = ts;
      dt = (ts - lastT)/1000;
      lastT = ts;
      dt = Math.min(dt, 0.05);
    }
```

**锚点 C**（全局屏蔽 rAF，在 P0 注入块里）：`window.requestAnimationFrame = function(){ return 0; };`

**为什么需要 C**：`loop` 里的 rAF 被 P4-A 关掉了，但 `startGame()` L680、`resumeGame()` L697、启动段 L2666 / L2679、`updateOrientation()` L517 仍会排 rAF 回调 → 那些回调会带**真实时间戳**跑一次 `loop` → 不可复现。全局屏蔽一次就干净了。

### 3.2 时间戳起点：为什么取 `1000`

`loop()` 的时间戳序列由 harness 生成：

```
ts(i) = 1000 + i * (1000/60)      // i = 0,1,2,...
```

**理由（三条）**：

1. **`lastT` 的 falsy-zero 陷阱**：旧码 `if (!lastT) lastT = ts;`（L1279）用 `!lastT` 判「还没初始化」。`lastT` 初值 0（L451）是 falsy → 第一次 `loop` 调用会把 `lastT` 设成 `ts`。**如果 `ts` 从 0 开始，第一次调用后 `lastT` 仍然是 0（falsy）**，于是第二次调用又把 `lastT` 重置成新的 `ts` → 那两帧的 `dt` 都是 0。起点取 1000（truthy）后，第一次调用结束 `lastT = 1000`（truthy）→ 之后 `if (!lastT)` 永远为假 → `dt = (ts - lastT)/1000` 从第二帧起就是正常的 1/60。
   > 更正 brief-03 的说法：ts=0 起点并不会让 `dt` **恒**为 0，只是**前两帧**为 0；真正的危害是「`lastT` 被反复重置」这件事本身，以及它让「第 0 帧的 now」不确定。起点取 1000 一劳永逸。
2. **`startGame()` 会把 `lastT` 清零**（L678 `now = 0; lastT = 0;`），`resumeGame()` 同样（L695）。所以每次开局/恢复后第一帧又会走一次 `!lastT` 分支 → 起点非零保证这条分支只影响第 0 帧。
3. **合成 dt 之后 `ts` 其实只喂给 `lastT`**，取值本身不进入快照，所以「非零 + 单调递增」就够了。1000 同时满足 brief-03 的约定。

### 3.3 dt 的取值：固定 `1/60`，并**禁止**从时间戳反算

**这是本方案最关键的一个决定**，理由：

* `dt = (ts - lastT)/1000` 会引入浮点误差。`1000/60 = 16.666666666666668`，逐帧累加后 `ts` 的最低位会漂移 → 每帧 `dt` 不完全相同 → `now` 的累加顺序在两边可能差 1 ULP → 连续 7200 帧后 `now` 可能差到 1e-12 量级 → 撞上 `now > 8` / `now > 6` 这类阈值时行为分叉。
* 改成 `dt = __fixedDt`（`1/60` 的**同一个 double**：`0.016666666666666666`）后，两边的 `dt` 序列**逐位相同**，`now` 的累加也逐位相同（前提：两边都用「重复加法」，见 §7.2）。
* `dt = Math.min(dt, 0.05)` 在 1/60 下永不触发（0.0167 < 0.05），所以钳制对两边都是 no-op；新规则层 `tick()` 里的 `Math.min(dt, MAX_DT)` 同理（`src/game/rules/tick.ts:62`）。
* 快照里记录 `"dt": 0.016666666666666666`，新侧回放时**直接用这个 double**（不要重新算 `1/60`，虽然结果相同，但显式更稳）。

**手动步进 API**：

```js
window.__harness.stepFrames(n) -> { frames, state, stopped, stepped }
window.__harness.start()        -> startGame()（等价于点开始键）
window.__harness.trace()        -> 已记录的所有帧快照
window.__harness.reset()        -> 清空轨迹与帧号（不重置游戏状态）
```

`stepFrames` 的循环体：

```js
for (; done < n; done++){
  if (state !== "running") break;      // 血量归零 → state="over"，停止推进
  const ts = __tsBase + __frame * (1000/60);
  loop(ts);
}
```

**帧号约定**：`__frame` 从 0 开始，在 `__recordFrame()` 末尾自增 → 第 0 次 `loop()` 调用的快照 `frame = 0`、`now = 1/60`（因为 `now += dt` 发生在 tick 开头）。这与 brief-03 的示例 `"frame": 0, "now": 0.016666666666666666` 一致。

### 3.4 手动步进时怎么注入事件

事件表形如 `[{frame, type, lane, id}]`。**事件必须在该帧的 tick 之前应用**。

**旧代码里对应的插入点**：`loop()` 的 running 分支**最开头**，`now += dt;`（L1286）**之前**。

**锚点**（count === 1，L1285-1286）：

```
    if (state === "running"){
      now += dt;
```

**替换成**：

```
    if (state === "running"){
      __applyEvents(__frame);   /* [HARNESS] 先应用脚本化事件，再推进 tick */
      now += dt;
```

**为什么是这里**：

* 「先事件、再 tick」的语义要求事件看到的是**上一帧结束时**的 `now`（因为 `now += dt` 还没发生）。`pressLane` 里唯一用到 `now` 的地方是「太早」节流（L1070 `now - (m.tipT || -9) > 0.6`）→ 新规则层 `pressLane` 用 `state.now`（`src/game/rules/strike.ts:165`），也是「tick 前的 now」→ **两边语义天然一致**。
* 若把事件插在 `if (state === "running"){` **之前**，事件会在 idle/over 帧也被应用；虽然 `pressLane`/`strike` 内部有 `state !== "running"` 守卫、`releaseHold` 没有（但暂停时 `pauseGame()` 已经调过 `cancelHold()`，`holdMon` 为 null → `releaseHold` 是 no-op），但多一层判断不如少一层。
* 事件直接调 `pressLane(lane, id)` / `releaseHold(id)` / `cancelHold()`，**不要**用 DOM 事件（`page.mouse.click`）：旧版的 `stage.addEventListener("pointerdown")`（L2536）会**再触发一次**，导致同一帧双击（见 §7.9）。

**事件 id 约定**：press 与 release 必须用**同一个 id**（旧版 `releaseHold(id)` 要求 `holdId === id`，L1126）。harness 用 `"h0"` / `"h1"` 之类稳定字符串；不要复用 pointerId。

---

## 4. 快照的精确取法

### 4.1 字段 → 旧代码变量 → 行号

| 快照字段 | 旧代码变量 | 声明行 | 写入点（示例） |
|---|---|---|---|
| `hp` | `hp` | 456 | 1047（pairBlast）、1216（hurtPlayer） |
| `score` | `score` | 457 | 947（killMonster）、1009（killPair）、1095（longAward） |
| `combo` | `combo` | 457 | 932、996、1166、1136（清零）、1217（清零） |
| `maxCombo` | `maxCombo` | 457 | 933、997、1167 |
| `kills` | `kills` | 457 | 931、995、1165 |
| `critCount` | `critCount` | 458 | 934、998 |
| `normalCount` | `normalCount` | 458 | 934、998、1168 |
| `frenzyActive` | `frenzyActive` | 471 | 939、1002、1172（置位）；1211、1218、1137（清零） |
| `feverT` | `feverT` | 473 | 939、1002、1172；1383（每帧衰减） |
| `now` | `now` | 451 | 1286（`now += dt`） |
| `hitX` | `hitX` | 446 | 555 |
| `zoneHalf` | `zoneHalf` | 446 | 558 |
| `critHalf` | `critHalf` | 446 | 559 |
| `monsters[]` | `monsters` | 465 | 781/815/853（push）、978/1024/1046/1188/1229/1325/1370（filter） |
| *(可选)* `difficulty` | `difficulty` | 453 | 1287 |
| *(可选)* `nextFeverAt` | `nextFeverAt` | 474 | 941、1004、1173 |
| *(可选)* `state` | `state` | 450 | 674、686、692、718、2645 |

**建议**：`state` 与 `nextFeverAt` 一并写进快照（不在 brief-03 的最小格式里，但成本为零、诊断价值高：`state` 能区分「帧序号错位」与「游戏结束」，`nextFeverAt` 能直接看出 FEVER 触发点）。

### 4.2 怪物的每个字段取什么

| 快照字段 | 旧代码来源 | 行号 |
|---|---|---|
| `kind` | `m.long` / `m.__kind`（P8 注入） | 816 / 842-844 |
| `lane` | `m.lane` | 818 / 843 / 783 |
| `x` | `m.x` | 818 / 841 / 782 |
| `y` | `m.y` | 819 / 844 / 783 |
| `w` | `m.w`（长按怪 `w === len`） | 822 / 838 / 787 |
| `h` | `m.h` | 821 / 839 / 788 |
| `state` | 见 §4.3 | — |

> 长按怪的 `x` 是**身体左边缘**，头部在 `x + h*0.46`（`longHeadX`，L1089-1091）。快照只记 `x` 即可（两边同源），但**事件脚本**判断「头进圈」时要用 `x + h*0.46`。

### 4.3 怪物 `state` 的规范值与推导优先级

规范值集合（与 brief-03 一致）：
`normal` / `twin` / `twin-pending` / `hold` / `hold-anchored` / `hold-holding` / `hold-escaped`

**推导规则（优先级明确）**：

```
if (m.long):                       # 长按怪
    holding  → "hold-holding"     # 最高：startHold 同时置 holding 与 anchored（L1107-1108）
    anchored → "hold-anchored"    # 已锚定但没在按（暂停后续按的中间态）
    escaped  → "hold-escaped"     # longPenalty 之后（L1133-1134）
    else     → "hold"             # 刚出场，头还没进圈
else:                              # 普通怪 / 双生怪
    pairPending → "twin-pending"  # 第一击挂起，等待另一轨（L913-915）
    __kind==twin → "twin"
    else        → "normal"
```

**为什么 `holding` 优先于 `anchored`**：`startHold` 一次性把 `m.holding = true; m.anchored = true;`（L1107-1108）都置上，两个条件同时为真 → 必须有一个在前，否则同一个怪在同一帧可能给出两个不同答案。

**为什么 `anchored` 与 `escaped` 谁在前都无所谓**：`longPenalty` 把 `m.escaped = true; m.anchored = false;`（L1133-1134）成对写入，二者**互斥**；`completeLong`（L1161-1162）把两个都置 false 并立刻把怪移出数组。

**普通怪 / 双生 / 长按怪各自的规范值**：

| 怪 | 典型 `state` | 出现时机 |
|---|---|---|
| 普通怪 | `normal` | 全程；`pairPending` 永远为 undefined → 走 `else` 分支 |
| 双生怪 | `twin` | 出生到第一击之间；第一击后 → `twin-pending`；窗口过期或补齐后**立刻离场**（不再出现） |
| 长按怪 | `hold` | 出生到头部进圈 |
| 长按怪 | `hold-anchored` | 已被锚定但当前没按住（只可能来自 `cancelHold()` 之后） |
| 长按怪 | `hold-holding` | 正在被按住（`startHold` 之后到 `completeLong` / `failLong`） |
| 长按怪 | `hold-escaped` | `failLong` / `missLong` 之后，怪物高速滑出屏幕期间 |

> 双生怪**不会**出现 `twin-pending` 之外的第三种状态：`resolvePairSolo` 先把 `m.pairPending = false`（L1033）再 `killMonster` 移出数组；`killPair` 两个都置 false 并移出数组（L993/L1024）。

### 4.4 「在场」的判定：旧版 `monsters` 数组里会不会残留死怪？

**结论：不会。旧版 `monsters` 数组里不存在已死 / 已离场的怪，快照可以直接取原始数组。**

逐路径核对：

| 路径 | 设置标志 | 移除数组 | 行号 |
|---|---|---|---|
| `killMonster` | `m.dead = true` | `monsters = monsters.filter(x => x !== m)` | 930 → 978（**同一次调用内**） |
| `killPair` | `a.dead = b.dead = true` | `filter(x => x !== a && x !== b)` | 991 → 1024 |
| `pairBlast` | `p.dead = true` | `filter(x => x !== p)` | 1045 → 1046 |
| `completeLong` | `m.done = true` | `filter(x => x !== m)` | 1160 → 1188 |
| 逃逸长按怪滑出 | `m.done = true` | `monsters.filter(m => !(m.long && m.done))` | 1305 → 1325 |
| `hurtPlayer` | **不设任何标志** | `filter(x => x !== m)` | 1229 |
| 双生一同触线 | `mate.dead = true` | `filter(x => x !== mate)` | 1368 → 1370 |

**没有「先设 `dead = true`、后 filter，中间被别的代码看到」的窗口**：`killMonster` 里设 `dead` 之后只做 `burst` / `rings.push` / `showToast` / `syncHUD`，都不遍历 `monsters`；`filter` 在函数末尾执行。

**因此快照侧的处理**：

* **旧 harness 侧**：用**断言**而不是过滤 —— `__recordFrame()` 里遇到 `m.dead` 或 `(m.long && m.done)` 直接 `throw`（§2.1 的 `__recordFrame`）。这样万一将来旧代码出现残留，会**炸得很响**而不是被静默过滤掉。
* **新规则层侧**：**必须过滤**，因为新实现把 `removed: true` 的怪保留到**下一 tick 开头**才回收（`src/game/rules/tick.ts:76` `monsters: state.monsters.filter((m) => !m.removed)`）。所以新侧的快照构造要 `monsters.filter(m => !m.removed)`。
* → **两侧的「在场」谓词语义必须写成同一句共享规范**（建议放 `src/game/trace.ts`）：
  * 旧侧适配器：`!m.dead && !(m.long && m.done)`
  * 新侧适配器：`!m.removed`
  * 两者在各自实现里都**恒等**于「原始数组」（旧侧恒真，新侧剔掉当帧刚被移除的怪）→ 结果一致。
* **顺序**：两边都保留数组原始顺序（`filter` 保序）。旧版是 push 序 + filter 保序；新版是 `moved` 数组按遍历序重建（`tick.ts:94-125`）→ 顺序一致。**快照里禁止排序**。

---

## 5. 确定性布局

### 5.1 为什么必须打补丁（而不是只设浏览器 viewport）

旧版 `resize()` 量的不是窗口，而是 **`#stage` 的 `getBoundingClientRect()`**：

```
  #stage{
    position:relative;flex:1;min-height:0;      /* source.html:120-121 */
```

`#stage` 在 `#game`（`position:fixed;inset:0` 的纵向 flex，L67-74）里占「除顶部 HUD 以外」的高度 → **stage 尺寸 = viewport 尺寸 − HUD 高度**，永远不等于 viewport 本身。

→ 所以「把浏览器 viewport 设成 900×600」**得不到** stage=900×600，布局数值也就不是整数 aesthetically 可核对的那组。**必须直接替换测量来源。**

### 5.2 P7 —— 补丁

**锚点**（count === 1，L535）：

```
    const r = stage.getBoundingClientRect();
```

**替换成**：

```
    const r = __harnessRect();     /* [HARNESS] 固定测量结果，见 P0 注入块 */
```

**锚点**（count === 1，L2662-2667 启动段）：

```
  /* =============== 启动 =============== */
  syncHUD();
  updateOrientation();
  resize();
  requestAnimationFrame(function(){ resize(); });
  window.addEventListener("load", resize);
```

**替换成**：

```
  /* =============== 启动 =============== */
  syncHUD();
  updateOrientation();
  resize();          /* [HARNESS] 第 1 次 */
  resize();          /* [HARNESS] 第 2 次：playerX 生效后的 hitX */
  resize();          /* [HARNESS] 第 3 次：冗余但无害，保证与真实浏览器多次 resize 一致 */
  window.addEventListener("load", resize);
```

**为什么**：

* `__harnessRect()` 返回**常量** rect → **所有** `resize()` 调用（启动段的 3 次、`updateOrientation` 里的 rAF + 3 个 `setTimeout`（L517-519）、`window load`（L2667）、窗口 resize 事件）都得到同一个尺寸 → **幂等**。
* 幂等非常关键：`updateOrientation` 的 `setTimeout(resize, 70)` / `setTimeout(resize, 260)` 是**异步**的，落点不确定；`window.addEventListener("load", resize)` 在页面加载后触发。如果测量来源是真实 DOM，这些 resize 会在游戏中途改变 `W/H` → 所有怪物的 `y/w/h` 被重新贴合（L563-574）→ 轨迹分叉。用常量 rect 后，这些 resize **不改变任何布局数值**（`W/H/laneY/hitX/...` 全部重算成同样的值）。
* 连做 3 次 resize 是为了覆盖**模式 B（不打 D2）**：`D2` 未修时，第 1 次 `hitX = 306`、第 2 次起 `hitX = 345.9`。打 3 次后，无论 D2 修没修，`hitX` 都是 345.9。
* `resize()` 里还有 `if (r.width < 2 || r.height < 2) return;`（L536）—— 常量 rect 恒不触发 ✓。
* `DPR = Math.min(window.devicePixelRatio || 1, 2)`（L540）**不进快照**，因此 headless 下的 DPR 取值不影响比对结果（Playwright 默认 1）。

### 5.3 固定 viewport 选 900 × 600

**结论：900 × 600。** 这不是随便挑的，有三条理由：

1. **与 `SPEED_BASE` 的 900 基准宽一致**（L399 `SPEED_BASE = 165; // 初始移速 px/s（900 基准宽）`；L774 `const scale = vw / 900;`）→ `scale = 1.0`，`sf = clamp(1.0, 0.8, 1.9) * rand(0.97, 1.03)` 的乘子落在 `[0.97, 1.03]`，最容易人工核对。
2. **布局数值最「整」**（实测值，900×600）：

   | 量 | 值 | 来源 |
   |---|---|---|
   | `laneY.top` | `168.00000000000003` | `H * 0.28`（L551） |
   | `laneY.bottom` | `432` | `H * 0.72`（L552） |
   | `playerR` | `46` | `clamp(H*0.115, 22, 46)`（L554，撞上上限） |
   | `playerX` | `106.3` | `max(clamp(76.5,48,120), 46*2.05+12)`（L560） |
   | `hitX`（第 2 次起 / D2 修后） | `345.9` | `max(clamp(306,150,430), 106.3+119.6+120)`（L555） |
   | `hitX`（第 1 次，D2 未修） | `306` | `max(306, 0+119.6+120)` |
   | `hitW` | `63.00000000000001` | `clamp(W*0.070, 58, 100)`（L556） |
   | `zoneHalf` | `58.5` | `hitW*0.5 + clamp(27,16,44)`（L558） |
   | `critHalf` | `29.25` | `zoneHalf*0.50`（L559） |
   | 普通怪 `w` × `h` | `49.5` × `78` | L787-788 |
   | 长按怪 `len` × `h` | `234` × `44` | L813-814 |
   | 普通怪出生 `x` | `960` | `W + 60`（L777） |
   | 长按怪出生 `x` | `930` | `W + 30`（L818） |
   | `reachX`（触线线） | `167.2` | `playerX + playerR*1.15 + 8`（L1299） |

   这些值与 brief-03 的快照示例**逐个对得上**（`hitX: 345.9`、`zoneHalf: 58.5`、`critHalf: 29.25`、`x: 960`、`y: 168`、`w: 49.5`、`h: 78`）—— 说明 900×600 就是 brief 设想的 viewport。
3. **⚠️ 但示例里的 `168` 是错的**：`H * 0.28` 的真实 double 是 `168.00000000000003`，不是 `168`。brief-03 的示例 JSON 是手写的，**不能拿它当期望值**。同理 `hitW` 是 `63.00000000000001`。这正好说明为什么比对必须用「两边算出来的同一个表达式」而不是「人肉抄的期望值」（§7.1）。

### 5.4 `buildStars()` 必须完全不碰规则 PRNG

`buildStars`（L579-591）只影响背景星空，但它是**规则随机序列的头号杀手**：

* 900×600 下 `n = Math.round(clamp(W*H/26000, 30, 90)) = Math.round(clamp(20.77, 30, 90)) = 30`；
* 每次调用消耗 `30 × (2 次 Math.random + 3 次 rand) = 150` 次随机；
* `resize()` 在旧版一次开局里至少被调 **2 次**（还可能被 `updateOrientation` 的 3 个 `setTimeout` 再调 3 次）→ **一次开局就挪动 300~600 个规则随机数** → 之后每一次 `spawnMonster` 的选轨 / 速度系数 / y 抖动全部错位 → 轨迹从第一个怪开始就完全不一样。

**对策（本方案已实施）**：

1. `buildStars` 内的 `Math.random()` → `__visNext()`，`rand(...)` → `vrand(...)`（P3 的 V1 / V2）。
2. P3 把**所有**视觉随机点（`buildStars` / `emitFrenzy` / `burst` / `draw` 的抖动）都指向**独立的视觉 PRNG**，规则 PRNG 只剩 15 个白名单调用点。
3. 补丁脚本在产出后跑**白名单断言**（§7.4）——只要有一个视觉调用点漏改，断言立刻失败，不会等到轨迹 diff 才炸。

> 视觉 PRNG 的种子与规则种子不同（`__seed ^ 0x9e3779b9`），保证两条流不会因为「初始状态相同」而意外同相。视觉流的内容**不参与比对**，只要每帧自身可复现即可。

---

## 6. 事件覆盖清单与事件生成器

### 6.1 事件模型

```ts
type TraceEvent =
  | { frame: number; type: 'press';         lane: 'top' | 'bottom'; id: string }
  | { frame: number; type: 'release';      id: string }
  | { frame: number; type: 'cancel-hold' };
```

* `press` → 旧版 `pressLane(lane, id)`；新侧 `reduce(state, {type:'Press', lane, inputId: id})`。
* `release` → 旧版 `releaseHold(id)`；新侧 `{type:'Release', inputId: id}`。
* `cancel-hold` → 旧版 `cancelHold()`；新侧 `{type:'CancelHold'}`。
  ⚠️ `cancelHold()`（L1193-1198）**只清 `holdMon/holdId` 和 `m.holding`，不惩罚**（`m.anchored` 保持 true）→ 与 `release`（→ `failLong` → 惩罚）是两条完全不同的路径，必须分别覆盖。

### 6.2 「静态事件表」还是「脚本化输入生成器」？—— 结论与理由

**结论：混合方案 —— 以「状态驱动的生成器」为主，用「静态事件表」做定点覆盖。**

| 方案 | 优点 | 致命缺点 |
|---|---|---|
| 纯静态事件表 | 逐帧可读、可单点复现 | **帧号是脆的**：任何一个怪的位置差 1 帧，后面所有帧号全错 → diff 变成「满屏红」，而不是「第 N 帧的 hitX 差 0.001」。FEVER 那条要 50+ 次击杀 → 几千行事件表，维护成本爆炸 |
| 纯状态驱动生成器 | 与帧号无关，规则变化不会打断脚本；天然覆盖「怪在圈里就按」这类行为 | 表达不了「**故意不按**」（漏怪、双生窗口过期、长按漏怪），而这几条正是最需要覆盖的分支 |

**推荐的具体形态**：

1. **共享生成器**：`nextEvents(frame, snapshot, scriptState) -> { events, nextState }`，
   **必须是 snapshot 的纯函数**（外加一个显式的 `scriptState`，也要进快照）。
   - 旧 harness 与新回放器**共用同一份源码**（建议放在 `src/game/trace.ts` 或一个无依赖的 `scripts/legacy/event-script.js`；浏览器侧注入源码文本，Node 侧 import 同一文件）。
   - **两边必须共用**，否则两边算出的事件流会不同，diff 会以「怪的位置不同」的形式表现出来，根因却在于事件流。
2. **静态表作为覆盖层**：静态条目优先；静态条目声明一个 `[from, to)` 的「生成器静默窗口」，窗口内生成器不产事件，避免两者打架。
3. **`scriptState` 进快照**：把生成器的内部状态（当前阶段、已按下的 id、是否在静默窗口…）作为快照的一个字段（例如 `"script"`）。这样一旦两边的事件流开始分叉，diff 会**第一眼**指向 `script` 字段，而不是误导到怪物坐标上。

### 6.3 十个必须覆盖的路径（附触发条件与预期旧代码路径）

下面每一行给出：**场景 → 事件序列 → 预期触发的旧代码 → 快照上应看到的现象**。

| # | 场景 | 事件序列（生成器规则） | 预期旧代码路径 | 快照现象 |
|---|---|---|---|---|
| 1 | **普通怪普攻**（落在 `critHalf` 外） | 怪第一次进入 `zoneHalf` 就按（`|x-hitX|` 刚进入 ≤ 58.5，必然 > 29.25） | `pressLane` → 无长按怪 → `strike` → 找到 target（`d ≤ tol`）→ `killMonster(target, false)`（L921） | `kills+1`、`combo+1`、`normalCount+1`、`score+200` |
| 2 | **普通怪暴击**（落在 `critHalf` 内） | 同一只怪**等到** `|x-hitX| ≤ 29.25` 再按 | `killMonster(target, true)`（L921，`bestDist <= critHalf`） | `critCount+1`、`score+300` |
| 3 | **双生：上轨 press → 下一帧下轨 press** | 上轨那只进圈 → 按上轨 → **下一帧**按下轨 | 上轨：`strike` → target 有 partner → `pairPending=true; pairT=0.18`（L913-915）；下轨：`strike` → 命中 `pendingMate` 分支（L885-894）→ `completePair` → `killPair`（L990-1026） | `kills+2`、`combo+2`（**双生一次算 2 连击**）、`score+700`（双暴击 +1000） |
| 4 | **双生：上轨 press → 等窗口过期** | 上轨按一次；之后 **≥ 11 帧**不按下轨 | tick 第 3 段：`m.pairT -= dt` → ≤ 0 → `resolvePairSolo(m)`（L1029）→ `killMonster(m, crit, true)` → `pairBlast(p)`（L1044-1058） | `hp-20`、`score+200/300`（silent 击杀）、`playerFlash` 表现层；`combo` **不**清零（`pairBlast` 不动 combo） |
| 5 | **双生：两轨同时触线** | 两只都**不按** | tick 第 4 段：`breached` 里有两只 → 第一只的 mate 被标记 `dead` 并移出数组（L1368-1370）→ `hurtPlayer(m)` → 第二只因 `m.dead` 被 `continue` 跳过（L1364） | `hp-20` **只扣一次**、`combo=0` |
| 6 | **长按怪：头部进圈 → press → 按住 3 秒 → `completeLong`** | 头进圈（`x + h*0.46 ∈ [hitX-zoneHalf, hitX+zoneHalf]`）→ 按住该轨，**不松手**，直到怪消失 | `pressLane` → `startHold`（L1103-1123，`headAwarded` +200）→ tick 第 2 段 `m.holdT += dt` → `holdT ≥ 1` 时 +200（L1334）→ `holdT ≥ 3` → `completeLong`（L1158-1191） | `score +600`、`kills+1`、`combo+1`、`normalCount+1`（**长按怪算普攻，不算暴击**）；`kills` 只 +1（三段得分不加 combo/kills） |
| 7 | **长按怪：press 后提前 release → `failLong`** | 按住 → 若干帧后发 `release`（同 id） | `releaseHold(id)`（L1125-1128）→ `failLong`（L1147）→ `longPenalty`（L1130-1145） | **`hp` 不变**；`combo=0`、`frenzyActive=false`、`feverT=0`、`nextFeverAt=50`；怪变 `hold-escaped` |
| 8 | **长按怪：头部越过判定区 → `missLong`** | 头进圈后**故意不按** | tick 第 1 段：`longHeadX(m) < hitX - zoneHalf` → `missLong(m)`（L1311-1313）→ `longPenalty` | 同 #7（`hp` 不变、`combo=0`、怪变 `hold-escaped`） |
| 9 | **漏怪：普通怪触线** | 该怪**不按** | tick 第 4 段：`m.x - m.w/2 <= reachX` → `hurtPlayer(m)`（L1215-1232） | `hp-20`、`combo=0`、`frenzyActive=false`、`feverT=0`、`nextFeverAt=50`；怪离场 |
| 10 | **FEVER 触发（连击到 50）** | 持续「进圈就按」，**一次都不能漏** | 第 50 次击杀时 `killMonster`（L937-943）：`triggered = !frenzyActive && combo >= nextFeverAt` → `feverT=10`、`frenzyActive=true`、`nextFeverAt=combo+50`；**本次击杀的 gain 已经按 ×1.5 结算**（L946 在 triggered 之后） | `frenzyActive=true`、`feverT` 从 10 逐帧衰减、`nextFeverAt=100`；该次击杀 `score += round(200*1.5)=300` |

### 6.4 长按怪路径的前置条件（**必须打 D1**）

长按怪的出场条件（L750-757）：

```
now > 8 && longCooldown <= 0 && !hasActiveLong() && !hasActivePair()
  → const lane = clearLane();
  → if (lane && Math.random() < 0.28) { spawnLong(lane); longCooldown = rand(14, 18); }
```

* `now > 8` → 最早 t = 8.017（第 482 帧附近）。
* `longCooldown` 初值 6.0（L665），每帧减 dt（L1296）→ t = 6 时归零，但 `now > 8` 更晚 → 实际首次尝试在 t ≈ 8.02。
* `clearLane()` 在旧版（有 bug）**恒返回 null** → 长按怪刷不出来 → **#6/#7/#8 三条覆盖不到**。

**→ 模式 A 必须打 D1（§2.5）。这是模式 A 相对旧版的唯一语义改动，两边都要打。**

### 6.5 FEVER 场景的可行性评估与建议

**问题**：FEVER 需要 `combo` 连续到 50。任何一次「漏怪触线」（#9）或「长按惩罚」（#7/#8）都会把 combo 清零 → 必须重新攒。

**更麻烦的是长按怪本身**：长按怪**独占一轨**（`laneBlocked`，L800-802），而 `clearLane()`（D1 修好后）**只看长按怪**、不看普通怪 → 长按怪可能刷进**已经有普通怪的那一轨**。那一轨上的普通怪从此**打不到**（`pressLane` 优先返回长按怪，L1063-1078）→ 必然触线 → combo 清零 + 掉血。

**→ 在真实游戏里，「连击到 50」本身就是一件需要运气的事；用「什么都不按」的跑法几乎必然在中途被长按怪断掉。**

**建议（按优先级）**：

1. **用「脚本化输入生成器」而不是长事件表**。理由见 §6.2；具体地：生成器规则 =「任何普通怪第一次进 `zoneHalf` 就按（保证普攻）/ 隔一只怪改用「等进 `critHalf` 再按」（保证暴击）」，这样 #1 #2 自动覆盖，且天然不会漏怪。
2. **FEVER 用一条独立 trace**，并把它的**目标写成「让 combo 峰值到 50」**而不是「写 50 次 press」。生成器负责「进圈就按」，长按怪出现时**按住到完成**（`completeLong` 不清 combo，见 L1158-1191 → 只 `combo++`）→ 不破坏连击；真正会断连击的只有「长按怪刷进了有普通怪的轨道」。
3. **用种子搜索挑一个 FEVER trace**（这是可行且必要的）：
   * 写一个 `scripts/legacy/find-seed.mjs`：在 harness 里跑候选种子（harness 可以**跳过 `draw()`** 以加速 —— 视觉不影响轨迹，见 §7.6），记录 `combo` 峰值、`frenzyActive` 首次为真的帧、`hp` 最低值；
   * **难度用 2★**：`spawnMul = 2` → 刷新间隔减半（L737）→ 50 杀所需时间从 ~64s 降到 ~32s → 长按怪出现次数从 ~4 次降到 ~2 次 → 「长按怪刷进有怪轨道」的概率显著下降；
   * 搜索目标：`combo` 峰值 ≥ 50 且 `hp > 0`；
   * 代价：每次试跑 ~40s 模拟 = 2400 帧，浏览器里很快（可跳过 draw）。几十个种子就能找到。
4. **如果实在找不到满足条件的种子**：退而求其次，把 FEVER 的覆盖拆成两层 ——
   * **层 1（trace 内）**：验证 `frenzyActive` / `feverT` / `nextFeverAt` 这三个字段的**逐帧一致**，用一条**较短的** trace 即可（哪怕还没触发 FEVER，`frenzyActive` 一直是 false，两边一致也算覆盖了「没触发」这一侧）；
   * **层 2（新规则层的单测）**：在 `src/game/rules/__tests__` 里直接构造 `combo = 49` 的状态，跑一次 `killMonster` → 断言 FEVER 触发 + 本次击杀享 ×1.5。**但这一层不能替代 trace**：它绕过了「连击怎么攒起来」这条链路。
5. **不要**为了让 FEVER 触发而给 harness 打「直接改 combo」的补丁 —— 那会破坏「旧版语义」的前提，trace 就不再是旧版的轨迹了。

> **帧数与体积**：FEVER trace 若按 2★ + 40s 算是 ~2400 帧；普通 120s 的 soak trace 是 7200 帧。每帧快照约 200~600 字节（取决于在场怪数）→ 单条 trace 1~5 MB。**建议用 JSONL（每帧一行）**，这样 diff 可以流式比对、可以只加载分叉点附近。

### 6.6 长按怪事件的两个精确细节（写脚本时必须知道）

1. **`holdT` 到 3 需要 181 帧，不是 180**：`m.holdT = Math.min(m.holdT + dt, 3)`（L1331），`dt = 1/60`。实测 180 次累加得 `2.9999999999999942 < 3` → **第 181 个 tick 才 `completeLong`**。所以生成器**不能**用「按住 180 帧」这种硬编码，应该「**按住直到该怪从快照里消失**（或超时兜底）」。
2. **`startHold` 之后 press 无效**：旧版 `pressLane` 在 `if (holdMon || m.escaped) return;`（L1065）处就返回；`startHold` 自己也 `if (holdMon) return;`（L1104）。→ 按住期间**同轨**再按是 no-op；但**另一轨**的 press 仍然正常走 `strike`（因为 `findLongInLane(lane)` 只看被按的那一轨）。生成器在按住期间要继续打另一轨。

### 6.7 模式 B 的雷区（PRNG 流错位）—— 建议改用 B′

brief-03 的模式 B 定义是「旧 harness 保留 `clearLane` bug，新侧已修 D1」，期望「允许 D1 造成的分叉，并能自动归因」。

**问题**：D1 修复前后，`clearLane()` 的**PRNG 消费次数不同**：

| | 旧版（有 bug） | 新版（D1 修） |
|---|---|---|
| 场上有普通怪时 | `clearLane()` 走 `return null`，**不消费** | `clearLane()` 返回一条轨 → **消费 1 次**（L806） |
| 后果 | L752 的 `Math.random() < 0.28` 被短路，**不消费** | L752 **消费 1 次** |

→ 在**第一次**满足「`now > 8 && longCooldown <= 0 && !hasActiveLong() && !hasActivePair()`」的时刻，两边的随机流**错开 1~2 个数** → 从那以后所有 `spawnMonster` 的选轨 / `sf` / `y` 抖动 / `phase` / `wob` 全不一样 → **整条轨迹在那一帧之后彻底分叉**，而且分叉的表现是「怪的轨道不一样」，**不是**「长按怪出现时机不一样」。

→ brief-03 里那条归因启发式（「分叉的根因是长按怪生成时机不同」）**在这种错位下不可靠**，脚本很可能把 D1 造成的分叉误判成「未知差异」而红。

**推荐改成模式 B′**：

* **B′：两边都保留旧的 `clearLane` bug**（旧 harness 不打 D1；新规则层加一个 `legacyClearLane` 开关走旧语义），要求**逐帧完全一致**。
* 论证：旧版 = 新版 + D1 修复。B′ 证明了「除了 D1，新旧完全等价」；再单独跑「旧版 buggy vs 新版 fixed」就能看到 D1 的**全部**影响面。这比「在一个已经错位的流里猜第一处分叉的归因」强得多，而且**可以自动验证**（不需要人眼判断归因）。
* 若必须保留 brief 原文的模式 B，则**归因规则要改成**：找到第一处分叉帧 → 检查该帧是否满足「旧版 `clearLane()` 返回 null 而新版返回了轨」→ 若满足，标记为 D1，并**额外**报告「此后随机流已错位 N 次」；不要试图逐帧归因后续分叉。

---

---

## 7. 陷阱清单

> 每条给出：**坑 → 症状（假阳性/假阴性）→ 对策 → 证据**。

### 7.1 T1 —— 浮点表示误差与序列化策略

* **症状（假阳性）**：两边算出的 double 差 1 ULP → 逐位比较直接红，但业务上完全等价。
* **症状（假阴性）**：brief-03 建议的「固定 6 位小数」会**掩盖**真实差异（1e-6 以内的坐标漂移在 7200 帧里可累积成可见偏差）；而且**四舍五入到 6 位会在 `.5` 边界抖动**（old=1.0000004999 → 1.000000，new=1.0000005001 → 1.000001）→ 明明只差 2e-10 却被判为不一致。
* **对策**：
  1. **离散字段**（`hp` / `score` / `combo` / `maxCombo` / `kills` / `critCount` / `normalCount` / `frenzyActive` / `state` / `kind` / `lane` / 怪物的**数组长度与顺序**）→ **必须逐位相等**，不做任何容差。
  2. **连续字段**（`now` / `x` / `y` / `w` / `h` / `feverT` / `hitX` / `zoneHalf` / `critHalf`）→ **容差 1e-9**（比 6 位小数严格 1000 倍），并且**把实际差值打进报告**。
  3. **6 位小数只用于「人类可读的 diff 展示」**，绝不作为通过判据。
  4. 关键在于：两个实现**做同样的运算、同样的顺序**时，double 是**逐位相同**的 → 1e-9 的容差只是给「结构不同但等价」的写法留的后门，不是常态。
* **证据**：`laneY.top = H * 0.28 = 168.00000000000003`（不是 168！）；`hitW = 63.00000000000001`。brief-03 的示例快照把这些写成了 `168`，**手抄的期望值本身就是错的**。

### 7.2 T2 —— `now` 的累加顺序

* **症状**：新侧若用 `now = frame * dt` 代替 `now += dt`，两者在 7200 帧后会差若干 ULP → 撞上 `now > 6`（L760）/ `now > 8`（L750）阈值时行为分叉。
* **对策**：两边都用**重复加法**。旧版是 `now += dt`（L1286）；新侧 `tick()` 是 `state.now + step`（`src/game/rules/tick.ts:76`）—— 已经是加法 ✓，**但回放器不要自己算 `now`**，要用 `tick()` 的结果。
* **证据**：实测 60 次累加 `1/60` 得 `1.0000000000000013`（不是 1）；`m.holdT` 累加 180 次得 `2.9999999999999942`（见 T25）。

### 7.3 T3 —— `m.x` / `m.y` 的累加顺序

* **症状**：`m.x += m.vx * dt`（旧 L1320）与 `m.x + vx * step`（新 `tick.ts:120`）在**表达式分组不同**时会差 ULP。
* **对策**：快照里 `x` 用 1e-9 容差；两边保持同样的表达式形状（先乘后加）。
* **补充**：`m.y` 只在生成时算一次 `laneY[lane] + rand(-6,6)`（L779）→ 之后不变（`resize` 会重新贴合 `m.y = laneY[m.lane]`，但固定 rect 下是恒等变换）。

### 7.4 T4 —— `Math.random()` 的调用次数（视觉 vs 规则）—— **本方案的头号陷阱**

* **症状**：任意一个**视觉**调用点漏改 → 规则随机序列错位 → 从下一个随机调用点开始，**所有**怪的轨道 / 速度 / y 抖动全变 → 轨迹看起来「整体不一样」，根因却是一个 `rand()`。
* **量级（900×600 实测）**：

  | 调用点 | 每次消耗 | 触发频率 | 一次开局的累计影响 |
  |---|---|---|---|
  | `buildStars`（L579-591） | `30 × 5 = 150` | 每次 `resize()` | 2~6 次 resize → **300~900** |
  | `burst`（L1256-1273） | 每个粒子 4 次 | `killMonster` 一次 = 36 粒子 | **144**/击杀（暴击 208） |
  | `killPair`（L990-1026） | 2 只 × (28+12) 粒子 + 2 只 × (16+10) | 一次双生击破 | **~200+** |
  | `emitFrenzy`（L1238-1254） | 8 | FEVER 期间每次发射 | FEVER 期间持续 |
  | `draw()` 抖动（L1463） | 2 | `shake > 0.2` 的每一帧 | 每次击杀后 30~60 帧 → **60~120**/击杀 |

* **对策（三重）**：
  1. P3 把这 6 处**逐条**改到视觉 PRNG（§2.4）。
  2. **补丁脚本产出后必须跑白名单断言**（下面）。
  3. 任何时候怀疑「随机错位」时，先比对**两侧的随机消费计数**（见 §8.4 的 `rngCount` 探针）。
* **白名单断言（补丁脚本的硬性后置检查）**：

  打完之后，扫描 `legacy-harness.html`，**所有** `Math.random` 与 `rand(` 调用点必须**恰好**落在下列集合里：

  | 行号 | 调用 | 归属 |
  |---|---|---|
  | 735 | `rand(-0.12,0.16)` | 规则 |
  | 752 | `__rulesNext() < 0.28` | 规则 |
  | 754 | `rand(14, 18)` | 规则 |
  | 760 | `__rulesNext() < 0.20` | 规则 |
  | 762 | `rand(5.0, 8.0)` | 规则 |
  | 766 | `__rulesNext() < 0.5` | 规则 |
  | 775 | `rand(0.97, 1.03)` | 规则 |
  | 779 | `rand(-6, 6)` | 规则 |
  | 789 | `rand(0, Math.PI*2)` | 规则 |
  | 790 | `rand(0.8, 1.6)` | 规则 |
  | 806 | `__rulesNext() < 0.5` | 规则（`clearLane` 内） |
  | 823 | `rand(0, Math.PI*2)` | 规则（长按怪） |
  | 835 | `rand(0.97, 1.03)` | 规则（双生 sf） |
  | 841 | `rand(0, Math.PI*2)` | 规则（双生 phase） |
  | 846 | `rand(0.8, 1.6)` | 规则（双生 wob，**每只怪一次，共 2 次**） |

  → **规则随机消费点共 15 处、每次 spawn 的消费序列固定**。断言不通过 = 补丁有漏。

### 7.5 T5 —— `resize()` 的触发时机

* **症状**：`updateOrientation()`（L500-520）里有 `requestAnimationFrame(resize)` + **三个** `setTimeout(resize, 70/260)`；启动段还有 `requestAnimationFrame(function(){resize();})`（L2666）与 `window.addEventListener("load", resize)`（L2667）。这些 resize 的**落点不确定**，且会改 `W/H/laneY/hitX` 并**重新贴合在场怪物的 `y/w/h`**（L563-574）→ 若测量来源是真实 DOM，轨迹会在某个随机时刻分叉。
* **对策**：P7 把测量来源换成**常量 rect** → 所有 resize 幂等 → 触发时机不再重要。**不要**试图去控制 resize 的调用次数。
* **补充**：P7 仍然显式做 3 次 resize，是为了覆盖「D2 未修」时 `hitX` 的首次值（§2.6 / §6.2）。

### 7.6 T6 —— 表现层衰减（`updateParticles` / `updateSlashes` / `updateRings` / `updateFloaters`）

* **结论**：这四个函数（L1413-1452）**不消耗 PRNG**（已逐行核对：只用 `dt` 做算术），**不进快照** → 不影响比对。
* **但**：它们会改变 `particles.length`，而 `burst` 的 `n = Math.min(n, 260 - particles.length)`（L1258）依赖它 → **视觉 PRNG 的消费次数**会变 → 视觉画面不可复现。**无关紧要**（视觉不比对），但要知道：视觉流不是「逐帧可复现」的，只有规则流是。
* **建议**：harness 提供 `?nodraw=1`，跳过 `draw()`（连带跳过 `updateParticles` 等？**不行** —— `updateParticles` 在 tick 里，不在 draw 里）。→ 只能跳过 `draw()` 本身（L1397），这样能省掉 canvas 渲染，规则逻辑一字不变 → **加速种子搜索**（§6.5 第 3 条）。

### 7.7 T7 —— `shake` 抖动用 `rand()`（L1463）

* **症状**：`draw()` 每次 `shake > 0.2` 消耗 2 次 `rand()`。**`rand` 被打成规则 PRNG 之后，这 2 次/帧会直接污染规则随机序列**，而且污染量**取决于玩家打中了多少次**（每次击杀 `shake` 被抬到 5~17）→ 越是打得准，轨迹越容易分叉 → **极具迷惑性**（看起来像「打得准就错」）。
* **对策**：P3 的 V5 把 L1463 改成 `vrand(...)`（走视觉 PRNG）。
* **额外保险**：`__recordFrame()` 放在 `draw();` **之后**（任务要求的位置）—— 已核对：`draw()` 及其子函数**不修改任何规则状态**（§5 全量 grep：`m.*=` / `monsters=` / `now=` / `hp=` 等赋值全部落在 `resize` / 规则函数 / `loop` 里，`drawBackground` / `drawRails` / `drawMonsters` / ... 只读不写）→ 快照放在 `draw()` 前后等价。

### 7.8 T8 —— `buildStars` 污染规则随机序列

见 §5.4（专门展开）。核心数字：**每次 resize 150 次**，一次开局 2~6 次 resize。

### 7.9 T9 —— 注入事件与 DOM 事件重复触发

* **症状**：harness 若用 `page.mouse.click()` / `dispatchEvent` 注入输入，旧版的 `stage.addEventListener("pointerdown")`（L2536-2552）会**再触发一次** `pressLane` → 同一帧双击 → 普攻变双击 / 双生第一击后立刻被第二击打断。
* **对策**：事件**在页面内直接调用** `pressLane(lane, id)` / `releaseHold(id)` / `cancelHold()`（P5 的 `__applyEvents` 就是这么做的），**不产生任何 DOM 事件**。
* **补充**：旧版键盘通道用固定 id `"key-top"` / `"key-bottom"`（L2569/L2571）→ harness 不要复用这两个 id，避免和 `holdId` 语义混淆。

### 7.10 T10 —— D1 造成的 PRNG 流错位（模式 B）

见 §6.3。**建议模式 B′（两边都保留 bug → 逐帧一致）**，否则 brief 的自动归因不可靠。

### 7.11 T11 —— D2 的 `hitX` 首次值

见 §2.6 / §6.2。模式 A 打 D2；模式 B 必须让旧版跑满 2 次 `resize()`。

### 7.12 T12 —— 长按怪刷不出来（`clearLane` bug）

见 §2.5 / §6.4。模式 A 打 D1。

### 7.13 T13 —— 双生怪的 `wob` 抽取次数：旧版 2 次 / 新版 1 次（**新规则层现存的真实缺陷**）

* **证据（旧版）**：`spawnPair` 的 `mk` 闭包里写着 `wob: rand(0.8, 1.6)`（L846），而 `mk` 被调用**两次**（L851 `const a = mk("top"), b = mk("bottom");`）→ **消耗 2 次 PRNG**，且两只怪的 `wob` **不同**。
* **证据（新侧）**：`src/game/rules/spawn.ts:173` 给 `a` 赋 `wob: rng.range(0.8, 1.6)`，L180 的 `b` 是 `{ ...a, id: bId, lane: 'bottom', y: ..., partnerId: aId }` → **只消耗 1 次**，且 `b.wob === a.wob`。
* **症状**：第一次刷出双生怪时，两边随机流**错开 1 个数** → 之后所有随机量全错位 → 轨迹全分叉。**这正是 golden-trace 门禁要抓的东西**。
* **对策**：新侧必须**每只怪抽一次** `wob`（即 `b` 不能直接继承 `a.wob`）。
* **备注**：`legacy-semantics.md` §9 的随机点表只列了「847 / 846 `rand(0.8,1.6)`」**一行**，没有写明它被调用两次；表里的行号 847 也与实际 846 不符。建议在语义笔记里补一句「双生怪的 `wob` 抽 2 次，两只不同」。

### 7.14 T14 —— 新侧 `removed` 怪物滞留一帧

* **证据**：新侧 `killMonster` 等只置 `removed: true`（`resolve.ts:85` / `226` / `351` / `557` / `647`），怪物**留在数组里**，直到**下一 tick 开头**才被过滤（`tick.ts:76` `monsters: state.monsters.filter((m) => !m.removed)`）。旧版是**当场**移除（L978 等）。
* **症状**：若快照直接取 `state.monsters`，新侧会比旧侧**多一只刚被击杀的怪**（而且它的 `x` 是死亡瞬间的位置）→ 每一次击杀都产生一次假阳性。
* **对策**：**两侧的「在场」谓词必须写成同一份共享规范**（§4.4）：旧侧 `!m.dead && !(m.long && m.done)`（恒真，可作断言），新侧 `!m.removed`（真正起作用）。
* **附带**：新侧在 tick 内做 `hasActiveLong` / `laneBlocked` / `strike` 找目标时都是用 `!m.removed` 过滤的 ✓ 与旧版语义等价。

### 7.15 T15 —— 双生窗口的「过期」发生在 tick 里

* **症状**：以为「press 之间隔 > 0.18s 就过期」→ 实际窗口是**从第一击那帧的 tick 开始**递减 `pairT`，且 `strike` 的 `pendingMate` 分支**不检查 `pairT`**（L885-894）→ 只要还没被 tick 判过期就还能补齐。
* **对策**：第二击必须**紧跟第一击的下一帧**（≤ 10 帧内一定安全）；要测「过期」分支就**至少空 11 帧**（0.18s / (1/60) = 10.8 帧）。
* **证据**：`m.pairT = PAIR_WINDOW`（L914）→ tick 第 3 段 `m.pairT -= dt`（L1354）→ `pairT <= 0` 才 `resolvePairSolo`（L1355-1358）。

### 7.16 T16 —— `pressLane` 的优先级与「太早」不挥空刀

* **症状**：长按怪所在轨道上，**普通怪打不到**（`pressLane` 优先返回长按怪分支，L1063-1078）；头还没进圈时 press **不会**顺带打普通怪（L1069-1075 直接 `return`）→ 脚本设计者以为「按一下总没错」会漏掉一整条轨。
* **对策**：生成器在长按怪存在时，**不要**把该轨的普通怪算作可击杀目标；同时长按怪必须被按住到完成，否则该轨的普通怪会集体触线。

### 7.17 T17 —— `release` 与 `cancel-hold` 是两条不同的路径

* `releaseHold(id)` → `failLong` → `longPenalty` → **combo 清零 + FEVER 中断**（L1125-1145）。
* `cancelHold()` → 只清 `holdMon/holdId/m.holding`，**不惩罚**，`m.anchored` 保持 true（L1193-1198）。
* **对策**：两条路径都要有事件类型；不能用 `cancel-hold` 代替 `release` 去覆盖 `failLong`。

### 7.18 T18 —— `pauseGame()` 会静默 `cancelHold()`

* **证据**：`pauseGame()` 第一件事就是 `cancelHold()`（L685）→ 暂停 = 不惩罚地松手 → 长按怪保持 `anchored`，其 `waitT` 继续倒计时（L1342-1345）→ 6 秒后 `failLong`。
* **对策**：golden trace **不要**包含暂停/恢复（会引入 `lastT = 0`（L695）、`cancelHold`、宽限倒计时三条额外语义）。如果一定要覆盖暂停，单独开一条 trace，并保证新旧两侧的 `pause/resume` 事件在同一帧。

### 7.19 T19 —— `hurtPlayer` 不设 `dead` 标志

* **证据**：L1215-1232 里**没有** `m.dead = true`，只有 `monsters = monsters.filter(x => x !== m)`（L1229）。
* **对策**：旧侧的「已离场」谓词不能只查 `m.dead`（漏怪后旧怪虽然已离场，但它本来就没死过）。→ 这也是为什么旧侧的断言式过滤（§4.4）更稳。

### 7.20 T20 —— `best` 与 `localStorage`

* **证据**：`best` 在 L463 从 `localStorage["dualrail_best"]` 读，`gameOverNow` 在 L726 写；`resetGame` **不**重置 `best`（L650-669）。
* **对策**：`best` **不进快照** ✓；harness 用**全新的浏览器上下文**（Playwright 默认即是）→ `best = 0`，行为确定。

### 7.21 T21 —— `diffLevel` 不在 `resetGame` 里

* **证据**：L408 `let diffLevel = 1;`，`resetGame()`（L650-669）不碰它；改难度只能点 DOM 按钮（L2631-2640）。
* **对策**：harness 在 P0 注入块里直接 `diffLevel = __diff;`（`?diff=1|2`）；新侧显式设 `state.diffLevel`。

### 7.22 T22 —— 帧号对齐与停止条件

* **症状**：血量归零 → `gameOverNow()`（L715-730）把 `state` 置 `"over"` → `loop` 走 else 分支，`now` 不再累加（`stepVisualOnly`）。若两边「结束的那一帧」判定不同（比如新侧在 `hp` 归零后还多跑一帧），帧数就差 1。
* **对策**：
  * `__recordFrame()` 只在 `state === "running"` 时记录；`__stepFrames` 遇到非 running 立即 `break`；
  * 新侧回放器用同样的规则；
  * 建议快照里加 `state` 字段 → 结束帧一目了然。

### 7.23 T23 —— `now > 6` / `now > 8` 阈值与浮点

* **症状**：`now` 恰好落在 8.0 附近时，两边若 `now` 差 1 ULP → 一边进长按判定、另一边不进 → 分叉。
* **对策**：靠 T2（累加顺序一致）根治；`now` 用 1e-9 容差比对，并在 diff 里**额外打印**「这一帧的 `now` 距离阈值有多远」。

### 7.24 T24 —— 长按需要 181 帧而不是 180

见 §6.6 第 1 条。生成器不要硬编码帧数。

### 7.25 T25 —— brief-03 的快照示例值有误

`"y": 168` 实际是 `168.00000000000003`（`H * 0.28` 的 double）。**不要**把手抄的期望值写进断言。

### 7.26 T26 —— `updateOrientation` 可能把游戏暂停

* **证据**：L514 `if (state === "running"){ pausedByOrientation = true; pauseGame(); }`；触发条件是竖屏（`mq.matches` 为 false 且 `innerWidth <= innerHeight`）。
* **对策**：Playwright viewport 设 **900×600（横屏）** → `matchMedia("(orientation: landscape)")` 为 true → 不暂停。另外 harness 不应触发 `window resize` 事件（viewport 在 `page.goto` **之前**设好）。

### 7.27 T27 —— `tryImmersive()` 的 fullscreen

* **证据**：L2513-2517 `beginFromTap()` 会调 `tryImmersive()`（fullscreen + `screen.orientation.lock`）。
* **对策**：harness **直接调 `startGame()`**，不走 `beginFromTap()` → 不碰 fullscreen。

### 7.28 T28 —— 副作用类 API

* `navigator.vibrate`（L1234-1236）在 headless Chromium 里是 no-op，不影响规则状态 ✓。
* `localStorage.setItem`（L726）只写 `best`，不进快照 ✓。
* `ctx.setTransform` / `cv.width` 设置（canvas 侧）不影响规则 ✓。

### 7.29 T29 —— 不进快照的字段清单（两边必须一致地排除）

`vt`（视觉时钟）、`particles` / `slashes` / `rings` / `floaters`（表现层）、`shake` / `playerFlash`（表现层）、`attackT` / `attackLane`（出招动作）、`bgStars`、`best`、`difficulty`（可由 `now` 推导）、`m.phase` / `m.wob`（视觉；但 `wob` 影响随机序列！）、`m.sf`（影响 `x`，已由 `x` 覆盖）、`m.tipT`（节流时间戳）、`m.vx`（每帧重算）、`pairSeq` / `pairCooldown` / `longCooldown` / `pairHintShown` / `longHintShown` / `holdMon` / `holdId` / `spawnTimer`。

> 其中 **`holdMon` / `holdId` 值得进快照**（或用 `state` 字段 `hold-holding` 间接表达）：`holdId` 是「谁在按」，新旧实现的表示不同（旧版是指针 id 字符串，新侧是 `holdInputId`），但**语义上可以只记「有没有人在按」**。

---

## 8. 补丁脚本骨架与自检

### 8.1 产出物

```
scripts/legacy/
  patch-legacy.mjs      # 读 source.html → 生成 legacy-harness.html（生成物，不入 git）
  legacy-harness.html   # 生成物
  event-script.js       # 共享事件脚本（浏览器注入 + Node import 同一份）
  trace-legacy.mjs      # Playwright 驱动 harness，产出 legacy trace JSONL
```

### 8.2 `patch-legacy.mjs` 的形状

```js
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'source.html';   // 只读（仓库根）
const OUT = 'scripts/legacy/legacy-harness.html';

let html = readFileSync(SRC, 'utf8');
const mode = process.argv[2] ?? 'A';        // 'A' | 'B' | 'Bprime'

function sub(anchor, replacement, { optional = false } = {}) {
  const n = html.split(anchor).length - 1;
  if (n === 0 && optional) return;
  if (n !== 1) throw new Error(`anchor count ${n} (expect 1):\n${anchor}`);
  html = html.replace(anchor, replacement);
}

// —— P0 + P1：注入 harness 运行时 + rand 改走规则 PRNG
sub(HARNESS_ANCHOR, HARNESS_BLOCK);

// —— P2：规则层 4 处 Math.random
sub('      if (lane && Math.random() < 0.28){', '      if (lane && __rulesNext() < 0.28){');
sub('... now > 6 && pairCooldown <= 0 && Math.random() < 0.20){', '... __rulesNext() < 0.20){');
sub('    let lane = Math.random() < 0.5 ? "top" : "bottom";', '    let lane = __rulesNext() < 0.5 ? "top" : "bottom";');
sub('    if (!topBusy && !botBusy) return Math.random() < 0.5 ? "top" : "bottom";',
    '    if (!topBusy && !botBusy) return __rulesNext() < 0.5 ? "top" : "bottom";');

// —— P3：视觉随机 → 视觉 PRNG（6 处，逐一替换）

// —— P4：合成时钟
sub('  function loop(ts){\n    raf = requestAnimationFrame(loop);',
    '  function loop(ts){\n    if (!__fixedStep) raf = requestAnimationFrame(loop);');
sub(DT_BLOCK, FIXED_DT_BLOCK);

// —— P5：事件注入
sub('    if (state === "running"){\n      now += dt;',
    '    if (state === "running"){\n      __applyEvents(__frame);\n      now += dt;');

// —— P6：快照
sub('    draw();\n  }\n\n  function stepVisualOnly(dt){',
    '    __recordFrame();\n    draw();\n  }\n\n  function stepVisualOnly(dt){');

// —— P7：固定 viewport
sub('    const r = stage.getBoundingClientRect();', '    const r = __harnessRect();');
sub(BOOT_BLOCK, BOOT_BLOCK_PATCHED);

// —— P8：双生怪 kind 标记
sub(TWIN_MK_BLOCK, TWIN_MK_BLOCK_PATCHED);

// —— D1（仅模式 A）
if (mode === 'A') sub(CLEAR_LANE_BLOCK, CLEAR_LANE_BLOCK_FIXED);

// —— D2（全部模式）
sub(LAYOUT_BLOCK, LAYOUT_BLOCK_FIXED);

// —— 后置自检（§8.3 / §8.4）
assertRandomWhitelist(html);
assertNoLeftoverRaf(html);

writeFileSync(OUT, html);
```

### 8.3 后置自检 1：随机点白名单（硬性）

```js
const RULE_CALLS = [
  'const raw = clamp(base + rand(-0.12,0.16), 0.62, 1.45);',   // 735
  'if (lane && __rulesNext() < 0.28){',                            // 752
  'longCooldown = rand(14, 18);',                                  // 754
  'pairCooldown <= 0 && __rulesNext() < 0.20){',                   // 760
  'pairCooldown = rand(5.0, 8.0);',                                // 762
  'let lane = __rulesNext() < 0.5 ? "top" : "bottom";',            // 766
  'const sf = clamp(scale, 0.8, 1.9) * rand(0.97, 1.03);',         // 775
  'const y = laneY[lane] + rand(-6, 6);',                          // 779
  'phase: rand(0, Math.PI*2),',                                    // 789
  'wob: rand(0.8, 1.6)',                                          // 790
  'if (!topBusy && !botBusy) return __rulesNext() < 0.5 ? "top" : "bottom";', // 806
  'phase: rand(0, Math.PI*2),',                                    // 823
  'const sf = clamp(scale, 0.8, 1.9) * rand(0.97, 1.03);',         // 835
  'const phase = rand(0, Math.PI*2);',                             // 841
  'phase: phase, wob: rand(0.8, 1.6),',                            // 846（调用 2 次）
];
// 断言：html 中不再有任何 `Math.random(`；且 `rand(` / `__rulesNext(` 的出现位置全部落在白名单行
```

> 更强的做法：把每个白名单锚点的**出现次数**也断言掉（例如 `phase: rand(0, Math.PI*2),` 应出现 **2 次**：L789 与 L823），这样「双生怪多抽/少抽一次 `wob`」这类偏差也能在补丁阶段就被看见。

### 8.4 后置自检 2：随机消费计数探针

在 harness 里加一个计数器（仅 harness 模式）：

```js
let __rulesDraws = 0;
function __rulesNext(){ __rulesDraws++; return __rulesRng(); }
```

并把 `__rulesDraws` 暴露到 `window.__harness`。→ 当两边轨迹分叉时，**第一件事**是比对「第 N 帧时两边各消费了多少次规则随机」。如果差值 ≠ 0 → **根因是随机消费次数不同**（而不是坐标算错），可以直接定位到 T13/T4 那一类问题。这条自检能把「分叉」从「现象」降级为「可归因」。

### 8.5 后置自检 3：rAF 已屏蔽

断言 `html` 里 `window.requestAnimationFrame = function(){ return 0; };` 存在，且 `loop()` 里的 rAF 已被 `if (!__fixedStep)` 包住。

### 8.6 驱动脚本（Playwright）要点

```js
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });  // 横屏，避免竖屏自动暂停
const page = await ctx.newPage();
await page.goto('file://' + HARNESS_PATH + '?seed=123&diff=1&fixedstep=1&w=900&h=600');
await page.waitForFunction(() => !!window.__harness);
await page.evaluate(() => window.__harness.start());
const trace = await page.evaluate((n) => { window.__harness.stepFrames(n); return window.__harness.trace(); }, FRAMES);
```

* **不要**用 `page.mouse.*`（T9）。
* viewport 必须在 `goto` **之前**设好（T26）。
* 每条 trace 用一个**全新 context**（T20）。

---

## 9. 已知限制 / 未验证项 / 风险

| # | 项 | 状态 |
|---|---|---|
| 1 | 本方案的所有锚点**唯一性**已在 `source.html` 上实测（除 V3 的缩进已按实际 4 空格修正） | ✅ 已验证（脚本逐条 count） |
| 2 | 900×600 的布局数值、`holdT` 181 帧、`now` 累加误差、`buildStars` 150 次/次、`killMonster` 144 次/击杀 | ✅ 已用 Node 实测 |
| 3 | `draw()` 及其子函数**不修改规则状态** | ✅ 已全量 grep 核对 |
| 4 | `updateParticles` / `updateSlashes` / `updateRings` / `updateFloaters` **不消耗 PRNG** | ✅ 已逐行核对（L1413-1452） |
| 5 | 新规则层（worktree 02）已实现 D1 / D2 / `mulberry32` | ✅ 已读源码核对 |
| 6 | 新侧 `spawnPair` 的 `wob` 只抽 1 次（旧版抽 2 次）→ **T13 是新侧的真实缺陷，需修** | ⚠️ 已定位，未修 |
| 7 | 新侧 `removed` 怪物滞留一帧 → 快照必须过滤（T14） | ⚠️ 已定位，需在 `src/game/trace.ts` 处理 |
| 8 | 「FEVER 能被某组种子稳定触发」 | ❓ **未验证**：需要跑种子搜索（§6.5 第 3 条）。建议 2★ + 几十个种子试跑 |
| 9 | 「模式 B′（两边都保留 `clearLane` bug → 逐帧一致）」 | ❓ **未验证**：需要新规则层加 `legacyClearLane` 开关 |
| 10 | 事件脚本（生成器 + 静态表）的具体实现 | ❓ 本文只给了**契约与判定条件**；具体生成器代码属票 03 的实现工作 |
| 11 | trace 的存储格式（JSONL vs JSON）与体积 | 建议 JSONL；单条 120s soak ≈ 7200 帧 ≈ 1~5 MB（未实测） |
| 12 | `?nodraw=1` 跳过 `draw()` 加速种子搜索 | 可行但**未实测**（`draw()` 不改规则状态已核对） |
| 13 | brief-03 说「模式 B = 旧版不打 D1」 | ⚠️ 本方案建议改为 **B′**（§6.7）；若维持原样，必须改归因算法 |
| 14 | `legacy-semantics.md` §9 的随机点表 | ⚠️ 漏记「双生 `wob` 抽 2 次」，行号 847 应为 846（§7.13） |

---

## 10. 一页速查

```
补丁顺序（每步断言锚点唯一）：
  1. P0+P1  注入 harness 块（PRNG/时钟/viewport/轨迹/API）+ rand → __rulesNext
  2. P2    4 处 Math.random → __rulesNext   (752 / 760 / 766 / 806)
  3. P3    6 处视觉随机 → __visNext/vrand   (584-588 / 1241-1252 / 1261-1268 / 1463)
  4. P4    loop 的 rAF 关掉；dt 固定 1/60
  5. P5    if (state === "running"){ 之后、now += dt 之前 → __applyEvents(__frame)
  6. P6    draw(); 之后 → __recordFrame()
  7. P7    resize 的测量来源 → __harnessRect()；启动段 resize ×3
  8. P8    spawnPair 的 mk 里加 __kind:"twin"
  9. D2    playerX 提到 hitX 之前
 10. D1    clearLane 只把长按怪算占用            （仅模式 A）
 11. 自检  随机白名单 + rAF 已屏蔽 + 规则随机计数探针

快照字段：hp score combo maxCombo kills critCount normalCount
          frenzyActive feverT now hitX zoneHalf critHalf monsters[]
          （建议再加 state / nextFeverAt / script）
monster：  kind(normal|twin|hold) lane x y w h state(7 值)
在场谓词： 旧 !m.dead && !(m.long && m.done)（恒真，作断言）
          新 !m.removed（真正起作用）

时钟：    ts = 1000 + i*(1000/60)（非零起点，避开 !lastT 的 falsy-zero 陷阱）
          dt = 1/60（固定 double，不从时间戳反算）
          事件先于 tick，事件看到的 now 是上一帧末的值
布局：    固定 rect 900×600 → hitX 345.9 / zoneHalf 58.5 / critHalf 29.25
          （laneY.top 实为 168.00000000000003，不是 168）
```
