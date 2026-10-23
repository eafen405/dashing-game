#!/usr/bin/env node
/**
 * 校验构建产物 —— 保护 ADR-0001 承诺的「开盖即食单文件」。
 *
 * 两个独立步骤：
 *   1. 静态检查：不需要浏览器，产物必须自包含（无外部 src/href、无裸 import、无外链资源）
 *   2. 浏览器检查：Playwright + Chromium，以 file:// 打开产物，验证
 *      WebGL 初始化 / localStorage 读写 / 画面实际渲染 / 零外部网络请求
 *
 * 用法：
 *   node scripts/verify-single-file.mjs                # 静态 + 浏览器（默认）
 *   node scripts/verify-single-file.mjs --no-browser   # 仅静态检查
 *   node scripts/verify-single-file.mjs --browser      # 仅浏览器检查
 *
 * 退出码：
 *   0  全部通过
 *   1  校验失败（静态检查失败，或浏览器断言失败）
 *   2  浏览器不可用（静态检查已通过，但浏览器起不来）—— 明确报错并以非零退出，
 *      绝不静默跳过（票 01 要求：浏览器缺失必须让 CI 变红并留下可见痕迹）
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

import { launchChromium } from './browser.mjs';

const DIST = resolve(process.cwd(), 'dist', 'index.html');

/**
 * 产物体积告警线 —— **只告警，不失败**。
 *
 * 票 10 的要求是「上限告警」：单文件承诺不等于可以无限膨胀，但体积也随功能
 * 正当增长，所以不设硬门禁。当前基线约 1,068 KB / gzip 318 KB；
 * 留约 12% / 19% 余量，越过就提示回头检查是不是 Pixi / React 被整包引入。
 */
const SIZE_WARN_KB = 1200;
const GZIP_WARN_KB = 380;

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      '用法：node scripts/verify-single-file.mjs [--no-browser | --browser]',
      '',
      '  --no-browser   仅跑静态检查（不需要浏览器）',
      '  --browser      仅跑浏览器检查（Playwright + Chromium）',
      '  不带参数        静态 + 浏览器都跑',
      '',
      '退出码：0 通过 / 1 校验失败 / 2 浏览器不可用',
    ].join('\n'),
  );
  process.exit(0);
}

const onlyBrowser = args.includes('--browser');
const onlyStatic = args.includes('--no-browser');

if (onlyBrowser && onlyStatic) {
  console.error('✗ --browser 与 --no-browser 不能同时使用');
  process.exit(1);
}

const runStatic = !onlyBrowser;
const runBrowser = !onlyStatic;

// ── 1. 静态检查 ───────────────────────────────────────────────
function staticCheck() {
  const fail = [];
  const warn = [];

  if (!existsSync(DIST)) {
    console.error(`✗ 找不到产物 ${DIST}，请先 npm run build`);
    process.exit(1);
  }

  const html = readFileSync(DIST, 'utf8');
  const size = statSync(DIST).size;
  const gzipSize = gzipSync(html).length;

  // 体积告警（票 10）：单文件从 729 KB 长到 1 MB+ 是 Pixi 的代价，但继续膨胀
  // 往往意味着 tree-shaking 失效，先提示再看。
  if (size > SIZE_WARN_KB * 1024) {
    warn.push(
      `产物体积 ${(size / 1024).toFixed(1)} KB 超过告警线 ${SIZE_WARN_KB} KB（gzip ${(gzipSize / 1024).toFixed(1)} KB）—— 先检查 pixi.js / react-dom 是否被整包引入`,
    );
  }
  if (gzipSize > GZIP_WARN_KB * 1024) {
    warn.push(
      `产物 gzip ${(gzipSize / 1024).toFixed(1)} KB 超过告警线 ${GZIP_WARN_KB} KB —— 同上，先查 tree-shaking`,
    );
  }

  // 外部资源引用：<script src="..."> / <link href="..."> / <img src="...">
  const externalRefs = [
    ...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi),
    ...html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi),
    ...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi),
  ].map((m) => m[1]);

  const nonDataRefs = externalRefs.filter((u) => !u.startsWith('data:'));
  if (nonDataRefs.length > 0) fail.push(`产物引用了外部资源：${nonDataRefs.join(', ')}`);

  // 裸 import / export 语句（file:// 下无法解析跨文件模块）
  const bareImports = [
    ...html.matchAll(/^\s*(?:import|export)\s[^;]*?from\s*["'][^"']+["']/gm),
  ].map((m) => m[0].trim());
  if (bareImports.length > 0)
    fail.push(`产物含裸 import/export，无法在 file:// 下解析：${bareImports[0]}`);

  // CSS 里的外链资源（url(https://…)、url(//…)）—— file:// 下会发起网络请求
  const cssExternalUrls = [...html.matchAll(/url\(\s*["']?(?!data:)(https?:)?\/\/[^"')]+/gi)].map(
    (m) => m[0].trim(),
  );
  if (cssExternalUrls.length > 0) fail.push(`产物 CSS 含外链资源：${cssExternalUrls[0]}`);

  // 自包含：脚本必须内联，不能靠外部 <script src>（上面已查）—— 这里确认确实有内联脚本
  const inlineScripts = (html.match(/<script\b[^>]*>/gi) ?? []).length;
  if (inlineScripts === 0) fail.push('产物里没有任何脚本，产物可能没构建成功');

  console.log(
    `产物 ${(size / 1024).toFixed(1)} KB（gzip ${(gzipSize / 1024).toFixed(1)} KB），内联脚本 ${inlineScripts} 个，` +
      `外链资源 ${nonDataRefs.length} 个，裸 import ${bareImports.length} 处`,
  );

  return { fail, warn };
}

// ── 2. 浏览器检查 ─────────────────────────────────────────────
async function browserCheck() {
  const fail = [];
  const warn = [];

  const { chromium } = await import('playwright');

  let browser = null;
  let launchError = null;
  try {
    browser = await launchChromium(chromium);
  } catch (err) {
    launchError = err;
  }
  if (!browser) {
    return { unavailable: true, reason: launchError, fail, warn };
  }

  try {
    const page = await browser.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const requests = [];

    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('request', (r) => requests.push(r.url()));

    await page.goto(pathToFileURL(DIST).href, { waitUntil: 'load' });

    // 等战场 canvas 挂上来，再让它跑几帧。
    // （旧版这里等的是 Phase 0 spike 的 `window.__SPIKE__` 契约；
    //  spike 已随票 04 拆除，改为直接检查「画布真的画出了东西」。）
    await page.waitForSelector('.canvas-host canvas', { timeout: 20_000 });
    await page.waitForTimeout(800);

    const result = await page.evaluate(() => {
      const canvas = globalThis.document.querySelector('.canvas-host canvas');
      let canvasWidth = 0;
      let canvasHeight = 0;
      if (canvas instanceof globalThis.HTMLCanvasElement) {
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
      }

      let localStorageOk = false;
      try {
        const key = '__verify_probe__';
        globalThis.localStorage.setItem(key, 'ok');
        localStorageOk = globalThis.localStorage.getItem(key) === 'ok';
        globalThis.localStorage.removeItem(key);
      } catch {
        // localStorage 不可用（Safari file://）—— 保持 false
      }

      return { canvasWidth, canvasHeight, localStorage: localStorageOk };
    });

    /**
     * 画面确实画出来了 —— **用截图差分，不读 WebGL 缓冲区**。
     *
     * WebGL 画布默认 `preserveDrawingBuffer: false`，`drawImage(canvas)` /
     * `getImageData` 读到的是空 buffer（票 08 要修的假阴性）。这里改成：
     * 先截画布区域，再把画布隐藏后截同一区域，比较像素差异。
     * 两帧之间只有画布内容被移除 —— 有差异就证明渲染器真的画了东西，
     * 对 Canvas 2D / WebGL 都成立。
     */
    const canvasBox = await page.locator('.canvas-host canvas').boundingBox();
    if (!canvasBox || canvasBox.width < 2 || canvasBox.height < 2) {
      fail.push('找不到有效的画布区域');
    } else {
      const clip = {
        x: Math.round(canvasBox.x),
        y: Math.round(canvasBox.y),
        width: Math.round(canvasBox.width),
        height: Math.round(canvasBox.height),
      };
      const withCanvas = await page.screenshot({ clip });
      await page.evaluate(() => {
        const canvas = globalThis.document.querySelector('.canvas-host canvas');
        if (canvas instanceof globalThis.HTMLElement) canvas.style.visibility = 'hidden';
      });
      await page.waitForTimeout(120);
      const withoutCanvas = await page.screenshot({ clip });
      await page.evaluate(() => {
        const canvas = globalThis.document.querySelector('.canvas-host canvas');
        if (canvas instanceof globalThis.HTMLElement) canvas.style.visibility = '';
      });

      const diffPixels = await page.evaluate(
        async ([a, b]) => {
          const load = async (base64) => {
            const img = new globalThis.Image();
            img.src = 'data:image/png;base64,' + base64;
            await img.decode();
            return img;
          };
          const [imgA, imgB] = await Promise.all([load(a), load(b)]);
          if (imgA.width !== imgB.width || imgA.height !== imgB.height) return -1;
          const cv = globalThis.document.createElement('canvas');
          cv.width = imgA.width;
          cv.height = imgA.height;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          if (!ctx) return -1;
          ctx.drawImage(imgA, 0, 0);
          const da = ctx.getImageData(0, 0, cv.width, cv.height).data;
          ctx.clearRect(0, 0, cv.width, cv.height);
          ctx.drawImage(imgB, 0, 0);
          const db = ctx.getImageData(0, 0, cv.width, cv.height).data;
          let diff = 0;
          for (let i = 0; i < da.length; i += 4) {
            if (
              Math.abs((da[i] ?? 0) - (db[i] ?? 0)) > 2 ||
              Math.abs((da[i + 1] ?? 0) - (db[i + 1] ?? 0)) > 2 ||
              Math.abs((da[i + 2] ?? 0) - (db[i + 2] ?? 0)) > 2
            ) {
              diff++;
            }
          }
          return diff;
        },
        [withCanvas.toString('base64'), withoutCanvas.toString('base64')],
      );

      const drawn = diffPixels > 100;
      if (!drawn) fail.push('画布读取不到已绘制内容');
      console.log(`画布区域 ${clip.width}×${clip.height}，与隐藏画布后的差异 ${diffPixels} 像素`);
      result.drawn = drawn;
    }

    // file:// 打开时不应有任何非 file:// 的请求
    const remote = requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:'));
    if (remote.length > 0) fail.push(`产物发起了外部请求：${remote.join(', ')}`);

    if (!result.localStorage) fail.push('localStorage 不可读写');
    if (pageErrors.length > 0) fail.push(`页面异常：${pageErrors.join(' | ')}`);
    if (consoleErrors.length > 0) warn.push(`控制台错误：${consoleErrors.join(' | ')}`);

    console.log(`画布 ${result.canvasWidth}×${result.canvasHeight}`);
    console.log(
      `localStorage ${result.localStorage ? '✓' : '✗'} · 绘制 ${result.drawn ? '✓' : '✗'}`,
    );
    console.log(`网络请求 ${requests.length} 个（外部 ${remote.length} 个）`);

    const shot = resolve(process.cwd(), 'dist', 'verify-screenshot.png');
    await page.screenshot({ path: shot });
    console.log(`截图 → ${shot}`);
  } catch (err) {
    fail.push(`浏览器检查过程出错：${String(err)}`);
  } finally {
    await browser.close();
  }

  return { unavailable: false, fail, warn };
}

// ── 驱动 ─────────────────────────────────────────────────────
const fail = [];
const warn = [];

if (runStatic) {
  console.log('── 静态检查 ──');
  const result = staticCheck();
  fail.push(...result.fail);
  warn.push(...result.warn);
  console.log(result.fail.length === 0 ? '✓ 静态检查通过：产物自包含' : '✗ 静态检查失败');
  console.log('');
}

let browserUnavailable = false;

if (runBrowser) {
  console.log('── 浏览器检查 ──');
  const result = await browserCheck();

  if (result.unavailable) {
    browserUnavailable = true;
    console.error('');
    console.error('⚠ 警告：浏览器检查无法执行 —— 找不到可用的 Chromium。');
    console.error(`  启动失败原因：${result.reason}`);
    console.error('  已退化为静态检查（静态检查结果见上）。');
    console.error('  按票 01 要求：浏览器检查缺失不允许静默跳过，此处以非零退出码结束。');
    console.error('  CI 修复方式：npx playwright install --with-deps chromium');
  } else {
    fail.push(...result.fail);
    warn.push(...result.warn);
    console.log(result.fail.length === 0 ? '✓ 浏览器检查通过' : '✗ 浏览器检查失败');
  }
  console.log('');
}

if (warn.length > 0) {
  console.log('警告：');
  for (const w of warn) console.log(`  ⚠ ${w}`);
  console.log('');
}

if (fail.length > 0) {
  console.error('校验失败：');
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}

if (browserUnavailable) {
  process.exit(2);
}

console.log('✓ 校验通过：产物自包含，file:// 下可运行');
