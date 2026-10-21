#!/usr/bin/env node
/**
 * 开发期 FPS / 帧时挂件检查 —— 票 06 的验收项「FPS 挂件在 60fps 稳定」。
 *
 * 用法：node scripts/fps-check.mjs [renderer]
 *
 * 做法：打开 `?renderer=<kind>&debug`（`?debug` 会显示 HUD 角落的
 * `{fps} FPS · {frameMs} ms` 挂件），开局后自动打怪若干秒，
 * 连续采样挂件读数，报告最低 / 最高 FPS 与最大帧时。
 *
 * 说明：挂件测的是**会话层的帧间隔**（`GameSession` 的 rAF 循环），
 * 不是 Pixi 的 GPU 渲染耗时 —— 但它能证明整条 60fps 链路没有被拖垮。
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, 'dist', 'index.html');
const KIND = process.argv[2] ?? 'pixi';

if (!existsSync(DIST)) {
  console.error(`✗ 找不到产物 ${DIST}，请先 npm run build`);
  process.exit(1);
}

const { chromium } = await import('playwright');

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

const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${pathToFileURL(DIST).href}?renderer=${KIND}&debug`, { waitUntil: 'load' });
await page.waitForSelector('.canvas-host canvas', { timeout: 20_000 });
await page.waitForTimeout(500);
await page.mouse.click(450, 280);
await page.waitForTimeout(1500);

const samples = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(500);
  const text = await page.evaluate(() => {
    const el = globalThis.document.querySelector('.debug-stats');
    return el ? el.textContent : null;
  });
  if (text) {
    const m = /(\d+)\s*FPS\s*·\s*([\d.]+)\s*ms/.exec(text);
    if (m) samples.push({ fps: Number(m[1]), frameMs: Number(m[2]) });
  }
}

await browser.close();

if (samples.length === 0) {
  console.error('✗ 没读到 FPS 挂件');
  process.exit(1);
}
const fps = samples.map((s) => s.fps);
const ms = samples.map((s) => s.frameMs);
console.log(`渲染器：${KIND} · 采样 ${samples.length} 次`);
console.log(
  `FPS  最低 ${Math.min(...fps)} · 最高 ${Math.max(...fps)} · 末值 ${fps[fps.length - 1]}`,
);
console.log(
  `帧时 最大 ${Math.max(...ms)} ms · 末值 ${ms[ms.length - 1]} ms（16.67ms = 60fps 预算）`,
);
if (errors.length > 0) console.log(`⚠ 页面错误：${errors.join(' | ')}`);
