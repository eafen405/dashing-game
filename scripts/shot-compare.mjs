#!/usr/bin/env node
/**
 * 票 06 的 A/B 对照截图 —— `?renderer=canvas2d` vs `?renderer=pixi`。
 *
 * 用法：node scripts/shot-compare.mjs [outDir]
 *
 * 做法：
 *   1. 以 `file://` 打开 `dist/index.html`（**非安全上下文** —— 这正是
 *      `preference: 'webgl'` 要解决的问题：WebGPU 在这里会黑屏）。
 *   2. 两个渲染器跑**同一套脚本**：开局 → 空转 → 连续点击判定区打怪 → 攒连击进 FEVER。
 *      每个阶段截一张全屏图（覆盖 12 个 view）。
 *   3. 统计**非透明像素占比** —— 0% 就是黑屏。
 *   4. 输出逐像素差异率（同一阶段的画面，两套实现应当接近）。
 *
 * **读 WebGL 画布的坑**：WebGL 默认 `preserveDrawingBuffer: false`，
 * 合成之后 `drawImage(canvas)` 读到的是**空缓冲**（Canvas 2D 画布没有这个行为）。
 * 所以必须在**同一个 rAF 批次里**取像素 —— Pixi 的 ticker 先渲染，我们后读。
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, 'dist', 'index.html');
const OUT = resolve(process.argv[2] ?? join(ROOT, '..', 'refactor-notes', 'shots', '06'));

const VIEWPORT = { width: 900, height: 560 };

/** 阶段名 → 截图文件名后缀。 */
const PHASES = ['idle', 'play', 'fever'];

/** `computeLayout` 的镜像（`src/game/layout.ts`）—— 只为脚本能算点击位置。 */
function computeLayout(width, height) {
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const laneY = { top: height * 0.28, bottom: height * 0.72 };
  const playerR = clamp(height * 0.115, 22, 46);
  const playerX = Math.max(clamp(width * 0.085, 48, 120), playerR * 2.05 + 12);
  const hitX = Math.max(clamp(width * 0.34, 150, 430), playerX + playerR * 2.6 + 120);
  const hitW = clamp(width * 0.07, 58, 100);
  const zoneHalf = hitW * 0.5 + clamp(width * 0.03, 16, 44);
  return { laneY, playerX, hitX, zoneHalf, critHalf: zoneHalf * 0.5 };
}

/** 非透明像素占比（0 = 全黑屏 / 全透明）。 */
function opaqueRatio(data) {
  let opaque = 0;
  const total = data.length / 4;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) opaque++;
  }
  return opaque / total;
}

/** 两张图的逐像素差异率（alpha 通道 + RGB 的平均绝对差 / 255）。 */
function diffRatio(a, b) {
  if (a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]);
    sum += Math.abs(a[i + 1] - b[i + 1]);
    sum += Math.abs(a[i + 2] - b[i + 2]);
    sum += Math.abs(a[i + 3] - b[i + 3]);
  }
  return sum / ((a.length / 4) * 4 * 255);
}

if (!existsSync(DIST)) {
  console.error(`✗ 找不到产物 ${DIST}，请先 npm run build`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const { chromium } = await import('playwright');

// 浏览器回退链（与 `scripts/verify-single-file.mjs` 一致）：
// Playwright 自带的版本号可能与本机缓存不一致。
const candidates = [
  undefined,
  join(process.env.HOME ?? '', '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'),
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

let browser = null;
let launchError = null;
for (const executablePath of candidates) {
  try {
    browser = await chromium.launch({
      executablePath,
      args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
    });
    break;
  } catch (err) {
    launchError = err;
  }
}
if (!browser) {
  console.error(`✗ 浏览器起不来：${launchError}`);
  process.exit(2);
}

const results = {};

/** 在同一个 rAF 批次里读画布像素。 */
const READ_PIXELS = () =>
  new Promise((resolve) => {
    globalThis.requestAnimationFrame(() => {
      const canvas = globalThis.document.querySelector('.canvas-host canvas');
      if (!(canvas instanceof globalThis.HTMLCanvasElement)) {
        resolve(null);
        return;
      }
      const scratch = globalThis.document.createElement('canvas');
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      const sctx = scratch.getContext('2d');
      if (!sctx) {
        resolve(null);
        return;
      }
      sctx.drawImage(canvas, 0, 0);
      const { data } = sctx.getImageData(0, 0, scratch.width, scratch.height);
      resolve({ data: Array.from(data), width: scratch.width, height: scratch.height });
    });
  });

/**
 * 判断判定区中心有没有怪（怪物身体是**不透明的深色** `#101a2e`，
 * 而判定区本身只有半透明的亮色环 / 圆点）。
 */
const HAS_MONSTER = ({ x, y }) =>
  new Promise((resolve) => {
    globalThis.requestAnimationFrame(() => {
      const canvas = globalThis.document.querySelector('.canvas-host canvas');
      if (!(canvas instanceof globalThis.HTMLCanvasElement)) {
        resolve(false);
        return;
      }
      const scratch = globalThis.document.createElement('canvas');
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      const sctx = scratch.getContext('2d');
      if (!sctx) {
        resolve(false);
        return;
      }
      sctx.drawImage(canvas, 0, 0);
      const dpr = canvas.width / (canvas.clientWidth || canvas.width);
      const px = Math.round(x * dpr);
      const py = Math.round(y * dpr);
      const half = 4;
      const x0 = Math.max(0, px - half);
      const y0 = Math.max(0, py - half);
      const w = Math.min(canvas.width - x0, half * 2 + 1);
      const h = Math.min(canvas.height - y0, half * 2 + 1);
      const { data } = sctx.getImageData(x0, y0, w, h);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 100 && Math.max(data[i], data[i + 1], data[i + 2]) < 70) {
          resolve(true);
          return;
        }
      }
      resolve(false);
    });
  });

/**
 * **自动打怪**（整段在页面里跑，每帧一次）。
 *
 * 判定区中心有没有怪：怪物身体是**不透明的深色** `#101a2e`，
 * 而判定区本身只有半透明的亮色环 / 圆点 —— 所以「不透明且很暗」= 有怪。
 *
 * 看到怪才点 —— 否则盲点击会把连击打断（`resolve` 的 miss 路径把 combo 清零），
 * 攒不到 50 连击的 FEVER。
 *
 * 点击用**合成 PointerEvent**打在舞台元素上（`src/input/pointer.ts` 监听
 * 舞台的 `pointerdown`），不需要 Playwright 的往返，节奏与帧同步。
 */
const AUTO_PLAY = ({ hitX, laneYs, zoneHalf, durationMs }) =>
  new Promise((resolve) => {
    const stage = globalThis.document.querySelector('.stage');
    const canvas = globalThis.document.querySelector('.canvas-host canvas');
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
    const dpr = canvas.width / (canvas.clientWidth || canvas.width);
    const rect = stage.getBoundingClientRect();
    const t0 = globalThis.performance.now();
    let hits = 0;
    // 每轨一个冷却：同一只怪只点一次 —— 重复点击会变成「空挥」（miss），
    // 而 miss 会把 combo 清零，攒不到 50 连击的 FEVER。
    // 冷却必须**按轨**分开：双生怪要两轨同时点才能成对击破。
    const lastClick = [-1e9, -1e9];
    const CLICK_COOLDOWN_MS = 260;

    const step = () => {
      sctx.clearRect(0, 0, scratch.width, scratch.height);
      sctx.drawImage(canvas, 0, 0);
      for (let laneIdx = 0; laneIdx < laneYs.length; laneIdx++) {
        const laneY = laneYs[laneIdx];
        // 沿轨道扫一条**横带**，找「不透明且很暗」的像素（怪物身体 `#101a2e`）。
        // 判定区自己只有半透明的亮色环 / 圆点，背景是透明的 —— 都不会命中。
        const py = Math.round(laneY * dpr);
        const scanHalf = Math.round(70 * dpr);
        const px = Math.round(hitX * dpr);
        const x0 = Math.max(0, px - scanHalf);
        const x1 = Math.min(canvas.width, px + scanHalf);
        const bandY = Math.max(0, py - Math.round(6 * dpr));
        const bandH = Math.min(canvas.height - bandY, Math.round(12 * dpr) + 1);
        if (x1 <= x0 || bandH <= 0) continue;
        const { data } = sctx.getImageData(x0, bandY, x1 - x0, bandH);
        let inZone = false;
        let minX = Infinity;
        let maxX = -Infinity;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] <= 100 || Math.max(data[i], data[i + 1], data[i + 2]) >= 70) continue;
          // 命中像素的 x（CSS 像素）必须落在**击杀区间**里 —— 否则点下去是空挥（miss）。
          const col = Math.floor(i / 4) % (x1 - x0);
          const cssX = (x0 + col) / dpr;
          if (cssX < minX) minX = cssX;
          if (cssX > maxX) maxX = cssX;
          if (Math.abs(cssX - hitX) < zoneHalf - 6) inZone = true;
        }
        if (!inZone) continue;
        // **长按怪**是横贯轨道的长胶囊（长 ≈ 26% 屏宽）——
        // 点它会开启长按，脚本随即松手 → 长按失败 → 连击清零。
        // 所以检测到「很宽的一片暗色」就跳过这一轨。
        if (maxX - minX > 120) continue;
        const now = globalThis.performance.now();
        if (now - lastClick[laneIdx] < CLICK_COOLDOWN_MS) continue;
        lastClick[laneIdx] = now;
        const init = {
          clientX: rect.left + hitX,
          clientY: rect.top + laneY,
          pointerId: 1,
          bubbles: true,
          isPrimary: true,
          cancelable: true,
        };
        stage.dispatchEvent(new globalThis.PointerEvent('pointerdown', init));
        globalThis.dispatchEvent(new globalThis.PointerEvent('pointerup', init));
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

async function shoot(kind) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  const url = `${pathToFileURL(DIST).href}?renderer=${kind}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.canvas-host canvas', { timeout: 20_000 });
  await page.waitForTimeout(500);

  // 开始一局。
  await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await page.waitForTimeout(600);

  const box = await page.locator('.canvas-host canvas').boundingBox();
  const layout = computeLayout(box?.width ?? VIEWPORT.width, box?.height ?? 505);
  const ox = box?.x ?? 0;
  const oy = box?.y ?? 0;

  const phases = {};
  const shots = [];

  // ── 阶段 1：idle（背景 / 轨道 / 判定区 / 角色） ──
  await page.waitForTimeout(600);
  phases.idle = await page.evaluate(READ_PIXELS);
  shots.push(join(OUT, `${kind}-idle.png`));
  await page.screenshot({ path: shots[shots.length - 1] });

  // ── 阶段 2：play（自动打怪 → 怪物 / 刀光 / 环 / 粒子 / 飘字） ──
  const laneYs = [layout.laneY.top, layout.laneY.bottom];
  const hits = await page.evaluate(AUTO_PLAY, {
    hitX: layout.hitX,
    laneYs,
    zoneHalf: layout.zoneHalf,
    durationMs: 4000,
  });
  phases.play = await page.evaluate(READ_PIXELS);
  shots.push(join(OUT, `${kind}-play.png`));
  await page.screenshot({ path: shots[shots.length - 1] });

  // ── 阶段 3：fx（命中瞬间 —— 刀光 / 冲击环 / 粒子 / 飘字） ──
  // 命中后**立刻**截图：这些效果寿命只有 0.25~0.95s，晚一点就淡没了。
  for (let i = 0; i < 8; i++) {
    let clicked = false;
    for (let laneIdx = 0; laneIdx < laneYs.length; laneIdx++) {
      const here = await page.evaluate(HAS_MONSTER, {
        x: layout.hitX,
        y: laneYs[laneIdx],
      });
      if (here) {
        await page.mouse.click(ox + layout.hitX, oy + laneYs[laneIdx]);
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      await page.waitForTimeout(60);
      continue;
    }
    await page.screenshot({ path: join(OUT, `${kind}-fx.png`) });
  }
  phases.fx = await page.evaluate(READ_PIXELS);
  shots.push(join(OUT, `${kind}-fx.png`));

  // ── 阶段 4：fever（连击 50 → FEVER 全场氛围） ──
  let fever = false;
  for (let round = 0; round < 3 && !fever; round++) {
    await page.evaluate(AUTO_PLAY, {
      hitX: layout.hitX,
      laneYs,
      zoneHalf: layout.zoneHalf,
      durationMs: 3000,
    });
    fever = await page.evaluate(
      () => globalThis.document.querySelector('.stat-value.frenzy') !== null,
    );
  }
  phases.fever = await page.evaluate(READ_PIXELS);
  shots.push(join(OUT, `${kind}-fever.png`));
  await page.screenshot({ path: shots[shots.length - 1] });

  await page.close();
  return { phases, shots, errors, fever, hits };
}

for (const kind of ['canvas2d', 'pixi']) {
  const r = await shoot(kind);
  results[kind] = r;
  console.log(`── ${kind} ──`);
  for (const phase of PHASES) {
    const stats = r.phases[phase];
    if (!stats) {
      console.log(`  ${phase}: 拿不到画布像素`);
      continue;
    }
    const ratio = opaqueRatio(stats.data);
    console.log(
      `  ${phase}: 画布 ${stats.width}×${stats.height} · 非透明像素占比 ${(ratio * 100).toFixed(2)}%`,
    );
  }
  console.log(`  自动打怪命中 ${r.hits} 次 · FEVER 覆盖层出现：${r.fever ? '是' : '否'}`);
  if (r.errors.length > 0) console.log(`  ⚠ 页面错误：${r.errors.join(' | ')}`);
}

console.log('── 逐阶段差异 ──');
for (const phase of PHASES) {
  const a = results.canvas2d.phases[phase];
  const b = results.pixi.phases[phase];
  if (!a || !b) {
    console.log(`  ${phase}: 数据缺失`);
    continue;
  }
  const d = diffRatio(a.data, b.data);
  console.log(`  ${phase}: 逐像素平均差异率 ${(d * 100).toFixed(2)}%`);
}

await browser.close();
console.log(`✓ 截图目录：${OUT}`);
