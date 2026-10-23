/**
 * 端到端检查（Playwright）—— 竖屏自动暂停 + 实际可玩性。
 *
 * 跑法（先 build）：
 *   npm run build
 *   node tests/e2e/check-playable.mjs
 *
 * 检查项（全部用**可观察的 DOM 状态**断言，不依赖任何调试钩子）：
 *   1. 打开产物 → 开始界面在
 *   2. 点击舞台 → 开始界面消失（游戏开始）
 *   3. 点击上半屏 → 上轨出现受击高亮（输入 → 规则层 → 效果 → DOM 打通）
 *   4. 不操作等一会儿 → 出现「-20」受击提示（规则层在跑、效果回到 DOM）
 *   5. 改成竖屏 → 出现暂停界面（竖屏自动暂停）+ 竖屏提示
 *   6. 改回横屏 → 暂停界面消失（因竖屏而暂停的会自动恢复）
 *
 * **关于 `screen.orientation.type`**：无头 Chromium 的 `screen.orientation.type`
 * 恒为 `landscape-primary`，**不跟随视口**（真实设备会跟随）。
 * 旧实现的横竖屏判定是三重兜底的「或」关系（`source.html:501-504`），
 * 所以这里用 `addInitScript` 把 `screen.orientation.type` 改成随视口推导 ——
 * **只补齐设备桩，不改被测代码**。
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { launchChromium } from '../../scripts/browser.mjs';
import { captureShot } from './lib/harness.mjs';

const DIST = resolve(process.cwd(), 'dist', 'index.html');
/**
 * 截图目录 —— 默认写在仓库内（`dist/` 已被 gitignore），
 * 需要放到别处时用 `E2E_SHOTS_DIR` 覆盖。
 */
const SHOTS = process.env.E2E_SHOTS_DIR
  ? resolve(process.env.E2E_SHOTS_DIR)
  : resolve(process.cwd(), 'dist', 'e2e-shots', '04b');

/** 断言失败时抛错（脚本以非零退出码结束）。 */
function assert(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
  console.log(`  ✓ ${message}`);
}

if (!existsSync(DIST)) {
  console.error(`✗ 找不到产物 ${DIST}，请先 npm run build`);
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const browser = await launchChromium(chromium);

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

// 设备桩：`screen.orientation.type` 随视口推导（真实设备就是这样）。
await page.addInitScript(() => {
  // `globalThis` 而不是 `window`：这段代码在浏览器里跑，但 ESLint 按 Node 脚本检查
  Object.defineProperty(globalThis.screen.orientation, 'type', {
    configurable: true,
    get() {
      return globalThis.innerWidth > globalThis.innerHeight
        ? 'landscape-primary'
        : 'portrait-primary';
    },
  });
});

try {
  console.log('── 1. 打开产物 ──');
  await page.goto(pathToFileURL(DIST).href, { waitUntil: 'load' });
  await page.waitForSelector('.canvas-host canvas', { timeout: 20_000 });
  assert((await page.locator('.overlay .tap-hint').count()) > 0, '开始界面在');
  assert((await page.locator('.hud .hp-bar').count()) > 0, 'HUD 在');

  console.log('── 2. 点击舞台开始 ──');
  // 点标题（不是难度选择区 —— 难度区带 `data-no-strike`，点击它不该开始游戏）
  await page.mouse.click(640, 228);
  await page.waitForTimeout(300);
  assert((await page.locator('.overlay .tap-hint').count()) === 0, '开始界面消失（游戏已开始）');

  console.log('── 3. 点击上半屏出刀 ──');
  await page.mouse.click(900, 200);
  await page.waitForTimeout(120);
  assert((await page.locator('.lane-top.hit').count()) > 0, '上轨出现受击高亮（输入打通规则层）');
  await captureShot(page, join(SHOTS, '04b-playing.png'));

  console.log('── 4. 规则层在推进（等漏怪掉血）──');
  await page.waitForSelector('.toast:has-text("-20")', { timeout: 30_000 });
  assert(true, '出现「-20」受击提示（规则层 → 效果 → DOM 打通）');
  await captureShot(page, join(SHOTS, '04b-hit.png'));

  console.log('── 5. 竖屏 → 自动暂停 ──');
  await page.setViewportSize({ width: 500, height: 800 });
  await page.evaluate(() => globalThis.dispatchEvent(new globalThis.Event('orientationchange')));
  await page.waitForTimeout(400);
  assert((await page.locator('.pause-card').count()) > 0, '暂停界面出现（竖屏自动暂停）');
  assert(await page.locator('.rotate').isVisible(), '竖屏提示可见');
  await captureShot(page, join(SHOTS, '04b-portrait-paused.png'));

  console.log('── 6. 转回横屏 → 自动恢复 ──');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => globalThis.dispatchEvent(new globalThis.Event('orientationchange')));
  await page.waitForTimeout(400);
  assert((await page.locator('.pause-card').count()) === 0, '暂停界面消失（自动恢复）');
  await captureShot(page, join(SHOTS, '04b-resumed.png'));

  assert(
    pageErrors.length === 0,
    `无页面异常${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`,
  );

  console.log(`\n✓ 端到端检查通过，截图 → ${SHOTS}`);
} catch (err) {
  console.error(`\n✗ 端到端检查失败：${String(err)}`);
  await captureShot(page, join(SHOTS, '04b-failure.png')).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser.close();
}
