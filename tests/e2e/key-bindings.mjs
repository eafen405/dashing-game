/**
 * 端到端：电脑端按键设置。
 *
 * 跑法（先 build）：
 *   npm run build
 *   node tests/e2e/key-bindings.mjs
 *
 * **要证明的事**：
 *   1. 主页面有「按键设置」入口，默认是 ↑/W、↓/S；
 *   2. 点键位后按新键即可重绑，上下轨各允许 3 个；
 *   3. 重复键 / 游戏控制键被拒绝；
 *   4. 自定义键在游戏里真的能出对应轨道，旧键不再出刀；
 *   5. 刷新后绑定还在（`localStorage["dualrail_keys"]`），「恢复默认」能还原。
 */

import { assert, launchBrowser, openApp, readMenuRoute, readPhase, shot } from './lib/harness.mjs';

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

/** 读一条轨的键位文本。 */
function laneKeys(lane) {
  return page
    .locator(`#keyBindingsScreen [data-lane="${lane}"] .key-btn`)
    .evaluateAll((buttons) => buttons.map((b) => b.textContent?.trim() ?? ''));
}

/** 读 `localStorage["dualrail_keys"]`。 */
function storedBindings() {
  return page.evaluate(() => {
    const raw = globalThis.localStorage.getItem('dualrail_keys');
    return raw ? JSON.parse(raw) : null;
  });
}

try {
  // ── 1. 主页面入口 ────────────────────────────────────────
  console.log('── 1. 主页面入口 ──');
  assert(await page.locator('#btnKeys').isVisible(), '电脑端主页面显示「按键设置」');
  await page.locator('#btnKeys').click();
  await page.waitForTimeout(150);
  assert((await readMenuRoute(page)) === 'keys', '进入按键设置屏');
  assert((await readPhase(page)) === 'idle', '按键设置屏仍处于 idle（不会开打）');
  await shot(page, 'kb-1-defaults.png');

  // ── 2. 默认值 ────────────────────────────────────────────
  console.log('── 2. 默认值 ──');
  assert((await laneKeys('top')).join(',') === '↑,W', '上轨默认 ↑ / W');
  assert((await laneKeys('bottom')).join(',') === '↓,S', '下轨默认 ↓ / S');
  assert(
    (await page.locator('#keyBindingsScreen [data-lane="top"] .key-count').textContent()) === '2/3',
    '上轨显示 2/3',
  );

  // ── 3. 重绑上轨第一个键为 Q ─────────────────────────────
  console.log('── 3. 重绑上轨 ──');
  await page.locator('#keyBindingsScreen [data-lane="top"] .key-btn').nth(0).click();
  await page.waitForTimeout(100);
  assert(
    (await page.locator('#keyBindingsScreen [data-lane="top"] .key-btn').nth(0).textContent())
      ?.trim()
      .includes('按下按键'),
    '点键位后进入「听键」状态',
  );
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(150);
  assert((await laneKeys('top')).join(',') === 'Q,W', '上轨第一个键改为 Q');
  const afterQ = await storedBindings();
  assert(afterQ?.top?.[0] === 'KeyQ', 'Q 已写入 localStorage');

  // ── 4. 重复键 / 保留键被拒绝 ────────────────────────────
  console.log('── 4. 冲突校验 ──');
  await page.locator('#keyBindingsScreen [data-lane="top"] .key-btn').nth(0).click();
  await page.keyboard.press('KeyS');
  await page.waitForTimeout(120);
  const conflict = (await page.locator('#keyBindingsScreen .key-error').textContent()) ?? '';
  assert(conflict.includes('已经绑在下轨'), '上下轨重复的键被拒绝');
  assert(
    (await page.locator('#keyBindingsScreen [data-lane="top"] .key-btn').nth(0).textContent())
      ?.trim()
      .includes('按下按键'),
    '冲突后仍停在听键状态',
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert((await laneKeys('top')).join(',') === 'Q,W', 'Esc 取消后键位不变');

  await page.locator('#keyBindingsScreen [data-lane="top"] .key-btn').nth(0).click();
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(120);
  const reserved = (await page.locator('#keyBindingsScreen .key-error').textContent()) ?? '';
  assert(reserved.includes('控制键'), 'P 等游戏控制键不能绑定');
  await page.keyboard.press('Escape');

  // ── 5. 每轨最多 3 个 ────────────────────────────────────
  console.log('── 5. 上限 3 个 ──');
  await page.locator('#keyBindingsScreen [data-lane="top"] .key-add').click();
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(150);
  assert((await laneKeys('top')).join(',') === 'Q,W,E', '上轨可加到 3 个键');
  assert(
    (await page.locator('#keyBindingsScreen [data-lane="top"] .key-add').count()) === 0,
    '满 3 个后不再显示「添加」',
  );
  const three = await storedBindings();
  assert(Array.isArray(three?.top) && three.top.length === 3, 'localStorage 记录 3 个上轨键');

  await page.locator('#keyBindingsScreen [data-lane="top"] .key-clear').last().click();
  await page.waitForTimeout(120);
  assert((await laneKeys('top')).join(',') === 'Q,W', '可以清除多出来的键');
  assert(
    (await page.locator('#keyBindingsScreen [data-lane="top"] .key-clear').count()) === 2,
    '两个键时仍可逐个清除',
  );

  // ── 6. 下轨重绑为 Z ─────────────────────────────────────
  console.log('── 6. 重绑下轨 ──');
  await page.locator('#keyBindingsScreen [data-lane="bottom"] .key-btn').nth(0).click();
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(150);
  assert((await laneKeys('bottom')).join(',') === 'Z,S', '下轨第一个键改为 Z');
  await shot(page, 'kb-2-custom.png');

  // ── 7. 回主页面，自定义键真的能出刀 ─────────────────────
  console.log('── 7. 自定义键出刀 ──');
  await page.locator('#btnKeysBack').click();
  await page.waitForTimeout(150);
  assert((await readMenuRoute(page)) === 'home', '返回主页面');

  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'running', '主页面按 Q 开始游戏');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(120);
  assert((await flashedLane()) === 'top', '按 Q 出上轨刀');

  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(120);
  assert((await flashedLane()) === 'bottom', '按 Z 出下轨刀');

  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(120);
  assert((await flashedLane()) === 'bottom', '被换掉的 ↑ 不再出刀');
  await shot(page, 'kb-3-custom-strike.png');

  // ── 8. 刷新后仍保留 ─────────────────────────────────────
  console.log('── 8. 持久化 ──');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.canvas-host canvas', { timeout: 20_000 });
  await page.waitForTimeout(200);
  assert((await readMenuRoute(page)) === 'home', '刷新后回到主页面');
  await page.locator('#btnKeys').click();
  await page.waitForTimeout(150);
  assert((await laneKeys('top')).join(',') === 'Q,W', '刷新后上轨仍是 Q / W');
  assert((await laneKeys('bottom')).join(',') === 'Z,S', '刷新后下轨仍是 Z / S');

  // ── 9. 恢复默认 ─────────────────────────────────────────
  console.log('── 9. 恢复默认 ──');
  await page.getByRole('button', { name: '恢复默认' }).click();
  await page.waitForTimeout(150);
  assert((await laneKeys('top')).join(',') === '↑,W', '恢复默认后上轨回到 ↑ / W');
  assert((await laneKeys('bottom')).join(',') === '↓,S', '恢复默认后下轨回到 ↓ / S');
  const restored = await storedBindings();
  assert(restored?.top?.[0] === 'ArrowUp', '恢复默认也写回了 localStorage');
  await shot(page, 'kb-4-restored.png');

  assert(
    pageErrors.length === 0,
    `无页面异常${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`,
  );
  console.log('\n✓ 按键设置检查通过');
} catch (err) {
  console.error(`\n✗ 按键设置检查失败：${String(err)}`);
  await shot(page, 'kb-failure.png').catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser.close();
}
