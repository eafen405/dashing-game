#!/usr/bin/env node
/**
 * 校验构建产物 —— 保护 ADR-0001 承诺的"开盖即食单文件"。
 *
 *   1. 静态：dist/index.html 必须自包含（无外部 src/href、无裸 import 语句）
 *   2. 浏览器：以 file:// 打开，验证 WebGL 初始化、localStorage 读写、零网络请求
 *
 * 用法：
 *   node scripts/verify-single-file.mjs            # 静态 + 浏览器
 *   node scripts/verify-single-file.mjs --no-browser  # 仅静态（CI 无浏览器时）
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST = resolve(process.cwd(), 'dist', 'index.html');
const SKIP_BROWSER = process.argv.includes('--no-browser');

const fail = [];
const warn = [];

// ── 1. 静态检查 ───────────────────────────────────────────────
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
const bareImports = [...html.matchAll(/^\s*(?:import|export)\s[^;]*?from\s*["'][^"']+["']/gm)].map(
  (m) => m[0].trim(),
);
if (bareImports.length > 0) fail.push(`产物含裸 import/export，无法在 file:// 下解析：${bareImports[0]}`);

console.log(`产物 ${(size / 1024).toFixed(1)} KB，内联脚本 ${(html.match(/<script/g) ?? []).length} 个`);

// ── 2. 浏览器检查 ─────────────────────────────────────────────
async function browserCheck() {
  const { chromium } = await import('playwright');

  const candidates = [
    undefined,
    join(
      process.env.HOME ?? '',
      '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    ),
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
    fail.push(`无法启动浏览器：${launchError}`);
    return;
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
    await page.waitForFunction(() => window.__SPIKE__ !== undefined, null, { timeout: 20_000 });

    const result = await page.evaluate(() => window.__SPIKE__);

    // file:// 打开时不应有任何非 file:// 的请求
    const remote = requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:'));
    if (remote.length > 0) fail.push(`产物发起了外部请求：${remote.join(', ')}`);

    if (!result.webgl) fail.push(`WebGL 未启用，渲染器类型：${result.rendererType}`);
    if (!result.localStorage) fail.push('localStorage 不可读写');
    if (!result.drawn) fail.push('画布读取不到已绘制内容');
    if (pageErrors.length > 0) fail.push(`页面异常：${pageErrors.join(' | ')}`);
    if (consoleErrors.length > 0) warn.push(`控制台错误：${consoleErrors.join(' | ')}`);

    console.log(`渲染器 ${result.rendererType} · 画布 ${result.canvasWidth}×${result.canvasHeight}`);
    console.log(`localStorage ${result.localStorage ? '✓' : '✗'} · 绘制 ${result.drawn ? '✓' : '✗'}`);
    console.log(`网络请求 ${requests.length} 个（外部 ${remote.length} 个）`);

    const shot = resolve(process.cwd(), 'dist', 'spike-screenshot.png');
    await page.screenshot({ path: shot });
    console.log(`截图 → ${shot}`);

    for (const e of result.errors) fail.push(`运行时错误：${e}`);
  } finally {
    await browser.close();
  }
}

if (!SKIP_BROWSER) {
  await browserCheck();
} else {
  console.log('（跳过浏览器检查）');
}

if (warn.length > 0) {
  console.log('\n警告：');
  for (const w of warn) console.log(`  ⚠ ${w}`);
}

if (fail.length > 0) {
  console.error('\n校验失败：');
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log('\n✓ 校验通过：产物自包含，file:// 下可运行');
