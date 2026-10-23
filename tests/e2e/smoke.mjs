/**
 * 冒烟端到端 —— **CI 门禁里唯一跑的那个浏览器脚本**。
 *
 * 跑法（先 build）：
 *   npm run build
 *   node tests/e2e/smoke.mjs
 *
 * ## 它守什么
 *
 * 一条 30 秒的路径，把「这个产物还能玩」这件事从头到尾走一遍：
 *
 *   开机 → 难度屏 → 玩法说明屏 → 开局 → 出刀命中 → 暂停 / 恢复
 *        → 结算 → 「选择难度」→ 难度屏 → 回主页面
 *
 * 断言全部落在**可观察的 DOM 状态**上（元素文本 / 类名 / HUD 数值）。
 *
 * ## 它不守什么
 *
 * 完整的 8 步流程、旧版逐帧比对、特效像素判据 —— 那些在**本地**跑
 * （`npm run test:e2e` / `npm run test:visual` / `npm run trace`），
 * 不进每次 push 的门禁。理由见 `docs/adr/0008-ci-gate-slimmed-to-smoke.md`。
 *
 * ## 为什么选 4★ 开局
 *
 * 结算要等血量掉光（250 点，每漏一只 −20）。1★ 要等约 46 秒，
 * 4★ 只要约 13 秒 —— 冒烟要的是快，不是温和。
 */

import {
  assert,
  launchBrowser,
  openApp,
  readHud,
  readMenuRoute,
  readPhase,
  strike,
} from './lib/harness.mjs';

const browser = await launchBrowser();
const { page, pageErrors } = await openApp(browser);

/** HUD 里的「暴击 / 普攻」计数 —— 文案形如 `0 / 3`。 */
async function hitCounts() {
  const hud = await readHud(page);
  const raw = hud.crit ?? '0 / 0';
  const [crit, normal] = raw.split('/').map((part) => Number(part.trim()) || 0);
  return { crit: crit ?? 0, normal: normal ?? 0, total: (crit ?? 0) + (normal ?? 0) };
}

try {
  // ── 1. 开机：产物能起来 ─────────────────────────────────
  console.log('── 1. 开机 ──');
  assert((await page.locator('#startScreen').count()) === 1, '开始界面在');
  assert((await page.locator('.hud .hp-bar').count()) > 0, 'HUD 在');
  assert((await readPhase(page)) === 'idle', '当前屏幕是 idle');
  assert((await readMenuRoute(page)) === 'home', '当前菜单路由是 home');
  assert(
    (await page.locator('#btnDifficulty .home-summary-stars').textContent()) === '★',
    '难度摘要显示 1 星',
  );
  assert((await page.locator('#btnHelp').count()) === 1, '「玩法说明」入口在');

  // ── 2. 难度屏 ──────────────────────────────────────────
  console.log('── 2. 难度屏 ──');
  await page.locator('#btnDifficulty').click();
  await page.waitForTimeout(150);
  assert((await readMenuRoute(page)) === 'difficulty', '进到难度屏');
  assert((await page.locator('#difficultyScreen .diff-row').count()) === 4, '四档');
  assert((await page.locator('#difficultyScreen .axis-fill').count()) === 8, '每档两条轴');
  await page.locator('#difficultyScreen .diff-row[data-diff="4"]').click();
  await page.waitForTimeout(150);
  assert((await readMenuRoute(page)) === 'home', '选定后回主页面');
  assert(
    (await page.locator('#btnDifficulty .home-summary-stars').textContent()) === '★★★★',
    '摘要更新为 4 星',
  );

  // ── 3. 玩法说明屏 ──────────────────────────────────────
  console.log('── 3. 玩法说明屏 ──');
  await page.locator('#btnHelp').click();
  await page.waitForTimeout(150);
  assert((await readMenuRoute(page)) === 'help', '进到玩法说明屏');
  const help = (await page.locator('#helpScreen').textContent()) ?? '';
  assert(help.includes('判定区'), '规则墙在，用规范词「判定区」');
  assert(!help.includes('打击点'), '规则墙里没有旧词「打击点」');
  await page.locator('#btnHelpBack').click();
  await page.waitForTimeout(150);
  assert((await readMenuRoute(page)) === 'home', '返回主页面');

  // ── 4. 开局 ────────────────────────────────────────────
  console.log('── 4. 开局 ──');
  await page.locator('#startScreen h2').click();
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'running', '进入 running');

  // ── 5. 出刀命中 ────────────────────────────────────────
  // 脚本「看不见怪」，所以持续出刀：怪物进判定区的那一刻必然被砍中。
  console.log('── 5. 出刀命中 ──');
  const hitDeadline = Date.now() + 20_000;
  let hits = await hitCounts();
  let lane = 'top';
  while (hits.total === 0 && Date.now() < hitDeadline) {
    await strike(page, lane);
    lane = lane === 'top' ? 'bottom' : 'top';
    await page.waitForTimeout(90);
    hits = await hitCounts();
  }
  assert(hits.total > 0, `出刀打到了怪（暴击 ${hits.crit} / 普攻 ${hits.normal}）`);
  assert((await readHud(page)).score > 0, '分数涨了');

  // ── 6. 暂停 / 恢复 ─────────────────────────────────────
  console.log('── 6. 暂停 / 恢复 ──');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  assert((await readPhase(page)) === 'paused', 'P 键暂停');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  assert((await readPhase(page)) === 'running', 'P 键恢复');

  // ── 7. 结算 ────────────────────────────────────────────
  console.log('── 7. 结算 ──');
  await page.waitForFunction(
    () => globalThis.document.querySelector('#gameOver') !== null,
    undefined,
    { timeout: 120_000 },
  );
  assert((await readPhase(page)) === 'over', '结算界面出现');
  const over = (await page.locator('#gameOver').textContent()) ?? '';
  assert(over.includes('GAME OVER'), '结算标题在');
  assert(over.includes('MAX COMBO'), '结算三个数字在');

  // ── 8. 结算 → 难度屏 → 主页面 ──────────────────────────
  console.log('── 8. 结算 → 难度屏 ──');
  await page.locator('#btnDiff').click();
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'idle', '「选择难度」退出结算');
  assert((await readMenuRoute(page)) === 'difficulty', '「选择难度」直接进难度屏');
  await page.locator('#btnDiffBack').click();
  await page.waitForTimeout(200);
  assert((await readMenuRoute(page)) === 'home', '难度屏点「返回」回主页面');

  assert(
    pageErrors.length === 0,
    `无页面异常${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`,
  );
  console.log('\n✓ 冒烟通过');
} finally {
  await browser.close();
}
