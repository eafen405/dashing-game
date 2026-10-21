/**
 * 端到端：桌面键盘与鼠标都可用。
 *
 * 跑法（先 build）：
 *   npm run build
 *   node tests/e2e/input-desktop.mjs
 *
 * **要证明的事**（票 05 验收「桌面键盘与鼠标都可用」）：
 *
 * | 输入 | 期望 |
 * | --- | --- |
 * | 点上半屏 | 上轨出刀（`.lane-top.hit`） |
 * | 点下半屏 | 下轨出刀（`.lane-bottom.hit`） |
 * | `↑` / `W` | 上轨出刀 |
 * | `↓` / `S` | 下轨出刀 |
 * | `P` | 暂停 / 恢复 |
 * | `Enter` / `Space` | 开始界面：开始；结算界面：再来一局 |
 *
 * **怎么判「出到了哪条轨」**：`.lane-top.hit` / `.lane-bottom.hit` 里
 * **只有一个**带 `hit`（HUD 的轨道高亮记的是**最后一次**出刀），
 * 所以「上轨有 hit 且下轨没有」就说明这次输入确实被判成了上轨。
 */

import { assert, launchBrowser, openApp, readPhase, shot, strike } from './lib/harness.mjs';

const browser = await launchBrowser();
const { page, pageErrors } = await openApp(browser);

/** 读当前是哪条轨带着受击高亮。 */
function flashedLane() {
  return page.evaluate(() => {
    const top = globalThis.document.querySelectorAll('.lane-top.hit').length;
    const bottom = globalThis.document.querySelectorAll('.lane-bottom.hit').length;
    if (top > 0 && bottom === 0) return 'top';
    if (bottom > 0 && top === 0) return 'bottom';
    if (top > 0 && bottom > 0) return 'both';
    return 'none';
  });
}

try {
  // ── 键盘：开始界面按 Enter / Space 开始 ──────────────────
  console.log('── 开始界面：Enter / Space 开始 ──');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'running', '开始界面按 Enter 开始游戏');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  assert((await readPhase(page)) === 'paused', '游戏中按 P 暂停');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  assert((await readPhase(page)) === 'running', '暂停中按 P 恢复');

  // 回主页面，再测 Space 开始
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  await page.locator('#btnHome').click();
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'idle', '「回主页面」回到开始界面');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'running', '开始界面按 Space 开始游戏');

  // ── 鼠标：上/下半屏 ─────────────────────────────────────
  console.log('── 鼠标：点上半屏 / 下半屏 ──');
  await strike(page, 'top');
  await page.waitForTimeout(120);
  assert((await flashedLane()) === 'top', '点上半屏 → 上轨出刀');
  await shot(page, 'in-1-mouse-top.png');

  await strike(page, 'bottom');
  await page.waitForTimeout(120);
  assert((await flashedLane()) === 'bottom', '点下半屏 → 下轨出刀');
  await shot(page, 'in-2-mouse-bottom.png');

  // ── 键盘：↑/W/↓/S ─────────────────────────────────────
  console.log('── 键盘：↑ / W / ↓ / S ──');
  const keys = [
    ['ArrowUp', 'top', '↑'],
    ['KeyW', 'top', 'W'],
    ['ArrowDown', 'bottom', '↓'],
    ['KeyS', 'bottom', 'S'],
  ];
  for (const [code, lane, label] of keys) {
    await page.keyboard.press(code);
    await page.waitForTimeout(120);
    assert((await flashedLane()) === lane, `按 ${label} → ${lane === 'top' ? '上' : '下'}轨出刀`);
  }
  await shot(page, 'in-3-keyboard-lanes.png');

  // ── 结算界面：Enter / Space 再来一局 ────────────────────
  console.log('── 结算界面：Enter / Space 再来一局 ──');
  await page.waitForFunction(
    () => globalThis.document.querySelector('#gameOver') !== null,
    undefined,
    { timeout: 120_000 },
  );
  assert((await readPhase(page)) === 'over', '结算界面出现');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'running', '结算界面按 Space 再来一局');

  await page.waitForFunction(
    () => globalThis.document.querySelector('#gameOver') !== null,
    undefined,
    { timeout: 120_000 },
  );
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'running', '结算界面按 Enter 再来一局');

  assert(
    pageErrors.length === 0,
    `无页面异常${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`,
  );
  console.log('\n✓ 桌面键盘与鼠标检查通过');
} catch (err) {
  console.error(`\n✗ 桌面输入检查失败：${String(err)}`);
  await shot(page, 'input-failure.png').catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser.close();
}
