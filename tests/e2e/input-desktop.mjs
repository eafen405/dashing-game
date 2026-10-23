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
 * | 开始界面切「左右」手法 | 不开始游戏，按钮高亮 |
 * | 点左右手法：左半屏 | 上轨出刀（与纵向位置无关） |
 * | 点左右手法：右半屏 | 下轨出刀（与纵向位置无关） |
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

import {
  assert,
  launchBrowser,
  openApp,
  readPhase,
  shot,
  stageBox,
  strike,
} from './lib/harness.mjs';

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
  // ── 操作手法：开始界面切换 ────────────────────────────────
  console.log('── 开始界面：操作手法切换 ──');
  assert(
    (await page.locator('#controlPick .control-btn').count()) === 2,
    '开始界面有两个操作手法选项',
  );
  assert(
    (await page.locator('#controlPick [data-control="vertical"]').getAttribute('class'))?.includes(
      'active',
    ),
    '默认选中上下手法',
  );
  await page.locator('#controlPick [data-control="horizontal"]').click();
  await page.waitForTimeout(150);
  assert((await readPhase(page)) === 'idle', '切换手法不会开始游戏');
  assert(
    (
      await page.locator('#controlPick [data-control="horizontal"]').getAttribute('class')
    )?.includes('active'),
    '点击后切换到左右手法',
  );
  await shot(page, 'in-0-control-horizontal.png');

  // ── 键盘：开始界面按 Enter / Space 开始 ──────────────────
  console.log('── 开始界面：Enter / Space 开始 ──');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'running', '开始界面按 Enter 开始游戏');

  // ── 鼠标（左右手法）：左/右半屏 ──────────────────────────
  console.log('── 鼠标：左右手法点左半屏 / 右半屏 ──');
  const hbox = await stageBox(page);
  if (!hbox) throw new Error('拿不到舞台矩形');
  // 故意用「纵向相反」的位置：左下点应走上轨，右上点应走下轨
  await page.mouse.click(hbox.x + hbox.width * 0.25, hbox.y + hbox.height * 0.75);
  await page.waitForTimeout(120);
  assert((await flashedLane()) === 'top', '左右手法：点左下 → 上轨出刀');
  await shot(page, 'in-0-horizontal-left-top.png');

  await page.mouse.click(hbox.x + hbox.width * 0.75, hbox.y + hbox.height * 0.25);
  await page.waitForTimeout(120);
  assert((await flashedLane()) === 'bottom', '左右手法：点右上 → 下轨出刀');
  await shot(page, 'in-0-horizontal-right-bottom.png');

  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  assert((await readPhase(page)) === 'paused', '游戏中按 P 暂停');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  assert((await readPhase(page)) === 'running', '暂停中按 P 恢复');

  // 回主页面，切回上下手法，再测 Space 开始
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  await page.locator('#btnHome').click();
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'idle', '「回主页面」回到开始界面');
  await page.locator('#controlPick [data-control="vertical"]').click();
  await page.waitForTimeout(150);
  assert(
    (await page.locator('#controlPick [data-control="vertical"]').getAttribute('class'))?.includes(
      'active',
    ),
    '切回上下手法',
  );
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
