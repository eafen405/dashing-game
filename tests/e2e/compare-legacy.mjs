/**
 * 端到端：与旧版界面并排对比。
 *
 * 跑法（先 build）：
 *   npm run build
 *   node tests/e2e/compare-legacy.mjs
 *
 * **对比什么**：旧版 `source.html`（只读参照）与新版 `dist/index.html`
 * 在**同一浏览器、同一视口、同一界面状态**下的截图。
 *
 * 对比的四个界面状态：
 *   1. 开始界面（标题 / 说明 / 难度星级 / 开始提示）
 *   2. 游戏中的 HUD（血条 / SCORE / COMBO / 暴击普攻 / BEST 的**排列顺序**）
 *   3. 暂停界面
 *   4. 结算界面（GAME OVER / 三个数字 / 历史最高分 / 两个按钮）
 *
 * **并排图怎么来的**：没有装任何图像处理库 —— 把两张 PNG 写进一个临时 HTML，
 * 用浏览器自己排版再截图。所以并排图是**真实渲染**出来的，不是拼图工具拼的。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, captureShot, launchBrowser, SHOTS } from './lib/harness.mjs';

/** 旧版页面（只读参照）—— 与仓库根同目录。 */
const LEGACY = resolve(process.cwd(), 'source.html');
/** 新版产物。 */
const DIST = join(process.cwd(), 'dist', 'index.html');

/** 对比用的视口。 */
const VIEWPORT = { width: 1280, height: 720 };

const browser = await launchBrowser();

/**
 * 排队等着合成的并排图 —— 合成阶段放到最后、单独一个浏览器里做（见 `composeAll`）。
 *
 * @type {{title: string, left: string, right: string, out: string, imageHeight: number}[]}
 */
const pendingComposes = [];

/**
 * 并排合成 —— 排队（真正排版见 `composeIn`）。
 *
 * @param title 标题。
 * @param left 旧版截图路径。
 * @param right 新版截图路径。
 * @param out 输出的并排图路径。
 */
async function compose(page, title, left, right, out, imageHeight = VIEWPORT.height) {
  pendingComposes.push({ title, left, right, out, imageHeight });
}

/**
 * 真的排版 + 截图（用一个**干净的**浏览器，游戏页面已经关掉了）。
 *
 * @param {{title: string, left: string, right: string, out: string, imageHeight: number}} item
 */
async function composeIn(composeBrowser, item) {
  const { title, left, right, out, imageHeight } = item;
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
    <figure><figcaption>新版 dist/index.html（React UI 层）</figcaption><img src="${pathToFileURL(right).href}"></figure>
  </div>
</body></html>`;
  const htmlPath = out.replace(/\.png$/, '.html');
  writeFileSync(htmlPath, html);
  const composePage = await composeBrowser.newPage({
    viewport: { width: VIEWPORT.width * 2 + 64, height: imageHeight + 120 },
  });
  await composePage.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await captureShot(composePage, out, { attempts: 3 });
  await composePage.close();
}

/**
 * 合成阶段 —— 游戏浏览器关掉之后，用一个**干净的**浏览器排版并排图。
 *
 * **为什么要单独一个浏览器**：合成要新开一个页面（2624 宽）再截图。在 CI 那种
 * 2 核 runner 上，游戏那两个页面还开着的时候，新页面经常拿不到画面 ——
 * `Protocol error (Page.captureScreenshot): Unable to capture screenshot`。
 * 本机 32 核 + 9.8 GB `/dev/shm`，永远复现不出来。
 *
 * @param {{title: string, left: string, right: string, out: string, imageHeight: number}[]} items
 * @returns {Promise<number>} 合成成功了几张。
 */
async function composeAll(items) {
  if (items.length === 0) return 0;
  console.log('\n── 合成并排图（游戏页面已关闭，单独一个浏览器）──');
  let composeBrowser = await launchBrowser();
  let ok = 0;
  try {
    for (const item of items) {
      try {
        await composeIn(composeBrowser, item);
        ok += 1;
      } catch (err) {
        // 单张并排图合不出来**不判红**：两边的单图还在（那才是证据），
        // 并排图只是给人看的。真正的硬判据是上面那些文案 / 布局断言。
        console.log(`  ⚠ 这张并排图没合成出来：${String(err)}`);
        await composeBrowser.close().catch(() => {});
        composeBrowser = await launchBrowser();
      }
    }
  } finally {
    await composeBrowser.close().catch(() => {});
  }
  return ok;
}

try {
  mkdirSync(SHOTS, { recursive: true });

  // ── 打开两个页面（同一浏览器、同一视口）──────────────────
  console.log('── 打开旧版与新版 ──');
  const legacy = await browser.newPage({ viewport: VIEWPORT });
  const modern = await browser.newPage({ viewport: VIEWPORT });
  const errors = [];
  legacy.on('pageerror', (e) => errors.push(`旧版：${String(e)}`));
  modern.on('pageerror', (e) => errors.push(`新版：${String(e)}`));

  await legacy.goto(pathToFileURL(LEGACY).href, { waitUntil: 'load' });
  await modern.goto(pathToFileURL(DIST).href, { waitUntil: 'load' });
  await legacy.waitForSelector('#startScreen', { timeout: 20_000 });
  await modern.waitForSelector('#startScreen', { timeout: 20_000 });

  // ── 1. 开始界面 ─────────────────────────────────────────
  console.log('── 1. 开始界面 ──');
  const legacyStart = join(SHOTS, 'cmp-legacy-1-start.png');
  const modernStart = join(SHOTS, 'cmp-new-1-start.png');
  await captureShot(legacy, legacyStart);
  await captureShot(modern, modernStart);
  console.log(`  📷 ${legacyStart}`);
  console.log(`  📷 ${modernStart}`);
  await compose(
    modern,
    '对比 1 · 开始界面',
    legacyStart,
    modernStart,
    join(SHOTS, 'cmp-1-start.png'),
  );

  // 难度星级：两边的默认选中态应当一致（1★）
  const legacyActive = await legacy.locator('.diff-btn.active .stars').textContent();
  const modernActive = await modern.locator('.diff-btn.active .stars').textContent();
  assert(
    legacyActive === modernActive,
    `默认选中的难度星级一致（旧「${legacyActive}」/ 新「${modernActive}」）`,
  );

  // ── 2. 游戏中的 HUD ─────────────────────────────────────
  console.log('── 2. 游戏中的 HUD ──');
  await legacy.locator('#startScreen h2').click();
  await modern.locator('#startScreen h2').click();
  await legacy.waitForTimeout(500);
  await modern.waitForTimeout(500);
  // 两边都打几下，让 HUD 里有分数 / 连击
  for (let i = 0; i < 6; i += 1) {
    await legacy.mouse.click(900, 200);
    await modern.mouse.click(900, 200);
    await legacy.waitForTimeout(120);
    await modern.waitForTimeout(120);
  }
  const legacyHud = join(SHOTS, 'cmp-legacy-2-hud.png');
  const modernHud = join(SHOTS, 'cmp-new-2-hud.png');
  await captureShot(legacy, legacyHud, { clip: { x: 0, y: 0, width: 1280, height: 60 } });
  await captureShot(modern, modernHud, { clip: { x: 0, y: 0, width: 1280, height: 60 } });
  console.log(`  📷 ${legacyHud}`);
  console.log(`  📷 ${modernHud}`);
  await compose(
    modern,
    '对比 2 · 顶部 HUD（排列顺序：SCORE → COMBO → 暴击/普攻 → BEST）',
    legacyHud,
    modernHud,
    join(SHOTS, 'cmp-2-hud.png'),
    60,
  );

  // HUD 排列顺序：两边的标签序列必须逐字相同。
  // 只取 `.stat` 的**直接子** `<span>`（标签本身）；分数面板内部还有一个
  // 承载滚动数字的 `<motion.span>`，不能混进来。
  const legacyLabels = await legacy.evaluate(() =>
    [...globalThis.document.querySelectorAll('#hud .stat > span')].map((n) => n.textContent.trim()),
  );
  const modernLabels = await modern.evaluate(() =>
    [...globalThis.document.querySelectorAll('#hud .stat > span')].map((n) => n.textContent.trim()),
  );
  assert(
    legacyLabels.join('|') === modernLabels.join('|'),
    `HUD 标签顺序一致（旧「${legacyLabels.join('/')}」/ 新「${modernLabels.join('/')}」）`,
  );

  // ── 3. 暂停界面 ─────────────────────────────────────────
  console.log('── 3. 暂停界面 ──');
  await legacy.keyboard.press('KeyP');
  await modern.keyboard.press('KeyP');
  await legacy.waitForTimeout(400);
  await modern.waitForTimeout(400);
  assert((await legacy.locator('#pause').count()) === 1, '旧版进入暂停');
  assert((await modern.locator('#pause').count()) === 1, '新版进入暂停');
  const legacyPause = join(SHOTS, 'cmp-legacy-3-pause.png');
  const modernPause = join(SHOTS, 'cmp-new-3-pause.png');
  await captureShot(legacy, legacyPause);
  await captureShot(modern, modernPause);
  console.log(`  📷 ${legacyPause}`);
  console.log(`  📷 ${modernPause}`);
  await compose(
    modern,
    '对比 3 · 暂停界面',
    legacyPause,
    modernPause,
    join(SHOTS, 'cmp-3-pause.png'),
  );

  const legacyPauseText = await legacy.locator('#pause .card h2').textContent();
  const modernPauseText = await modern.locator('#pause h2').textContent();
  assert(
    legacyPauseText.trim() === modernPauseText.trim(),
    `暂停界面标题一致（「${legacyPauseText.trim()}」）`,
  );
  const legacyPauseButtons = await legacy.evaluate(() =>
    [...globalThis.document.querySelectorAll('#pause button')].map((n) => n.textContent.trim()),
  );
  const modernPauseButtons = await modern.evaluate(() =>
    [...globalThis.document.querySelectorAll('#pause button')].map((n) => n.textContent.trim()),
  );
  assert(
    legacyPauseButtons.join('|') === modernPauseButtons.join('|'),
    `暂停界面按钮一致（旧「${legacyPauseButtons.join('/')}」/ 新「${modernPauseButtons.join('/')}」）`,
  );

  // 恢复，继续打到结算
  await legacy.keyboard.press('KeyP');
  await modern.keyboard.press('KeyP');
  await legacy.waitForTimeout(300);
  await modern.waitForTimeout(300);

  // ── 4. 结算界面 ─────────────────────────────────────────
  console.log('── 4. 结算界面（等漏怪打空血量）──');
  await legacy.waitForSelector('#gameOver:not(.hide)', { timeout: 120_000 });
  await modern.waitForSelector('#gameOver', { timeout: 120_000 });
  const legacyOver = join(SHOTS, 'cmp-legacy-4-gameover.png');
  const modernOver = join(SHOTS, 'cmp-new-4-gameover.png');
  await captureShot(legacy, legacyOver);
  await captureShot(modern, modernOver);
  console.log(`  📷 ${legacyOver}`);
  console.log(`  📷 ${modernOver}`);
  await compose(
    modern,
    '对比 4 · 结算界面',
    legacyOver,
    modernOver,
    join(SHOTS, 'cmp-4-gameover.png'),
  );

  const legacyOverText = await legacy.evaluate(() => ({
    title: globalThis.document.querySelector('#gameOver .big').textContent.trim(),
    keys: [...globalThis.document.querySelectorAll('#gameOver .score-row .k')].map((n) =>
      n.textContent.trim(),
    ),
    best: globalThis.document.querySelector('#goBest').textContent.trim(),
    buttons: [...globalThis.document.querySelectorAll('#gameOver .go-actions button')].map((n) =>
      n.textContent.trim(),
    ),
  }));
  const modernOverText = await modern.evaluate(() => ({
    title: globalThis.document.querySelector('#gameOver .gameover-big').textContent.trim(),
    keys: [...globalThis.document.querySelectorAll('#gameOver .score-row .k')].map((n) =>
      n.textContent.trim(),
    ),
    best: globalThis.document.querySelector('#goBest').textContent.trim(),
    buttons: [...globalThis.document.querySelectorAll('#gameOver .go-actions button')].map((n) =>
      n.textContent.trim(),
    ),
  }));
  assert(
    legacyOverText.title === modernOverText.title,
    `结算标题一致（「${modernOverText.title}」）`,
  );
  assert(
    legacyOverText.keys.join('|') === modernOverText.keys.join('|'),
    `结算字段顺序一致（旧「${legacyOverText.keys.join('/')}」/ 新「${modernOverText.keys.join('/')}」）`,
  );
  assert(
    legacyOverText.buttons.join('|') === modernOverText.buttons.join('|'),
    `结算按钮一致（旧「${legacyOverText.buttons.join('/')}」/ 新「${modernOverText.buttons.join('/')}」）`,
  );
  assert(
    /^历史最高分 \d+$/.test(modernOverText.best),
    `最高分行文案格式一致（旧「${legacyOverText.best}」/ 新「${modernOverText.best}」）`,
  );

  assert(errors.length === 0, `两个页面都无异常${errors.length ? '：' + errors.join(' | ') : ''}`);
  console.log('\n✓ 与旧版并排对比完成');
} catch (err) {
  console.error(`\n✗ 并排对比失败：${String(err)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}

// ── 合成阶段 ───────────────────────────────────────────────
// 游戏浏览器已经关掉了 —— 用一个干净的浏览器排版并排图，
// 不跟任何还开着的页面抢资源（见 `composeAll` 的说明）。
if (pendingComposes.length > 0) {
  const composed = await composeAll(pendingComposes);
  console.log(`✓ 并排图合成 ${composed}/${pendingComposes.length} 张`);
}
