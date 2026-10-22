/**
 * 生成旧版 harness —— 读 `source.html`（**只读**）→ 写 `legacy-harness-<mode>.html`。
 *
 * 补丁方案来自 `scripts/legacy/legacy-patch-spec.md`（11 条补丁，
 * 锚点原文已实测 `count === 1`）。本脚本是该方案的**可执行实现**：
 *
 * | 补丁 | 目的 |
 * |---|---|
 * | P0  | 注入 harness 运行时（PRNG / 合成时钟 / 固定 viewport / 轨迹 / API） |
 * | P1  | `rand(a,b)` 改走**规则** PRNG |
 * | P2  | 规则层 4 处 `Math.random()` 改走规则 PRNG |
 * | P3  | 视觉随机（6 处）改走**独立**视觉 PRNG |
 * | P4  | 合成时钟：屏蔽 rAF 自动递归 + 固定 `dt = 1/60` |
 * | P5  | 事件注入点：先应用事件、再推进 tick |
 * | P6  | 逐帧快照记录 |
 * | P7  | 确定性 viewport / 布局（常量 rect + 启动段 3 次 resize） |
 * | P8  | 双生怪打永久 `kind` 标记（仅供快照） |
 * | D1  | `clearLane` 修复（**仅模式 A**） |
 * | D2  | `playerX` 先于 `hitX` 计算（全部模式） |
 *
 * **共享事件剧本**：`src/game/trace.ts` 用 `typescript.transpileModule` 转成 JS
 * 内联进 harness（`window.__traceScript`）—— 旧 harness 与新回放器因此消费
 * **同一份**事件生成器，事件流是快照的纯函数，而不是两边各自判断。
 *
 * 用法：
 *   node scripts/legacy/patch-legacy.mjs A        # → legacy-harness-A.html
 *   node scripts/legacy/patch-legacy.mjs Bprime    # → legacy-harness-Bprime.html
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SRC = resolve(ROOT, 'source.html');
const TRACE_TS = resolve(ROOT, 'src/game/trace.ts');

/** 支持的补丁模式。 */
export const HARNESS_MODES = ['A', 'Bprime'];

/**
 * 打补丁，产出 harness 的 HTML 文本。
 *
 * @param {'A'|'Bprime'} mode
 * @returns {string} 打好补丁的 HTML
 */
export function patchHarness(mode) {
  if (!HARNESS_MODES.includes(mode)) {
    throw new Error(`未知模式：${mode}（只支持 ${HARNESS_MODES.join(' | ')}）`);
  }

  /* ------------------------------------------------------------------ *
   * 共享事件剧本：src/game/trace.ts → 浏览器可执行
   * ------------------------------------------------------------------ */

  /**
   * 把 `src/game/trace.ts` 转译成可以直接塞进 `<script>` 的 JS。
   *
   * `trace.ts` 只 `import type`（类型导入会被 `transpileModule` 擦除），
   * 所以产物**没有任何 import** —— 可以原样内联。
   */
  function buildTraceScript() {
    const source = readFileSync(TRACE_TS, 'utf8');
    const { outputText, diagnostics } = ts.transpileModule(source, {
      fileName: 'trace.ts',
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        removeComments: false,
      },
    });
    if (diagnostics && diagnostics.length > 0) {
      throw new Error(`trace.ts 转译诊断：${JSON.stringify(diagnostics)}`);
    }
    if (/^\s*import\s/m.test(outputText) || /^\s*export\s+\*/m.test(outputText)) {
      throw new Error('trace.ts 转译后仍含 import/export * —— 不能内联进 harness');
    }
    // 去掉 `export ` 前缀，转成 IIFE 的返回值
    const body = outputText.replace(/^export\s+/gm, '');
    return `(function(){
${body}
  return {
    canonicalMonsterState: canonicalMonsterState,
    legacyMonsterFlags: legacyMonsterFlags,
    stateMonsterFlags: stateMonsterFlags,
    makeTraceFrame: makeTraceFrame,
    traceFrameFromState: traceFrameFromState,
    nextEvents: nextEvents,
    createScriptState: createScriptState,
    shouldRecordPhase: shouldRecordPhase
  };
})()`;
  }

  /* ------------------------------------------------------------------ *
   * 补丁
   * ------------------------------------------------------------------ */

  let html = readFileSync(SRC, 'utf8');

  /** 唯一锚点替换：锚点必须恰好出现一次。 */
  function sub(anchor, replacement, label) {
    const n = html.split(anchor).length - 1;
    if (n !== 1) {
      throw new Error(`[${label}] 锚点出现 ${n} 次（期望 1）：\n${anchor.slice(0, 160)}`);
    }
    html = html.replace(anchor, replacement);
  }

  /* —— P0：注入 harness 运行时 —— */
  const P0_ANCHOR = `  /* =============== 工具 =============== */
  function rand(a,b){ return a + Math.random()*(b-a); }`;

  const P0_BLOCK = `  /* =============== HARNESS (golden trace) =============== */
  /* 由 scripts/legacy/patch-legacy.mjs 注入；不修改 source.html 本身。 */
  window.__traceScript = ${buildTraceScript()};

  const __q = new URLSearchParams(location.search);
  const __seed = (__q.get("seed") !== null ? Number(__q.get("seed")) : 20240101) >>> 0;
  const __diff = (__q.get("diff") === "2") ? 2 : 1;
  const __vw = Number(__q.get("w") || 900);
  const __vh = Number(__q.get("h") || 600);
  const __fixedStep = (__q.get("fixedstep") !== "0");
  const __fixedDt = 1 / 60;                 // 0.016666666666666666
  const __tsBase = 1000;                    // 非零、单调递增的时间戳起点（避开 !lastT 的 falsy-zero 陷阱）
  const __noDraw = (__q.get("nodraw") === "1");
  /* 剧本模式：idle = 零输入（一个键都不按）→ 必然漏怪 → 走到 game over */
  const __scriptMode = (__q.get("script") === "idle") ? "idle" : "active";
  const __trace = [];
  let __frame = 0;
  let __rulesRng = null;
  let __visRng = null;
  let __rulesDraws = 0;
  let __scriptState = null;
  let __prevSnapshot = null;
  let __overRecorded = false;

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
  function __rulesNext(){ __rulesDraws++; return __rulesRng(); }
  function __visNext(){ return __visRng(); }
  function vrand(a,b){ return a + __visNext()*(b-a); }   /* 仅供视觉层使用 */

  __rulesRng = __mulberry32(__seed);
  __visRng   = __mulberry32((__seed ^ 0x9e3779b9) >>> 0);
  __scriptState = window.__traceScript.createScriptState(__scriptMode);
  diffLevel  = __diff;                      /* diffLevel 是模块级变量，不在 resetGame 里重置 */

  if (__fixedStep){
    /* 屏蔽 rAF：startGame / resumeGame / 启动段 / updateOrientation 全部不再自动排队 */
    window.requestAnimationFrame = function(){ return 0; };
    window.cancelAnimationFrame  = function(){};
  }

  function __harnessRect(){
    return { x:0, y:0, left:0, top:0, right:__vw, bottom:__vh, width:__vw, height:__vh };
  }

  function __recordFrame(){
    /* [HARNESS] 终态帧也要记。
     *
     * state 变成 "over" 的那一帧（hp = 0）是「血量归零 → 结算 → 进入 over 态」
     * 唯一的快照证据 —— 分数结算、连击清零、FEVER 中断、phase 转换全都在这一帧上。
     * 旧写法 "if (state !== running) return;" 会把它丢掉，于是 game over 路径
     * 完全没有保真保护（门禁「一致地错」而照绿）。
     *
     * 判定与新回放器**共用** window.__traceScript.shouldRecordPhase() ——
     * 两边必须同时停在同一帧上。__stepFrames 在 state !== "running" 时停，
     * 所以终态帧只会被调用一次；__overRecorded 只是兜底。
     */
    if (!window.__traceScript.shouldRecordPhase(state)) return;
    if (state === "over"){
      if (__overRecorded) return;
      __overRecorded = true;
    }
    const ms = [];
    for (const m of monsters){
      /* 旧实现里「离场」与「从数组移除」是同一次调用里完成的，
         所以下面两个分支在旧版恒为 false —— 断言而非静默过滤。 */
      if (m.dead) throw new Error("harness invariant: dead monster still in monsters[] @frame " + __frame);
      if (m.long && m.done) throw new Error("harness invariant: done long monster still in monsters[] @frame " + __frame);
      const flags = window.__traceScript.legacyMonsterFlags(m);
      ms.push({
        kind: flags.kind,
        lane: m.lane,
        x: m.x, y: m.y, w: m.w, h: m.h,
        state: window.__traceScript.canonicalMonsterState(flags)
      });
    }
    const frame = window.__traceScript.makeTraceFrame({
      frame: __frame,
      dt: __fixedDt,
      rulesDraws: __rulesDraws,
      phase: state,
      hp: hp, score: score, combo: combo, maxCombo: maxCombo, kills: kills,
      critCount: critCount, normalCount: normalCount,
      frenzyActive: frenzyActive, feverT: feverT, nextFeverAt: nextFeverAt,
      now: now,
      hitX: hitX, zoneHalf: zoneHalf, critHalf: critHalf,
      monsters: ms,
      script: __scriptState
    });
    __trace.push(frame);
    __prevSnapshot = frame;
    __frame++;
  }

  /* 事件源：与新回放器共用 src/game/trace.ts 的生成器（快照的纯函数） */
  function __eventSource(){
    const r = window.__traceScript.nextEvents(__prevSnapshot, __scriptState);
    __scriptState = r.script;
    return r.events;
  }

  function __applyEvents(frameIdx){
    const evs = __eventSource();
    for (const ev of evs){
      if (ev.type === "press")            pressLane(ev.lane, ev.id);
      else if (ev.type === "release")     releaseHold(ev.id);
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
    rulesDraws: function(){ return __rulesDraws; },
    reset: function(){ __trace.length = 0; __frame = 0; __prevSnapshot = null; }
  };

  /* =============== 工具 =============== */
  function rand(a,b){ return a + __rulesNext()*(b-a); }`;

  sub(P0_ANCHOR, P0_BLOCK, 'P0');

  /* —— P2：规则层 4 处 Math.random —— */
  sub(
    '      if (lane && Math.random() < 0.28){',
    '      if (lane && __rulesNext() < 0.28){',
    'P2-752',
  );
  sub(
    '    if (!hasActiveLong() && !hasActivePair() && now > 6 && pairCooldown <= 0 && Math.random() < 0.20){',
    '    if (!hasActiveLong() && !hasActivePair() && now > 6 && pairCooldown <= 0 && __rulesNext() < 0.20){',
    'P2-760',
  );
  sub(
    '    let lane = Math.random() < 0.5 ? "top" : "bottom";',
    '    let lane = __rulesNext() < 0.5 ? "top" : "bottom";',
    'P2-766',
  );
  sub(
    '    if (!topBusy && !botBusy) return Math.random() < 0.5 ? "top" : "bottom";',
    '    if (!topBusy && !botBusy) return __rulesNext() < 0.5 ? "top" : "bottom";',
    'P2-806',
  );

  /* —— P3：视觉随机 → 独立视觉 PRNG（6 组锚点） —— */
  sub('        x: Math.random()*W,', '        x: __visNext()*W,', 'P3-V1a');
  sub('        y: Math.random()*H,', '        y: __visNext()*H,', 'P3-V1b');
  sub('        r: rand(0.5,1.6),', '        r: vrand(0.5,1.6),', 'P3-V2a');
  sub('        a: rand(0.08,0.35),', '        a: vrand(0.08,0.35),', 'P3-V2b');
  sub('        s: rand(2,10)', '        s: vrand(2,10)', 'P3-V2c');
  sub('    frenzySparkT = rand(0.035, 0.08);', '    frenzySparkT = vrand(0.035, 0.08);', 'P3-V3a');
  sub('    const a = rand(0, Math.PI*2);', '    const a = vrand(0, Math.PI*2);', 'P3-V3b');
  sub(
    '    const rr = playerR * rand(1.2, 2.1);',
    '    const rr = playerR * vrand(1.2, 2.1);',
    'P3-V3c',
  );
  sub(
    '      vx: -rand(40, 160), vy: rand(-70, 20),',
    '      vx: -vrand(40, 160), vy: vrand(-70, 20),',
    'P3-V3d',
  );
  sub('      r: rand(1.4, 3.2),', '      r: vrand(1.4, 3.2),', 'P3-V3e');
  sub('      life: rand(0.3, 0.7),', '      life: vrand(0.3, 0.7),', 'P3-V3f');
  sub(
    '      color: Math.random() < 0.35 ? "#fff4c2" : GOLD',
    '      color: __visNext() < 0.35 ? "#fff4c2" : GOLD',
    'P3-V3g',
  );
  sub(
    '      const a = Math.random()*Math.PI*2;',
    '      const a = __visNext()*Math.PI*2;',
    'P3-V4a',
  );
  sub('      const sp = rand(60,300)*power;', '      const sp = vrand(60,300)*power;', 'P3-V4b');
  sub('        r:rand(1.2,3.6),', '        r:vrand(1.2,3.6),', 'P3-V4c');
  sub('        life:rand(0.25,0.65),', '        life:vrand(0.25,0.65),', 'P3-V4d');
  sub(
    '      ctx.translate(rand(-shake,shake)*0.5, rand(-shake,shake)*0.5);',
    '      ctx.translate(vrand(-shake,shake)*0.5, vrand(-shake,shake)*0.5);',
    'P3-V5',
  );

  /* —— P4：合成时钟 —— */
  sub(
    '  function loop(ts){\n    raf = requestAnimationFrame(loop);',
    '  function loop(ts){\n    if (!__fixedStep) raf = requestAnimationFrame(loop);',
    'P4-A',
  );
  sub(
    `    if (!lastT) lastT = ts;
    let dt = (ts - lastT)/1000;
    lastT = ts;
    dt = Math.min(dt, 0.05);`,
    `    let dt;
    if (__fixedStep){
      dt = __fixedDt;     /* [HARNESS] 合成时钟：每帧固定 1/60，与时间戳彻底解耦 */
      lastT = ts;
    } else {
      if (!lastT) lastT = ts;
      dt = (ts - lastT)/1000;
      lastT = ts;
      dt = Math.min(dt, 0.05);
    }`,
    'P4-B',
  );

  /* —— P5：事件注入（先事件、再 tick） —— */
  sub(
    '    if (state === "running"){\n      now += dt;',
    '    if (state === "running"){\n      __applyEvents(__frame);   /* [HARNESS] 先应用脚本化事件，再推进 tick */\n      now += dt;',
    'P5',
  );

  /* —— P6：逐帧快照 —— */
  sub(
    '    draw();\n  }\n\n  function stepVisualOnly(dt){',
    '    __recordFrame();\n    if (!__noDraw) draw();\n  }\n\n  function stepVisualOnly(dt){',
    'P6',
  );

  /* —— P7：确定性 viewport / 布局 —— */
  sub(
    '    const r = stage.getBoundingClientRect();',
    '    const r = __harnessRect();     /* [HARNESS] 固定测量结果 */',
    'P7-a',
  );
  sub(
    `  /* =============== 启动 =============== */
  syncHUD();
  updateOrientation();
  resize();
  requestAnimationFrame(function(){ resize(); });
  window.addEventListener("load", resize);`,
    `  /* =============== 启动 =============== */
  syncHUD();
  updateOrientation();
  resize();          /* [HARNESS] 第 1 次 */
  resize();          /* [HARNESS] 第 2 次：playerX 生效后的 hitX */
  resize();          /* [HARNESS] 第 3 次：冗余但无害，保证与真实浏览器多次 resize 一致 */
  window.addEventListener("load", resize);`,
    'P7-b',
  );

  /* —— P8：双生怪 kind 标记（仅供快照） —— */
  sub(
    `    const mk = function(lane){
      return {
        lane: lane, x: startX, y: laneY[lane],`,
    `    const mk = function(lane){
      return {
        __kind: "twin",   /* [HARNESS] 仅供快照用，不参与任何规则判定 */
        lane: lane, x: startX, y: laneY[lane],`,
    'P8',
  );

  /* —— 票 16（全部模式）：长按贯穿时间 3s → 2s —— */
  sub(
    `  const LONG_HOLD_TIME = 3;      // 需要连续按住的时间（秒）`,
    `  const LONG_HOLD_TIME = 2;      /* [票 16] 与新规则层 LONG_HOLD_TIME 对齐 */`,
    '票16',
  );

  /* —— D2（全部模式）：playerX 先于 hitX —— */
  sub(
    `    playerR = clamp(H * 0.115, 22, 46);
    hitX = Math.max(clamp(W * 0.34, 150, 430), playerX + playerR*2.6 + 120);
    hitW = clamp(W * 0.070, 58, 100);
    // 暴击区半宽 = 外圈半宽的一半：判定落在中心区间的概率约 50%
    zoneHalf = hitW * 0.5 + clamp(W * 0.030, 16, 44);
    critHalf = zoneHalf * 0.50;  // 中心暴击区半宽（约五成暴击率）
    playerX = Math.max(clamp(W * 0.085, 48, 120), playerR * 2.05 + 12);`,
    `    playerR = clamp(H * 0.115, 22, 46);
    /* [D2] playerX 必须在 hitX 之前算出来 —— 与新规则层 computeLayout 的顺序一致 */
    playerX = Math.max(clamp(W * 0.085, 48, 120), playerR * 2.05 + 12);
    /* [票 17] 判定框挂在棒尖：playerX + playerR * CLUB_REACH_R（3.07） */
    hitX = playerX + playerR * 3.07;
    hitW = clamp(W * 0.070, 58, 100);
    // 暴击区半宽 = 外圈半宽的一半：判定落在中心区间的概率约 50%
    zoneHalf = hitW * 0.5 + clamp(W * 0.030, 16, 44);
    critHalf = zoneHalf * 0.50;  // 中心暴击区半宽（约五成暴击率）`,
    'D2',
  );

  /* —— D1（仅模式 A）：clearLane 只把长按怪算占用 —— */
  if (mode === 'A') {
    sub(
      `    const topBusy = monsters.some(function(m){ return m.lane === "top" && !m.done; });
    const botBusy = monsters.some(function(m){ return m.lane === "bottom" && !m.done; });`,
      `    const topBusy = monsters.some(function(m){ return m.long && !m.done && m.lane === "top"; });
    const botBusy = monsters.some(function(m){ return m.long && !m.done && m.lane === "bottom"; });`,
      'D1',
    );
  }

  /* ------------------------------------------------------------------ *
   * 后置自检
   * ------------------------------------------------------------------ */

  /**
   * 规则随机白名单：**15 处调用点**（`scripts/legacy/legacy-patch-spec.md` §7.4）。
   *
   * 断言方式：把文件里所有 `rand(...)` / `Math.random()` 调用**按多重集**取出，
   * 与期望值逐项比对 —— 漏改一处（多出 / 少掉）立刻失败，
   * 「双生怪多抽 / 少抽一次 `wob`」这类偏差也会在补丁阶段就被看见。
   */
  const EXPECTED_RAND_CALLS = [
    'rand(a,b)', // 函数定义本身（改走规则 PRNG）
    'rand(-0.12,0.16)', // 735 刷新间隔
    'rand(14, 18)', // 754 长按冷却
    'rand(5.0, 8.0)', // 762 双生冷却
    'rand(0.97, 1.03)', // 775 普通怪速度系数
    'rand(0.97, 1.03)', // 835 双生速度系数
    'rand(-6, 6)', // 779 普通怪 y 抖动
    'rand(0, Math.PI*2)', // 789 普通怪 phase
    'rand(0, Math.PI*2)', // 823 长按怪 phase
    'rand(0, Math.PI*2)', // 841 双生 phase
    'rand(0.8, 1.6)', // 790 普通怪 wob
    'rand(0.8, 1.6)', // 846 双生 wob（每只怪一次，共 2 次）
  ];

  /** 规则层直接调用的 `Math.random()`（共 4 处，已全部改写）。 */
  const EXPECTED_RULES_NEXT_CALLS = 6; // 1 处定义 + 1 处（rand 函数体）+ 4 处调用

  /** 视觉随机调用点（走独立视觉 PRNG）：`vrand(...)` + `__visNext()`。 */
  const EXPECTED_VRAND_CALLS = 16; // 1 处定义 + 15 处调用（V2×3 / V3×7 / V4×3 / V5×2）
  const EXPECTED_VIS_NEXT_CALLS = 6; // 1 处定义 + 1 处（vrand 函数体）+ 4 处调用（V1×2 / V3g / V4a）

  function multiset(list) {
    const m = new Map();
    for (const item of list) m.set(item, (m.get(item) ?? 0) + 1);
    return m;
  }

  function assertSameMultiset(label, found, expected) {
    const a = multiset(found);
    const b = multiset(expected);
    const keys = new Set([...a.keys(), ...b.keys()]);
    for (const key of keys) {
      if ((a.get(key) ?? 0) !== (b.get(key) ?? 0)) {
        throw new Error(
          `[白名单] ${label} "${key}" 出现 ${a.get(key) ?? 0} 次（期望 ${b.get(key) ?? 0} 次）`,
        );
      }
    }
  }

  const foundRandCalls = [...html.matchAll(/(?<![A-Za-z0-9_])rand\([^()]*\)/g)].map((m) => m[0]);
  assertSameMultiset('rand() 调用', foundRandCalls, EXPECTED_RAND_CALLS);

  const foundMathRandom = html.match(/Math\.random\(\)/g) ?? [];
  if (foundMathRandom.length !== 0) {
    throw new Error(`[白名单] 仍有 ${foundMathRandom.length} 处 \`Math.random()\` 未被改写`);
  }

  const foundRulesNext = html.match(/__rulesNext\(\)/g) ?? [];
  if (foundRulesNext.length !== EXPECTED_RULES_NEXT_CALLS) {
    throw new Error(
      `[白名单] \`__rulesNext()\` 出现 ${foundRulesNext.length} 次（期望 ${EXPECTED_RULES_NEXT_CALLS} 次）`,
    );
  }

  const foundVrand = html.match(/(?<![A-Za-z0-9_])vrand\([^()]*\)/g) ?? [];
  if (foundVrand.length !== EXPECTED_VRAND_CALLS) {
    throw new Error(
      `[白名单] \`vrand()\` 出现 ${foundVrand.length} 次（期望 ${EXPECTED_VRAND_CALLS} 次）`,
    );
  }

  const foundVisNext = html.match(/__visNext\(\)/g) ?? [];
  if (foundVisNext.length !== EXPECTED_VIS_NEXT_CALLS) {
    throw new Error(
      `[白名单] \`__visNext()\` 出现 ${foundVisNext.length} 次（期望 ${EXPECTED_VIS_NEXT_CALLS} 次）`,
    );
  }

  // rAF 已屏蔽
  if (!html.includes('window.requestAnimationFrame = function(){ return 0; };')) {
    throw new Error('[自检] rAF 屏蔽代码缺失');
  }
  if (!html.includes('if (!__fixedStep) raf = requestAnimationFrame(loop);')) {
    throw new Error('[自检] loop() 的 rAF 未被条件化');
  }

  // 共享事件剧本已注入
  if (!html.includes('window.__traceScript =')) {
    throw new Error('[自检] 共享事件剧本未注入');
  }

  return html;
}

/** harness 文件的绝对路径。 */
export function harnessPath(mode) {
  return resolve(HERE, `legacy-harness-${mode}.html`);
}

/** 生成并落盘 harness（门禁脚本用这个，保证跑门禁前 harness 一定是最新的）。 */
export function writeHarness(mode) {
  const html = patchHarness(mode);
  const out = harnessPath(mode);
  writeFileSync(out, html, 'utf8');
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('patch-legacy.mjs')) {
  const cliMode = process.argv[2] ?? 'A';
  if (!HARNESS_MODES.includes(cliMode)) {
    console.error(`未知模式：${cliMode}（只支持 ${HARNESS_MODES.join(' | ')}）`);
    process.exit(2);
  }
  const out = writeHarness(cliMode);
  console.log(`[patch-legacy] 模式 ${cliMode} → ${out}`);
  console.log(
    `[patch-legacy] 规则随机白名单 11 处 rand() + 4 处 __rulesNext() = 15 处；` +
      `视觉随机 15 处 vrand() + 4 处 __visNext()；Math.random 残留 0 处`,
  );
}
