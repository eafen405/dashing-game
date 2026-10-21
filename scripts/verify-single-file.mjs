#!/usr/bin/env node
/**
 * 校验构建产物 —— 保护 ADR-0001 承诺的「开盖即食单文件」。
 *
 * 两个独立步骤：
 *   1. 静态检查：不需要浏览器，产物必须自包含（无外部 src/href、无裸 import、无外链资源）
 *   2. 浏览器检查：Playwright + Chromium，以 file:// 打开产物，验证
 *      真实应用挂载 / localStorage 读写 / 画面实际渲染 / 零外部网络请求
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
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST = resolve(process.cwd(), 'dist', 'index.html');

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
    `产物 ${(size / 1024).toFixed(1)} KB，内联脚本 ${inlineScripts} 个，` +
      `外链资源 ${nonDataRefs.length} 个，裸 import ${bareImports.length} 处`,
  );

  return { fail, warn };
}

// ── 2. 浏览器检查 ─────────────────────────────────────────────
async function browserCheck() {
  const fail = [];
  const warn = [];

  const { chromium } = await import('playwright');

  // 浏览器回退链：Playwright 自带 → 本机缓存 → 系统 chromium
  const candidates = [
    undefined,
    join(process.env.HOME ?? '', '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'),
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
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
    await page.waitForFunction(() => globalThis.__GAME__?.ready === true, null, { timeout: 20_000 });

    const result = await page.evaluate(() => {
      const diagnostic = globalThis.__GAME__;
      const canvas = document.querySelector('.battlefield-host canvas');
      let drawn = false;
      let canvasWidth = 0;
      let canvasHeight = 0;

      if (canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0) {
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        const scratch = document.createElement('canvas');
        scratch.width = canvasWidth;
        scratch.height = canvasHeight;
        const ctx = scratch.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, 0);
          const data = ctx.getImageData(0, 0, canvasWidth, canvasHeight).data;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] !== 0) {
              drawn = true;
              break;
            }
          }
        }
      }

      let storage = false;
      try {
        const key = '__game_probe__';
        localStorage.setItem(key, 'ok');
        storage = localStorage.getItem(key) === 'ok';
        localStorage.removeItem(key);
      } catch {
        // localStorage 被禁用时保持 false
      }

      return {
        ready: diagnostic?.ready === true,
        canvasWidth,
        canvasHeight,
        drawn,
        storage,
        startVisible: document.querySelector('.overlay') !== null,
      };
    });

    // file:// 打开时不应有任何非 file:// 的请求
    const remote = requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:'));
    if (remote.length > 0) fail.push(`产物发起了外部请求：${remote.join(', ')}`);

    if (!result.ready) fail.push('真实应用没有挂载（window.__GAME__.ready 不为 true）');
    if (!result.storage) fail.push('localStorage 不可读写');
    if (!result.drawn) fail.push('画布读取不到已绘制内容');
    if (!result.startVisible) fail.push('开始界面没有渲染');
    if (pageErrors.length > 0) fail.push(`页面异常：${pageErrors.join(' | ')}`);
    if (consoleErrors.length > 0) warn.push(`控制台错误：${consoleErrors.join(' | ')}`);

    console.log(`渲染器 Canvas 2D · 画布 ${result.canvasWidth}×${result.canvasHeight}`);
    console.log(`localStorage ${result.storage ? '✓' : '✗'} · 绘制 ${result.drawn ? '✓' : '✗'}`);
    console.log(`网络请求 ${requests.length} 个（外部 ${remote.length} 个）`);

    const shot = resolve(process.cwd(), 'dist', 'game-screenshot.png');
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
