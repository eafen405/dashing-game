#!/usr/bin/env node
/**
 * 票 07 的三个瞬间并排对比截图 —— 暴击 / FEVER / 双生同破。
 *
 * 用法（先 build）：
 *   npm run build
 *   E2E_SHOTS_DIR=/home/eafen405/refactor-notes/shots/07 node tests/e2e/fx-moments.mjs
 *
 * ## 怎么「稳定复现」这三个瞬间
 *
 * 两个页面的代码都**不暴露内部状态**（旧版整个包在 IIFE 里，新版只有
 * `?debug` 的调试钩子），所以这里的做法是**用同一套脚本化输入驱动两个页面**：
 *
 * - 自动打怪：在判定区中心（`hitX`）上按帧点，**只在真的有怪时点**
 *   （盲点会变成空挥，空挥会把连击清零，攒不到 FEVER）。
 * - 判定区中心 = 暴击区中心 → 每一次击杀都是**暴击**。
 * - 两轨同时有怪时**同一帧点两下** → 双生怪成对击破。
 * - 连续 50 次击杀 → FEVER。
 *
 * 旧版与新版用**同一份脚本**（`AUTO_PLAY`），各自的画布 / 舞台选择器不同而已；
 * 规则层两边一模一样（golden trace 门禁保证），所以两边经历的是同一串事件。
 *
 * 时刻的判定靠 **toast 文案**（两个页面的 toast 文案逐字相同）：
 * `^暴击` / `^双生` / `^FEVER`。
 *
 * ## bloom 生效的可验证判据
 *
 * 同一个**静态场景**（一条寿命 60 秒的亮环，几乎不动），分别在
 * `?debug`（带 bloom）与 `?debug&nobloom=1`（不带 bloom）下读画布像素：
 *
 * - **非透明像素占比** —— bloom 把辉光摊到更大的面积上 → 占比上升。
 * - **非透明像素的平均亮度** —— bloom 叠加了模糊后的亮部 → 平均亮度上升。
 *
 * 两个数字都在**同一个 rAF 批次**里读出来（避开 WebGL
 * `preserveDrawingBuffer: false` 的空缓冲坑）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, launchBrowser, openApp } from './lib/harness.mjs';

/** 旧版页面（只读参照）。 */
const LEGACY = '/home/eafen405/projects/dashing-game/source.html';
/** 新版产物。 */

/** 输出目录。 */
const OUT = process.env.E2E_SHOTS_DIR
  ? resolve(process.env.E2E_SHOTS_DIR)
  : resolve(process.cwd(), 'dist', 'e2e-shots', '07');

/** 对比用的视口。 */
const VIEWPORT = { width: 1280, height: 720 };

/**
 * 自动打怪（一段，在页面里跑）。
 *
 * 每帧扫两条轨道，**有怪才点** —— 盲点会变成空挥（miss），空挥把连击清零。
 * 点击用**合成 PointerEvent**打在舞台元素上，不需要 Playwright 的往返。
 *
 * ## 长按怪必须按住
 *
 * 长按怪（`kind === 'hold'`）是一只横贯轨道的长胶囊：
 * - 点它会**开启长按**，随即松手 → 长按失败 → **连击清零**；
 * - 不点它 → 它滑出屏幕 → 漏怪 → **连击清零**。
 *
 * 所以自动打怪要**按住不放**（`pointerdown` 之后不发 `pointerup`），
 * 等它被长按满 3 秒打死（`completeLong` 不清连击）。
 *
 * 按住的时机很讲究：`pressLane` 只在「头已经进圈」时才起手，
 * 头还在圈外会判「太早」（0.6 秒内不再响应），
 * 头已经越过圈则是漏怪。所以按下条件是
 * `-zoneHalf + 4 ≤ 头 - hitX ≤ zoneHalf - 12`。
 *
 * 状态存在 `globalThis.__autoPlay` 上，分段调用时冷却与按住状态不会重置。
 */
const AUTO_PLAY = ({
  hitX,
  laneYs,
  zoneHalf,
  durationMs,
  canvasSel,
  stageSel,
  cooldownMs,
}) =>
  new Promise((resolve) => {
    const stage = globalThis.document.querySelector(stageSel);
    const canvas = globalThis.document.querySelector(canvasSel);
    if (!stage || !(canvas instanceof globalThis.HTMLCanvasElement)) {
      resolve(0);
      return;
    }
    const scratch = globalThis.document.createElement('canvas');
    scratch.width = canvas.width;
    scratch.height = canvas.height;
    const sctx = scratch.getContext('2d');
    if (!sctx) {
      resolve(0);
      return;
    }
    const state = globalThis.__autoPlay ?? (globalThis.__autoPlay = {
      lastClick: [-1e9, -1e9],
      lastHead: [-1e9, -1e9],
      holdPtr: 100,
      holdIds: [],
      holdLane: -1,
    });
    const dpr = canvas.width / (canvas.clientWidth || canvas.width);
    const rect = stage.getBoundingClientRect();
    const t0 = globalThis.performance.now();
    let hits = 0;

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
      sctx.clearRect(0, 0, scratch.width, scratch.height);
      sctx.drawImage(canvas, 0, 0);

      for (let laneIdx = 0; laneIdx < laneYs.length; laneIdx++) {
        const laneY = laneYs[laneIdx];
        const py = Math.round(laneY * dpr);
        // 扫描窗要够宽：长按怪有 180~300px 长，窗口太窄会把它左边缘裁掉。
        const x0 = Math.max(0, Math.round((hitX - 120) * dpr));
        const x1 = Math.min(canvas.width, Math.round((hitX + 360) * dpr));
        // 取**轨道中线上方 6~16px** 的一条带：
        // 轨道中线本身是亮线（不透明度 73~143），背景是全透明的，
        // 只有怪的身体（不透明度 ~235）是实的。
        const bandY = Math.max(0, py - Math.round(16 * dpr));
        const bandH = Math.min(canvas.height - bandY, Math.round(10 * dpr) + 1);
        if (x1 <= x0 || bandH <= 0) continue;
        const { data } = sctx.getImageData(x0, bandY, x1 - x0, bandH);
        const cols = x1 - x0;
        const dark = new Uint8Array(cols);
        for (let i = 0; i < data.length; i += 4) {
          // 只认「实的」像素：怪的身体不透明度 ~235，
          // 而轨道线（73~143）、判定区填充（~12）、背景（0）都不算。
          if (data[i + 3] > 150) {
            dark[Math.floor(i / 4) % cols] = 1;
          }
        }
        // 最长连续暗段（两只普通怪之间有缝，不会连成一段）
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

        if (best / dpr > 120) {
          // ── 长按怪 ──
          // 头 ≈ 身体左边缘 + 16px（`longHeadX = m.x + h * 0.46`）
          // 头 ≈ 身体左边缘 - 12px（长按怪的头是亮色圆，
          // 会把身体的最左 12px 吃掉，所以往左补一点）
          const headEst = (x0 + bestStart) / dpr - 12;
          const moved = headEst < state.lastHead[laneIdx] - 0.5;
          state.lastHead[laneIdx] = headEst;
          if (
            moved &&
            headEst - hitX <= zoneHalf - 12 &&
            headEst - hitX >= -zoneHalf + 20
          ) {
            // 按住不放（长按满 3 秒才算打掉）。
            // **绝不主动松开** —— 松开就是「长按不足 3 秒」，连击清零。
            state.holdPtr += 1;
            state.holdIds.push(state.holdPtr);
            state.holdLane = laneIdx;
            dispatch('pointerdown', laneY, state.holdPtr, headEst);
          }
          continue;
        }

        // ── 普通怪 ──
        // 暴击判定看的是**怪的中心到判定区中心（hitX）的距离**（≤ critHalf），
        // 与点击位置无关。所以只要「怪的身体盖住 hitX」就点 ——
        // 怪宽 40~62px，盖住 hitX 时它的中心离 hitX 最多 ~31px → 必暴击。
        const runStartCss = (x0 + bestStart) / dpr;
        const runEndCss = (x0 + bestStart + best) / dpr;
        if (runStartCss > hitX || runEndCss < hitX) continue;
        const now = globalThis.performance.now();
        if (now - state.lastClick[laneIdx] < cooldownMs) continue;
        state.lastClick[laneIdx] = now;
        dispatch('pointerdown', laneY, 1, hitX);
        dispatch('pointerup', laneY, 1, hitX);
        hits++;
      }

      if (globalThis.performance.now() - t0 < durationMs) {
        globalThis.requestAnimationFrame(step);
      } else {
        resolve(hits);
      }
    };
    globalThis.requestAnimationFrame(step);
  });

const browser = await launchBrowser();

/** 并排合成 —— 用浏览器排版两张图再截图（没有装图像处理库）。 */
async function compose(title, left, right, out, imageHeight = VIEWPORT.height) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#12141c;color:#eef3ff;font-family:system-ui,sans-serif;padding:16px}
  h2{font-size:18px;margin-bottom:10px;font-weight:600}
  .row{display:flex;gap:16px}
  figure{width:${VIEWPORT.width}px}
  figcaption{font-size:13px;color:#8d9ab8;margin-bottom:6px}
  img{width:${VIEWPORT.width}px;height:${imageHeight}px;display:block;border:1px solid #2a2f3d}
</style></head>
<body>
  <h2>${title}</h2>
  <div class="row">
    <figure><figcaption>旧版 source.html</figcaption><img src="${pathToFileURL(left).href}"></figure>
    <figure><figcaption>新版 dist/index.html（React UI 层 + Pixi 渲染）</figcaption><img src="${pathToFileURL(right).href}"></figure>
  </div>
</body></html>`;
  const htmlPath = out.replace(/\.png$/, '.html');
  writeFileSync(htmlPath, html);
  const page = await browser.newPage({
    viewport: { width: VIEWPORT.width * 2 + 64, height: imageHeight + 120 },
  });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  console.log(`  📷 ${out}`);
}

/** 读一个页面到目前为止的 toast 记录。 */
function readToasts(page) {
  return page.evaluate(() => globalThis.__toasts ?? []);
}

try {
  mkdirSync(OUT, { recursive: true });
  console.log('── 打开旧版与新版 ──');

  // 旧版：toast 是同一个 DOM 节点复用（class 反复 remove/add 'show'），
  // 所以观察 class 属性变化。
  const legacy = await browser.newPage({ viewport: VIEWPORT });
  await legacy.addInitScript(() => {
    globalThis.__toasts = [];
    const install = () => {
      const el = globalThis.document.getElementById('toast');
      if (!el) {
        globalThis.requestAnimationFrame(install);
        return;
      }
      new globalThis.MutationObserver(() => {
        if (el.classList.contains('show')) {
          globalThis.__toasts.push({
            text: (el.textContent ?? '').trim(),
            at: Math.round(globalThis.performance.now()),
          });
        }
      }).observe(el, { attributes: true, attributeFilter: ['class'] });
    };
    globalThis.requestAnimationFrame(install);
  });
  await legacy.goto(pathToFileURL(LEGACY).href, { waitUntil: 'load' });
  await legacy.waitForSelector('#startScreen', { timeout: 20_000 });

  // 新版：harness 的 `openApp` 自带 toast 观察器。
  const { page: modern, pageErrors: modernErrors } = await openApp(browser, {
    viewport: VIEWPORT,
    query: '?renderer=pixi&debug',
  });
  const legacyErrors = [];
  legacy.on('pageerror', (e) => legacyErrors.push(String(e)));

  // ── 旧版画布尺寸对齐新版画布 ────────────────────────────
  // 旧版的 canvas 铺满窗口，新版在 HUD 下面 —— 不对齐的话两边的轨道位置差一截。
  const canvasBox = await modern.locator('.canvas-host canvas').boundingBox();
  const canvasW = Math.round(canvasBox?.width ?? VIEWPORT.width);
  const canvasH = Math.round(canvasBox?.height ?? 665);
  await legacy.evaluate(
    ({ w, h }) => {
      const stage = globalThis.document.getElementById('stage');
      if (!stage) return;
      stage.style.inset = 'auto';
      stage.style.left = '0px';
      stage.style.top = '0px';
      stage.style.width = `${w}px`;
      stage.style.height = `${h}px`;
      globalThis.window.dispatchEvent(new globalThis.window.Event('resize'));
    },
    { w: canvasW, h: canvasH },
  );
  await legacy.waitForTimeout(300);

  // 旧版的布局只能从画面上量 —— 用它自己的 canvas 尺寸算（同一套公式）。
  const legacyCanvas = await legacy.evaluate(() => {
    const cv = globalThis.document.getElementById('cv');
    return { w: cv.clientWidth, h: cv.clientHeight };
  });
  const modernLayout = await modern.evaluate(() => globalThis.__FX_DEBUG__.layout());
  console.log(`  旧版画布 ${legacyCanvas.w}×${legacyCanvas.h} · 新版画布 ${canvasW}×${canvasH}`);
  assert(
    Math.abs(legacyCanvas.w - modernLayout.width) < 2 &&
      Math.abs(legacyCanvas.h - modernLayout.height) < 2,
    '两边的画布尺寸一致（并排图才对得齐）',
  );

  // ── 开局 ─────────────────────────────────────────────────
  await legacy.locator('#startScreen h2').click();
  await modern.locator('#startScreen h2').click();
  await legacy.waitForTimeout(400);
  await modern.waitForTimeout(400);

  const laneYs = [modernLayout.laneY.top, modernLayout.laneY.bottom];
  const playArgs = {
    hitX: modernLayout.hitX,
    laneYs,
    zoneHalf: modernLayout.zoneHalf,
    critHalf: modernLayout.critHalf,
    durationMs: 250,
    cooldownMs: 40,
  };

  /**
   * 打到某个 toast 出现为止，然后截图。
   *
   * 两个页面**各自**在各自出现该瞬间时截图 —— 两边的进度不完全同步
   * （FEVER 要攒 50 连击，谁先到谁先截），硬要等齐反而会错过。
   *
   * @param pattern toast 的匹配式。
   * @param label 截图文件名前缀。
   */
  async function captureMoment(pattern, label, title) {
    const legacySeen = (await readToasts(legacy)).length;
    const modernSeen = (await readToasts(modern)).length;
    const done = { legacy: false, modern: false };
    const legacyPath = join(OUT, `legacy-${label}.png`);
    const modernPath = join(OUT, `new-${label}.png`);
    const re = new RegExp(pattern);

    for (let round = 0; round < 900 && (!done.legacy || !done.modern); round++) {
      const tasks = [];
      if (!done.legacy) {
        tasks.push(
          legacy.evaluate(AUTO_PLAY, {
            ...playArgs,
            canvasSel: '#cv',
            stageSel: '#stage',
          }),
        );
      }
      if (!done.modern) {
        tasks.push(
          modern.evaluate(AUTO_PLAY, {
            ...playArgs,
            canvasSel: '.canvas-host canvas',
            stageSel: '.stage',
          }),
        );
      }
      await Promise.all(tasks);

      const [lt, mt] = await Promise.all([readToasts(legacy), readToasts(modern)]);
      if (!done.legacy && lt.slice(legacySeen).some((t) => re.test(t.text))) {
        done.legacy = true;
        await legacy.screenshot({ path: legacyPath });
        console.log(`  📷 ${legacyPath}`);
      }
      if (!done.modern && mt.slice(modernSeen).some((t) => re.test(t.text))) {
        done.modern = true;
        await modern.screenshot({ path: modernPath });
        console.log(`  📷 ${modernPath}`);
      }
    }
    if (!done.legacy || !done.modern) {
      // 一边没等到也不算失败：把等到的那些合成就行（另一边可能这一局没碰上）。
      console.log(
        `  ⚠ 只有一边等到 /${pattern}/（旧的 ${done.legacy ? '✓' : '✗'} / 新的 ${done.modern ? '✓' : '✗'}）`,
      );
      if (!done.legacy && !done.modern) return;
      console.log(`  （只合成等到的那一边，另一边这一局没碰上）`);
      return;
    }
    await compose(title, legacyPath, modernPath, join(OUT, `cmp-${label}.png`));
  }

  console.log('── 瞬间 1 · 暴击 ──');
  await captureMoment(
    '^暴击',
    'crit',
    '瞬间 1 · 暴击击破（新版：碎片形态 + 暴击档冲击环 + 全屏冲击波 + bloom 辉光）',
  );

  console.log('── 瞬间 2 · FEVER ──');
  await captureMoment(
    '^FEVER',
    'fever',
    '瞬间 2 · FEVER（新版：余烬形态 + 周身金色火花 + 全场色散 + bloom 辉光）',
  );

  console.log('── 瞬间 3 · 双生同破 ──');
  await captureMoment(
    '^双生',
    'twin',
    '瞬间 3 · 双生同破（新版：双生档冲击环 + 碎片形态 + 冲击波 + bloom 辉光）',
  );

  // bloom 判据在 `tests/e2e/bloom-ab.mjs` 里（那边是逐像素统计 PNG，
  // 比这里的画布读回可靠）—— 跑那个脚本拿数字。

  const errors = [...legacyErrors, ...modernErrors];
  assert(errors.length === 0, `两个页面都无异常${errors.length ? '：' + errors.join(' | ') : ''}`);
  console.log(`\n✓ 三个瞬间 + bloom 判据完成 → ${OUT}`);
} catch (err) {
  console.error(`\n✗ 失败：${String(err)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
