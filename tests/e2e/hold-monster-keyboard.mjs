#!/usr/bin/env node
/**
 * 端到端：键盘长按怪 —— 键盘按住到底，贯穿整只长按怪。
 *
 * 跑法（先 build）：
 *   npm run build
 *   node tests/e2e/hold-monster-keyboard.mjs
 *
 * **要证明的事**（现行依据是票 16 / 票 17，不再是 brief-05 §4）：
 *
 * > 票 16：长按要按住的时间 `LONG_HOLD_TIME` 缩短了（`src/game/constants.ts`），
 * >        toast 文案也跟着变（`src/game/rules/resolve.ts`）。
 * > 票 17：判定框挪到棒尖（`hitX = playerX + playerR * CLUB_REACH_R`），
 * >        长按怪要走到更靠左才进判定区，等待窗口因此变长。
 *
 * 这两条改动让「按旧时长写死的脚本」同时过期了三处（票 19）：
 *
 * 1. **时长**：脚本的文件头、断言文案、`waitToast` 的超时全都按旧时长写死。
 *    现在**从源码读常量与 toast 文案**（见下面的 `readConstant` / `readHoldToastText`），
 *    秒数再改脚本不用改。
 * 2. **判定框**：位置变了之后，头进圈的窗口更长更靠左。
 *    现在**盯住长按怪的头进圈再按键**，不再靠「按住一会儿看看起没起手」。
 * 3. **脚本自己不打普通怪**：旧脚本只按住方向键等长按怪刷新，
 *    期间普通怪全漏过去掉血 → 玩家在长按怪进圈之前就结算了。
 *    现在**等待期用指针自动清普通怪**（复用 `tests/e2e/fx-moments.mjs` 的 `AUTO_PLAY` 片段）。
 *
 * **要证明的结论**：桌面键盘这条输入路径能起手、能按住到底，走完长按的三个得分点
 * （头部 / 满 1 秒 / 尾部），而且**按住的是键盘** —— 自动打怪只碰普通怪，
 * 碰长按怪的那条轨道一次都没点过（脚本末尾会验这一点）。
 *
 * **怎么驱动**（长按怪的时序是概率性的，全程用可观察信号驱动）：
 *
 * 1. 长按怪在 `now > 8s` 之后按 **28%** 概率刷新 → 出现时弹 toast
 *    「长按敌人！头进判定框后点击」。等这条 toast。
 * 2. 扫描画面找到那条长胶囊（**>120px 的实心长条**只有长按怪有）→ 知道它在哪条轨。
 * 3. 头的核心在**进圈时变白**（`hold-monster.ts` 的 `inWindow` 分支）→ 白核出现 = 头进圈。
 *    这时按下对应轨的方向键 → 规则层 `startHold` → toast「长按中… 保持 N 秒」+ 头部 +N。
 *    **这就是「起手成功」的信号。**
 * 4. 起手成功后**不能松键**（松键 = `releaseHold` = 长按失败，怪会自逃），
 *    所以脚本一直按着，直到 toast「长按贯穿！」+ 尾部 +N；期间第 1 秒还有一次 +N。
 *
 * **断言**：出现「长按贯穿！」toast，且分数比按键前多
 * `LONG_HEAD_GAIN + LONG_1S_GAIN + LONG_TAIL_GAIN`（三个得分点都在内）。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assert,
  launchBrowser,
  openApp,
  readHud,
  readPhase,
  shot,
  toastCount,
} from './lib/harness.mjs';

/* ------------------------------------------------------------------ *
 * 常量与文案：全部从源码读，脚本里不写死秒数
 * ------------------------------------------------------------------ */

/** 从 `src/game/constants.ts` 读一个数值常量。 */
function readConstant(name) {
  const src = readFileSync(resolve(process.cwd(), 'src/game/constants.ts'), 'utf8');
  const m = new RegExp(`export const ${name} = ([0-9.]+);`).exec(src);
  if (!m) throw new Error(`src/game/constants.ts 里读不到常量 ${name}`);
  return Number(m[1]);
}

/**
 * 从 `src/game/rules/resolve.ts` 读「长按中…」toast 的文案。
 *
 * 源码写的是 `'长按中… 保持 ' + LONG_HOLD_TIME + ' 秒'`，
 * 这里把拼接式抠出来再按当前常量拼回去 —— 文案随源码变，脚本不用跟着改。
 */
function readHoldToastText(holdSeconds) {
  const src = readFileSync(resolve(process.cwd(), 'src/game/rules/resolve.ts'), 'utf8');
  const m = /text:\s*'([^']*长按中[^']*)'\s*\+\s*LONG_HOLD_TIME\s*\+\s*'([^']*)'/.exec(src);
  if (!m) throw new Error('src/game/rules/resolve.ts 里读不到「长按中…」toast 文案');
  return m[1] + holdSeconds + m[2];
}

/** 要连续按住的时间（秒）—— 票 16 定下的值，脚本不写死。 */
const LONG_HOLD_TIME = readConstant('LONG_HOLD_TIME');
/** 击中头部的分数。 */
const LONG_HEAD_GAIN = readConstant('LONG_HEAD_GAIN');
/** 按住满 1 秒的分数。 */
const LONG_1S_GAIN = readConstant('LONG_1S_GAIN');
/** 贯穿到尾部的分数。 */
const LONG_TAIL_GAIN = readConstant('LONG_TAIL_GAIN');
/** 「长按中…」toast 的文案（跟着 `LONG_HOLD_TIME` 走）。 */
const HOLD_TOAST_TEXT = readHoldToastText(LONG_HOLD_TIME);

/** 等长按怪刷新（游戏时间 ≥ 8s 之后按 28% 概率刷，且要求有一条空轨 → 可能刷很久）。 */
const SPAWN_TIMEOUT_MS = 240_000;
/** 起手阶段的总预算（找长按怪 + 等头进圈 + 按键）。 */
const START_TIMEOUT_MS = 150_000;
/** 按住之后的超时：`LONG_HOLD_TIME` 秒 + 余量。 */
const HOLD_TIMEOUT_MS = LONG_HOLD_TIME * 1000 + 5_000;
/** 长按怪那条轨的「别碰」宽限：按住期间它不再绘制身体，画面上认不出来了。 */
const LONG_HOLD_GRACE_MS = LONG_HOLD_TIME * 1000 + 3_000;
/** 「像怪一样宽」的实心段才算普通怪（普通怪宽 40~62px；判定框中心那颗圆点只有 7px）。 */
const MIN_MONSTER_RUN = 35;
/** 「头进圈」时段的余量：扫描比真实进圈晚不到一帧，留 100ms 兜住。 */
const HEAD_WINDOW_MARGIN_MS = 100;

/** 方向键 → 轨道。 */
const LANE_KEY = { top: 'ArrowUp', bottom: 'ArrowDown' };

/* ------------------------------------------------------------------ *
 * 页内扫描器 + 自动打怪
 * ------------------------------------------------------------------ */

/**
 * 每帧扫两条轨道，同时顺手把普通怪清掉（**一段，跑在页面里**）。
 *
 * 复用 `tests/e2e/fx-moments.mjs` 的 `AUTO_PLAY` 片段（同一套像素判读），
 * 但改了长按怪那一支：
 *
 * - `fx-moments` 里长按怪是**按住不放**用指针打穿的；
 * - 本脚本要验的是**键盘**路径，所以长按怪**一根手指都不碰** ——
 *   只把它的位置（轨道 + 头有没有进圈）报给 Node 侧，由 Node 侧发键盘事件。
 *
 * ## 像素判读
 *
 * - 轨道中线上方 6~16px 的一条带里找**最长连续实心段**：
 *   普通怪宽 40~62px，长按怪是 180~300px 的长胶囊 → **>120px 的只有长按怪**。
 * - 长按怪的**头核心在进圈时是纯白**（`hold-monster.ts` 的 `inWindow` 分支），
 *   在长条左端附近找白色连续段就能定位头 → 也就知道「头进圈了」。
 *
 * 状态挂在 `globalThis.__autoPlay`（点击冷却）与 `globalThis.__scan`（每帧的扫描结果）。
 */
const SCAN_AND_PLAY = ({
  hitX,
  laneYs,
  canvasSel,
  stageSel,
  cooldownMs,
  longGraceMs,
  minMonsterRun,
}) => {
  const stage = globalThis.document.querySelector(stageSel);
  const canvas = globalThis.document.querySelector(canvasSel);
  if (!stage || !(canvas instanceof globalThis.HTMLCanvasElement)) return false;
  const scratch = globalThis.document.createElement('canvas');
  scratch.width = canvas.width;
  scratch.height = canvas.height;
  const sctx = scratch.getContext('2d');
  if (!sctx) return false;

  const state =
    globalThis.__autoPlay ??
    (globalThis.__autoPlay = {
      lastClick: [-1e9, -1e9],
      clicks: [],
      frames: 0,
      longSeen: [-1e9, -1e9],
      wasLong: [false, false],
      headIn: [
        { from: -1, to: -1 },
        { from: -1, to: -1 },
      ],
    });

  const dpr = canvas.width / (canvas.clientWidth || canvas.width);
  const rect = stage.getBoundingClientRect();

  const dispatch = (type, laneY, pointerId, atX) => {
    const init = {
      clientX: rect.left + atX,
      clientY: rect.top + laneY,
      pointerId,
      bubbles: true,
      isPrimary: true,
      cancelable: true,
    };
    const target = type === 'pointerdown' ? stage : globalThis;
    target.dispatchEvent(new globalThis.PointerEvent(type, init));
  };

  const step = () => {
    const lanes = [];
    for (let laneIdx = 0; laneIdx < laneYs.length; laneIdx++) {
      const laneY = laneYs[laneIdx];
      const lane = laneIdx === 0 ? 'top' : 'bottom';
      const py = Math.round(laneY * dpr);
      // 扫描窗要够宽：长按怪有 180~300px 长，窗口太窄会把它的左边缘裁掉。
      const x0 = Math.max(0, Math.round((hitX - 200) * dpr));
      const x1 = Math.min(canvas.width, Math.round((hitX + 400) * dpr));
      // 取**轨道中线上方 6~16px** 的一条带：
      // 轨道中线本身是亮线，背景是全透明的，只有怪的身体是实的。
      const bandY = Math.max(0, py - Math.round(16 * dpr));
      const bandH = Math.min(canvas.height - bandY, Math.round(10 * dpr) + 1);
      if (x1 <= x0 || bandH <= 0) {
        lanes.push({ lane, long: false, headX: null });
        continue;
      }
      // 只把这几条带从画布上抠过来（整张画布 1280×665 每帧拷一遍太贵）。
      const cols = x1 - x0;
      sctx.clearRect(0, 0, cols, bandH);
      sctx.drawImage(canvas, x0, bandY, cols, bandH, 0, 0, cols, bandH);
      const { data } = sctx.getImageData(0, 0, cols, bandH);
      const dark = new Uint8Array(cols);
      const white = new Uint8Array(cols);
      for (let p = 0; p < data.length; p += 4) {
        if (data[p + 3] <= 150) continue;
        const c = Math.floor(p / 4) % cols;
        dark[c] = 1;
        // 白核：进圈时头核心是纯白（其余部分是绿 / 深色）。
        if (data[p] > 215 && data[p + 1] > 215 && data[p + 2] > 215) white[c] = 1;
      }

      // 最长连续暗段（两只普通怪之间有缝，不会连成一段）。
      let run = 0;
      let best = 0;
      let bestStart = -1;
      let runStart = -1;
      for (let c = 0; c < cols; c++) {
        if (dark[c]) {
          if (run === 0) runStart = c;
          run++;
          if (run > best) {
            best = run;
            bestStart = runStart;
          }
        } else {
          run = 0;
        }
      }

      const isLong = best / dpr > 120;
      const now = globalThis.performance.now();
      let headX = null;
      if (isLong && bestStart >= 0) {
        // 头 ≈ 长条左端 + 17px（`longHeadX = m.x + h * 0.46`，h = 44），
        // 白核就在头那里 → 只在长条左端附近找白色连续段。
        const w0 = Math.max(0, bestStart - Math.round(30 * dpr));
        const w1 = Math.min(cols, bestStart + Math.round(80 * dpr));
        let wrun = 0;
        let wbest = 0;
        let wbestStart = -1;
        let wrunStart = -1;
        for (let c = w0; c < w1; c++) {
          if (white[c]) {
            if (wrun === 0) wrunStart = c;
            wrun++;
            if (wrun > wbest) {
              wbest = wrun;
              wbestStart = wrunStart;
            }
          } else {
            wrun = 0;
          }
        }
        if (wbest / dpr > 4) headX = (x0 + wbestStart + wbest / 2) / dpr;
      }

      // 「头进圈」的时段 —— 只有这段时间里的一次点击才可能**起手**。
      // 记下来给 Node 侧验「自动打怪没有抢过起手」。
      if (isLong && !state.wasLong[laneIdx]) {
        // 新来了一只长按怪 → 重新计时。
        state.headIn[laneIdx] = { from: -1, to: -1 };
      }
      state.wasLong[laneIdx] = isLong;
      if (headX != null) {
        const win = state.headIn[laneIdx];
        if (win.from < 0) win.from = now;
        win.to = now;
      }
      lanes.push({
        lane,
        long: isLong,
        headX,
        headInFrom: state.headIn[laneIdx].from,
        headInTo: state.headIn[laneIdx].to,
      });

      // ── 长按怪：一根手指都不碰 ───────────────────────────
      // 这条轨的输入留给键盘（那才是本脚本要验的东西）。
      //
      // `longSeen` 记的是「这条轨最近一次看见长按怪是什么时候」——
      // 长按怪被按住之后**身体不再绘制**（只画进度槽），光看画面认不出它了，
      // 所以这段时间（`longGraceMs`）里照样不碰这条轨。
      if (isLong) state.longSeen[laneIdx] = now;
      if (now - state.longSeen[laneIdx] < longGraceMs) continue;

      // ── 普通怪：盖住判定区就点 ─────────────────────────
      // **只点「像怪一样宽」的实心段**（普通怪宽 40~62px，量出来 60~100px）。
      // 判定框正中心那颗小圆点（半径 3.4px）也盖住判定区，
      // 点它只是空挥（空挥会清连击），不点。
      const runStartCss = (x0 + bestStart) / dpr;
      const runEndCss = (x0 + bestStart + best) / dpr;
      if (runStartCss > hitX || runEndCss < hitX) continue;
      if (best / dpr < minMonsterRun) continue;
      if (now - state.lastClick[laneIdx] < cooldownMs) continue;
      state.lastClick[laneIdx] = now;
      state.clicks.push({
        lane,
        at: now,
        runLen: +(best / dpr).toFixed(0),
        runStart: +runStartCss.toFixed(0),
        runEnd: +runEndCss.toFixed(0),
      });
      if (state.clicks.length > 1000) state.clicks.shift();
      dispatch('pointerdown', laneY, 1, hitX);
      dispatch('pointerup', laneY, 1, hitX);
    }

    globalThis.__scan = { frames: ++state.frames, at: globalThis.performance.now(), lanes };
    if (!globalThis.__autoStop) globalThis.requestAnimationFrame(step);
  };
  globalThis.requestAnimationFrame(step);
  return true;
};

/* ------------------------------------------------------------------ *
 * Node 侧的小工具
 * ------------------------------------------------------------------ */

/** 等一条 toast 出现（按文本包含匹配，返回记录或 null）。 */
async function waitToast(page, keyword, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate(
      (kw) => globalThis.__toasts.find((t) => t.text.includes(kw)) ?? null,
      keyword,
    );
    if (found) return found;
    await page.waitForTimeout(50);
  }
  return null;
}

/** 等一条**新** toast 出现（只认 `mark` 之后记的）。 */
async function waitToastFrom(page, mark, keyword, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate(
      ({ from, kw }) => globalThis.__toasts.slice(from).find((t) => t.text.includes(kw)) ?? null,
      { from: mark, kw: keyword },
    );
    if (found) return found;
    await page.waitForTimeout(10);
  }
  return null;
}

/** 当前扫描结果。 */
function readScan(page) {
  return page.evaluate(() => globalThis.__scan ?? null);
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const browser = await launchBrowser();
const { page, pageErrors } = await openApp(browser, { query: '?debug' });

try {
  const t0 = Date.now();
  await page.locator('#startScreen h2').click();
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'running', '已进入游戏（1 星）');

  const layout = await page.evaluate(() => globalThis.__FX_DEBUG__.layout());
  console.log(
    `   判定框中心 hitX=${layout.hitX.toFixed(0)} · 判定区半宽 zoneHalf=${layout.zoneHalf.toFixed(0)}`,
  );

  // ── 装上「等待期自动清普通怪」的扫描器 ───────────────────────
  //
  // **为什么要它**：长按怪是概率性刷新的，等它的那段时间玩家什么都不做 →
  // 普通怪全漏过去掉血 → 判定框左移之后这段等待更长 → 玩家先结算
  // （票 19 里报的「游戏在长按怪出现前就结算了」就是这个）。
  //
  // **它不碰长按怪**：长按怪那条轨在它进圈时不会被自动打怪点
  // （脚本末尾会验「自动打怪没有抢过起手」）。
  const installed = await page.evaluate(SCAN_AND_PLAY, {
    hitX: layout.hitX,
    laneYs: [layout.laneY.top, layout.laneY.bottom],
    canvasSel: '.canvas-host canvas',
    stageSel: '.stage',
    cooldownMs: 40,
    longGraceMs: LONG_HOLD_GRACE_MS,
    minMonsterRun: MIN_MONSTER_RUN,
  });
  assert(installed, '自动打怪扫描器已装好（等待期顺手清普通怪）');

  // ── 等长按怪刷新 ─────────────────────────────────────────
  console.log('── 等长按怪刷新（28% 概率，可能要等十几秒）──');
  const spawn = await waitToast(page, '长按敌人', SPAWN_TIMEOUT_MS);
  if (spawn === null) {
    throw new Error(
      `等了 ${Math.round(SPAWN_TIMEOUT_MS / 1000)} 秒还没等到长按怪刷新` +
        '（28% 概率 + 刷怪要有一条空轨，本来就慢）',
    );
  }
  assert(spawn !== null, '长按怪刷新了（toast：长按敌人…）');
  console.log(`   长按怪出现：${spawn.text}（等了 ${Math.round((Date.now() - t0) / 1000)}s）`);

  // ── 起手：等头进圈，按住不放 ─────────────────────────────
  console.log('── 起手（等头进判定框后按住）──');
  //
  // **为什么不「按住一会儿就松手」**：起手成功后松键 = 规则层判长按失败，
  // 怪直接自逃（`failLong` → `escaped: true`），这一局就废了。
  // 所以每次尝试都**先按住再判断**：起手了就继续保持，没起手才松键换一只。
  //
  // **什么时候按**：头的核心进圈时变白 → 画面上出现白核 → 头就在判定区里，
  // 这时按下去必定是 `startHold`（不会「太早」，也不会「漏掉了」）。
  const deadline = Date.now() + START_TIMEOUT_MS;
  let heldKey = null;
  let heldLane = null;
  let scoreBeforeHold = null;
  let pressedAt = 0;
  let attempts = 0;

  while (Date.now() < deadline && heldKey === null) {
    if ((await readPhase(page)) === 'over') {
      throw new Error('游戏在长按怪起手前就结算了');
    }

    // 找长按怪：轨道里有 >120px 的实心长条。
    const scan = await readScan(page);
    const long = scan?.lanes?.find((l) => l.long) ?? null;
    if (!long) {
      await page.waitForTimeout(40);
      continue;
    }

    // 等头进圈（白核出现）。
    let head = null;
    const headDeadline = Date.now() + 20_000;
    while (Date.now() < headDeadline) {
      const s = await readScan(page);
      const l = s?.lanes?.find((x) => x.lane === long.lane) ?? null;
      if (l?.headX != null) {
        head = l;
        break;
      }
      if ((await readPhase(page)) === 'over') {
        throw new Error('游戏在长按怪起手前就结算了');
      }
      await page.waitForTimeout(20);
    }
    if (!head) continue; // 这一只已经错过（自逃了）→ 等下一只

    attempts++;
    const key = LANE_KEY[head.lane];
    const mark = await toastCount(page);
    // 分数基线取在**按键之前**：起手瞬间就会拿到头部 +N，
    // 所以「按键 → 贯穿」这段一共该多出 头 + 1 秒 + 尾部 三份。
    scoreBeforeHold = (await readHud(page)).score;
    pressedAt = await page.evaluate(() => globalThis.performance.now());
    await page.keyboard.down(key);

    const started = await waitToastFrom(page, mark, '长按中', 800);
    if (started) {
      heldKey = key;
      heldLane = head.lane;
      console.log(`   起手成功（${key} · ${head.lane} 轨，保持按住）`);
      assert(
        started.at >= pressedAt,
        `长按是键盘按出来的（toast 出现在按键之后：${Math.round(started.at - pressedAt)}ms）`,
      );
      break;
    }

    // 没起手（头在两次扫描之间溜过去了）→ 松键，等下一只。
    await page.keyboard.up(key);
    console.log('   这一只没抓住（头溜过判定区），松键重来');
  }
  assert(heldKey !== null, `用键盘起手成功（toast：${HOLD_TOAST_TEXT}）`);
  await shot(page, 'hold-1-holding.png');

  // ── 保持按住，等「长按贯穿！」 ─────────────────────────
  console.log(`── 保持按住 ${LONG_HOLD_TIME} 秒 ──`);
  const done = await waitToast(page, '长按贯穿', HOLD_TIMEOUT_MS);
  if (done === null) {
    throw new Error(`按住 ${LONG_HOLD_TIME} 秒了还没等到「长按贯穿！」`);
  }
  assert(done !== null, `长按走完 ${LONG_HOLD_TIME} 秒（toast：长按贯穿！）`);
  await page.keyboard.up(heldKey);
  await shot(page, 'hold-2-done.png');

  // ── 分数增量 ─────────────────────────────────────────────
  const after = await readHud(page);
  const gained = after.score - scoreBeforeHold;
  console.log(`   按键前分数 ${scoreBeforeHold} → 现在 ${after.score}（+${gained}）`);
  // 长按的三个得分点：起手瞬间的头部、按住满 1 秒、贯穿到尾。
  const expectGain = LONG_HEAD_GAIN + LONG_1S_GAIN + LONG_TAIL_GAIN;
  assert(gained >= expectGain, `长按拿到 头 + 1 秒 + 尾部 三份分数（+${gained} ≥ +${expectGain}）`);

  // ── 自动打怪没有在长按怪起手的瞬间抢过输入 ───────────────
  //
  // 这是「按住的是键盘」的关键证据。
  //
  // **指针点击只有在「头进判定区」时才会起手**（`pressLane` 的分支），
  // 所以要验的是：自动打怪**没有在头进圈的那几帧里点过长按怪那条轨**。
  //
  // （自动打怪在长按怪出现之前点那条轨是没问题的 —— 那时头还远，
  // 规则层只会判「太早」。）
  //
  // `HEAD_WINDOW_MARGIN_MS` 是给扫描延迟留的余量：
  // 头真正进圈到扫描看见白核之间差了不到一帧，
  // 这一小段要是真被点过，上面的「toast 出现在按键之后」那条断言会先炸。
  const clicks = await page.evaluate(() => globalThis.__autoPlay?.clicks ?? []);
  const laneScan = (await readScan(page))?.lanes?.find((l) => l.lane === heldLane) ?? null;
  const winFrom = (laneScan?.headInFrom ?? -1) - HEAD_WINDOW_MARGIN_MS;
  const winTo = (laneScan?.headInTo ?? -1) + HEAD_WINDOW_MARGIN_MS;
  const stole = clicks.filter((c) => c.lane === heldLane && c.at >= winFrom && c.at <= winTo);
  assert(
    stole.length === 0,
    `自动打怪没在长按怪起手时抢输入（${heldLane} 轨，头进圈期间的点击 ${stole.length} 次）`,
  );

  assert(
    pageErrors.length === 0,
    `无页面异常${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`,
  );
  console.log(
    `\n✓ 键盘长按怪检查通过（起手尝试 ${attempts} 次 · 全程 ${Math.round((Date.now() - t0) / 1000)}s）`,
  );
} catch (err) {
  console.error(`\n✗ 键盘长按怪检查失败：${String(err)}`);
  await shot(page, 'hold-failure.png').catch(() => undefined);
  process.exitCode = 1;
} finally {
  await page
    .evaluate(() => {
      globalThis.__autoStop = true;
    })
    .catch(() => undefined);
  await browser.close();
}
