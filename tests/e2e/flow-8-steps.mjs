/**
 * 端到端：全流程 8 步（每步一张截图）。
 *
 * 跑法（先 build）：
 *   npm run build
 *   node tests/e2e/flow-8-steps.mjs
 *
 * 8 步（对应票 05 的验收「全屏流程可走通」）：
 *   1. 开始界面（标题 + 难度星级 1★ / 2★）
 *   2. 选难度 → 进场
 *   3. 游戏中：出刀 / 命中 / 得分飘字 / 受击掉血 / 连击徽章
 *   4. 暂停（`P` 键）→ 恢复（`P` 键）
 *   5. 结算：SCORE / MAX COMBO / KILLS / BEST
 *   6. 结算 → 重开（再来一局）
 *   7. 结算 → 回主页（选择难度 → 开始界面）
 *   8. 最高分写入 `localStorage["dualrail_best"]`，并在下次开始界面显示
 *
 * 断言全部落在**可观察的 DOM 状态**上（元素文本 / 类名 / `localStorage`）。
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  SHOTS,
  assert,
  captureShot,
  isGameOver,
  lastToast,
  launchBrowser,
  openApp,
  readHud,
  readMenuRoute,
  readPhase,
  readStoredBest,
  shot,
  strike,
  toastCount,
  waitForToast,
} from './lib/harness.mjs';

const browser = await launchBrowser();
const { page, pageErrors } = await openApp(browser);

/** 自动出刀器的停止开关。 */
const stop = { done: false };

/** 自动出刀协程的引用（`finally` 里要等它收尾，否则会留下未处理的 rejection）。 */
let playerPromise = null;

/**
 * 自动出刀 —— 上下轨轮流点。
 *
 * 存在的理由：怪物从右侧进入判定区才打得到，脚本没有「看见怪」的能力，
 * 所以用「持续出刀」把命中 / 漏怪两类事件都制造出来。
 * 出刀是事件驱动 —— 每次点击只产生一次规则层事件，不会污染帧率。
 */
async function autoPlay(intervalMs) {
  let lane = 'top';
  while (!stop.done) {
    try {
      await strike(page, lane);
      await page.waitForTimeout(intervalMs);
    } catch {
      // 页面正在切换（暂停 / 结算 / 关闭）时点击可能失败 —— 收尾后退出
      if (stop.done) return;
    }
    lane = lane === 'top' ? 'bottom' : 'top';
  }
}

try {
  // ── 步骤 1：开始界面 ──────────────────────────────────────
  console.log('── 步骤 1：开始界面 ──');
  assert(
    (await page.locator('#startScreen h2').textContent()) === '双轨打怪',
    '标题是「双轨打怪」',
  );
  // 开始界面**不再平铺**难度 chip —— 深度来自屏数，不是排布。
  assert(
    (await page.locator('#startScreen .diff-btn').count()) === 0,
    '开始界面没有平铺的难度按钮',
  );
  assert((await page.locator('#btnDifficulty').count()) === 1, '开始界面有「难度」入口');
  assert((await page.locator('#btnHelp').count()) === 1, '开始界面有「玩法说明」入口');
  assert(
    (await page.locator('#btnDifficulty .home-summary-stars').textContent()) === '★',
    '难度摘要显示 1 星',
  );
  assert(
    (await page.locator('#btnDifficulty .home-summary-name').textContent()) === '标准',
    '难度摘要显示「标准」',
  );
  assert((await readPhase(page)) === 'idle', '当前屏幕是 idle（开始界面）');
  assert((await readMenuRoute(page)) === 'home', '当前菜单路由是 home');
  await shot(page, '01-start-screen.png');

  // ── 步骤 1b：玩法说明屏 ───────────────────────────────────
  console.log('── 步骤 1b：玩法说明屏 ──');
  await page.locator('#btnHelp').click();
  await page.waitForTimeout(150);
  assert((await readMenuRoute(page)) === 'help', '点「玩法说明」进入玩法说明屏');
  const helpText = (await page.locator('#helpScreen').textContent()) ?? '';
  assert(helpText.includes('判定区'), '玩法说明用规范词「判定区」');
  assert(!helpText.includes('打击点'), '玩法说明里没有旧词「打击点」');
  assert(!helpText.includes('光门'), '玩法说明里没有旧词「光门」');
  assert(!helpText.includes('判定框'), '玩法说明里没有旧词「判定框」');
  assert(!helpText.includes('COMBO'), '玩法说明里没有旧词「COMBO」');
  assert(helpText.includes('连击'), '玩法说明用规范词「连击」');
  await shot(page, '01b-help-screen.png');
  await page.locator('#btnHelpBack').click();
  await page.waitForTimeout(150);
  assert((await readMenuRoute(page)) === 'home', '点「返回」回到主页面');

  // ── 步骤 2：选难度 → 进场 ─────────────────────────────────
  console.log('── 步骤 2：选难度 → 进场 ──');
  await page.locator('#btnDifficulty').click();
  await page.waitForTimeout(150);
  assert((await readMenuRoute(page)) === 'difficulty', '点「难度」进入难度屏');
  assert((await page.locator('#difficultyScreen .diff-row').count()) === 4, '难度屏有四档');
  // 纵排而不是平铺：四行叠在一起，不是一行四个 chip。
  const rowsStacked = await page.evaluate(() => {
    const rows = [...globalThis.document.querySelectorAll('#difficultyScreen .diff-row')];
    if (rows.length < 2) return false;
    const top = rows[0].getBoundingClientRect().top;
    const second = rows[1].getBoundingClientRect().top;
    return second > top;
  });
  assert(rowsStacked, '四档难度是纵排的（不是并排平铺）');

  assert(
    (await page.locator('#difficultyScreen .diff-row[data-diff="1"] .diff-stars').textContent()) ===
      '★',
    '1 星显示一颗星',
  );
  assert(
    (await page.locator('#difficultyScreen .diff-row[data-diff="2"] .diff-stars').textContent()) ===
      '★★',
    '2 星显示两颗星',
  );
  assert(
    (await page.locator('#difficultyScreen .diff-row[data-diff="3"] .diff-stars').textContent()) ===
      '★★★',
    '3 星显示三颗星',
  );
  assert(
    (await page.locator('#difficultyScreen .diff-row[data-diff="4"] .diff-stars').textContent()) ===
      '★★★★',
    '4 星显示四颗星',
  );

  // 两条轴：3★ 密度满格但移速不满，4★ 移速满格但密度不满 —— 非单调关系可见。
  const axes = await page.evaluate(() => {
    const width = (sel) =>
      Number(
        (globalThis.document.querySelector(sel)?.getBoundingClientRect().width ?? 0).toFixed(2),
      );
    return {
      threeDensity: width('#difficultyScreen .diff-row[data-diff="3"] .axis-density'),
      threeSpeed: width('#difficultyScreen .diff-row[data-diff="3"] .axis-speed'),
      fourDensity: width('#difficultyScreen .diff-row[data-diff="4"] .axis-density'),
      fourSpeed: width('#difficultyScreen .diff-row[data-diff="4"] .axis-speed'),
    };
  });
  assert(axes.threeDensity > axes.fourDensity, '3★ 的密度条比 4★ 长（3★ 更密）');
  assert(axes.fourSpeed > axes.threeSpeed, '4★ 的移速条比 3★ 长（4★ 更快）');
  assert(axes.threeDensity > axes.threeSpeed, '3★ 是「密而慢」');

  assert(
    (
      await page.locator('#difficultyScreen .diff-row[data-diff="1"]').getAttribute('class')
    )?.includes('active'),
    '默认选中 1 星',
  );
  assert(
    (
      await page.locator('#difficultyScreen .diff-row[data-diff="3"] .diff-note').textContent()
    )?.includes('最密'),
    '3 星说明它是「最密」',
  );
  assert(
    (
      await page.locator('#difficultyScreen .diff-row[data-diff="4"] .diff-note').textContent()
    )?.includes('最快'),
    '4 星说明它是「最快」',
  );
  await shot(page, '02-difficulty-screen.png');

  // 点 2 星 → 选定并回主页面
  await page.locator('#difficultyScreen .diff-row[data-diff="2"]').click();
  await page.waitForTimeout(150);
  assert((await readMenuRoute(page)) === 'home', '选定难度后回主页面');
  assert(
    (await page.locator('#btnDifficulty .home-summary-stars').textContent()) === '★★',
    '主页面摘要更新为 2 星',
  );
  await shot(page, '02b-difficulty-picked.png');

  // 点标题开始（难度 / 玩法说明两个入口都带 data-no-strike，点它们不会开始游戏）
  await page.locator('#startScreen h2').click();
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'running', '点击标题后进入 running');
  assert((await page.locator('#startScreen').count()) === 0, '开始界面消失');
  await shot(page, '03-game-entered.png');

  // ── 步骤 3：游戏中（出刀 / 命中 / 飘字 / 掉血 / 连击）──────
  console.log('── 步骤 3：游戏中 ──');
  playerPromise = autoPlay(90);

  // 3a 出刀：点击后立刻截图（刀光 life 0.3s）
  // 刀光分三段：飞向打击点的新月（0~0.1s）、打击点新月（0.03~0.22s）、竖向光柱。
  // 整页截图一次约 190ms、裁剪截图约 95ms —— 所以先拍裁剪图抓新月，再拍整页。
  const stage = await page.locator('.stage').boundingBox();
  await strike(page, 'top');
  mkdirSync(SHOTS, { recursive: true });
  await captureShot(page, join(SHOTS, '04-slash-detail.png'), {
    clip: { x: stage.x + 120, y: stage.y, width: 560, height: 380 },
  });
  await shot(page, '04-slash.png');
  assert((await page.locator('.lane-top.hit, .lane-bottom.hit').count()) > 0, '出刀有轨道高亮');

  // 3b 命中 + 得分飘字：等一条带「+分数」的 toast
  const hit = await waitForToast(page, '\\+\\d+');
  assert(/\+\d+/.test(hit.text), `命中 toast 出现：「${hit.text}」`);
  await shot(page, '05-hit-floater.png');

  // 3c 连击徽章
  await page.waitForFunction(
    () => Number(globalThis.document.querySelector('#comboText')?.textContent ?? '0') > 0,
    undefined,
    { timeout: 30_000 },
  );
  const comboHud = await readHud(page);
  assert(comboHud.combo > 0, `连击徽章显示连击数（combo=${comboHud.combo}）`);
  assert(comboHud.comboLabel === 'COMBO', `连击标签是 COMBO（实际「${comboHud.comboLabel}」）`);
  await shot(page, '06-combo-badge.png');

  // 3d 受击掉血
  // 本地空轨语义下自动出刀几乎不漏怪（长按怪不会再吞同轨输入），
  // 先停掉自动出刀，等第一只怪自然漏过来。
  stop.done = true;
  await playerPromise;
  await page.waitForFunction(
    () => {
      const raw = globalThis.document.querySelector('#hpText')?.textContent ?? '';
      return Number(raw.split('/')[0].trim()) < 250;
    },
    undefined,
    { timeout: 40_000 },
  );
  const hurtHud = await readHud(page);
  assert(hurtHud.hp < 250, `漏怪后血量下降（hp=${hurtHud.hpText}）`);
  await shot(page, '07-hp-drop.png');

  // 3e 命中提示确实会出现在 toast 里（不是靠猜）
  const toast = await lastToast(page);
  assert(toast !== null, `页面记录到了 ${await toastCount(page)} 条 toast`);

  // ── 步骤 4：暂停 → 恢复 ──────────────────────────────────
  console.log('── 步骤 4：暂停 → 恢复 ──');
  // 先停掉自动出刀：恢复后若还在出刀，分数 / 连击会在断言前继续变化。
  stop.done = true;
  await playerPromise;
  await page.waitForTimeout(250);

  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  assert((await readPhase(page)) === 'paused', '按 P 键进入暂停');
  // 冻结值在**暂停之后**读：暂停前的最后一次命中可能还在滚动 / 结算。
  const beforePause = await readHud(page);
  assert(
    (await page.locator('#pause .pause-card h2').textContent()) === '已暂停',
    '暂停界面标题是「已暂停」',
  );
  await shot(page, '08-paused.png');

  // 暂停期间进度不变
  await page.waitForTimeout(1500);
  const duringPause = await readHud(page);
  assert(
    duringPause.hp === beforePause.hp,
    `暂停期间血量不变（${beforePause.hpText} → ${duringPause.hpText}）`,
  );
  assert(
    duringPause.score === beforePause.score,
    `暂停期间分数不变（${beforePause.score} → ${duringPause.score}）`,
  );
  assert(
    duringPause.combo === beforePause.combo,
    `暂停期间连击不变（${beforePause.combo} → ${duringPause.combo}）`,
  );

  await page.locator('#btnResume').click();
  await page.waitForTimeout(200);
  assert((await readPhase(page)) === 'running', '点「继续」恢复运行（鼠标路径）');
  const afterResume = await readHud(page);
  assert(afterResume.score === beforePause.score, `恢复后分数不变（${afterResume.score}）`);
  // 连击不再跨恢复断言：恢复后规则层会继续推进，漏怪合法地把连击清零。
  // 「暂停期间连击不变」已经在上面的冻结窗口里验证过。
  await shot(page, '09-resumed.png');

  // 暂停按钮（鼠标路径）也要能用
  await page.locator('#btnPause').click();
  await page.waitForTimeout(200);
  assert((await readPhase(page)) === 'paused', '点 HUD 上的暂停按钮进入暂停');
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  assert((await readPhase(page)) === 'running', '按 P 键恢复运行（键盘路径）');

  // ── 步骤 5：结算 ─────────────────────────────────────────
  console.log('── 步骤 5：结算 ──');
  stop.done = true;
  await playerPromise;
  console.log('   （停止出刀，等漏怪把血量打空 → 结算）');
  await page.waitForFunction(
    () => globalThis.document.querySelector('#gameOver') !== null,
    undefined,
    {
      timeout: 120_000,
    },
  );
  assert(await isGameOver(page), '结算界面出现');

  const over = await page.evaluate(() => {
    const text = (sel) => globalThis.document.querySelector(sel)?.textContent?.trim() ?? null;
    return {
      score: Number(text('#goScore')),
      maxCombo: Number(text('#goCombo')),
      kills: Number(text('#goKills')),
      bestText: text('#goBest'),
      labels: [...globalThis.document.querySelectorAll('#gameOver .score-row .k')].map((n) =>
        n.textContent.trim(),
      ),
      actions: [...globalThis.document.querySelectorAll('#gameOver .go-actions button')].map((n) =>
        n.textContent.trim(),
      ),
    };
  });
  assert(
    over.labels.join('|') === 'SCORE|MAX COMBO|KILLS',
    `结算字段顺序是 SCORE / MAX COMBO / KILLS（实际「${over.labels.join(' / ')}」）`,
  );
  assert(
    over.actions.join('|') === '再来一局|选择难度',
    `结算按钮是「再来一局」「选择难度」（实际「${over.actions.join('」「')}」）`,
  );
  assert(over.score > 0, `结算分数 > 0（${over.score}）`);
  assert(over.maxCombo > 0, `结算最大连击 > 0（${over.maxCombo}）`);
  assert(over.kills > 0, `结算击杀数 > 0（${over.kills}）`);
  assert(
    over.bestText === `历史最高分 ${over.bestText.replace('历史最高分 ', '')}`,
    `最高分行文案是「历史最高分 N」（实际「${over.bestText}」）`,
  );
  await shot(page, '10-game-over.png');

  // ── 步骤 6：结算 → 重开 ──────────────────────────────────
  console.log('── 步骤 6：重开 ──');
  await page.locator('#btnRestart').click();
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'running', '「再来一局」回到 running');
  const restarted = await readHud(page);
  assert(restarted.score === 0, `重开后分数归零（${restarted.score}）`);
  assert(restarted.hp === restarted.maxHp, `重开后血量回满（${restarted.hpText}）`);
  await shot(page, '11-restarted.png');

  // ── 步骤 7：结算 → 回主页 ────────────────────────────────
  console.log('── 步骤 7：回主页 ──');
  console.log('   （这一局不出刀，等漏怪结算）');
  await page.waitForFunction(
    () => globalThis.document.querySelector('#gameOver') !== null,
    undefined,
    {
      timeout: 120_000,
    },
  );
  await page.locator('#btnDiff').click();
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'idle', '「选择难度」退出结算');
  // 「选择难度」现在**直接进难度屏**（旧版是回开始界面重选）。
  assert((await readMenuRoute(page)) === 'difficulty', '「选择难度」直接进难度屏');
  assert((await page.locator('#difficultyScreen .diff-row').count()) === 4, '难度屏有四档');
  await shot(page, '12-back-to-home.png');

  // 从难度屏返回主页面
  await page.locator('#btnDiffBack').click();
  await page.waitForTimeout(200);
  assert((await readMenuRoute(page)) === 'home', '难度屏点「返回」回主页面');

  // ── 步骤 8：最高分持久化 ─────────────────────────────────
  console.log('── 步骤 8：最高分写入 localStorage 并在下次显示 ──');
  const stored = await readStoredBest(page);
  assert(stored !== null, `localStorage["dualrail_best"] 有值（${stored}）`);
  const storedNumber = Number(stored);
  assert(Number.isFinite(storedNumber) && storedNumber > 0, `最高分是正数（${stored}）`);

  const homeHud = await readHud(page);
  assert(
    homeHud.best === storedNumber,
    `开始界面的 BEST 显示的就是持久化的最高分（${homeHud.best}）`,
  );
  await shot(page, '13-best-shown-on-start.png');

  // 刷新页面：最高分应当从 localStorage 读回来
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.canvas-host canvas', { timeout: 20_000 });
  await page.waitForTimeout(200);
  const reloadedHud = await readHud(page);
  assert(
    reloadedHud.best === storedNumber,
    `刷新后 BEST 仍从 localStorage 读回（${reloadedHud.best}）`,
  );
  await shot(page, '14-best-after-reload.png');

  assert(
    pageErrors.length === 0,
    `无页面异常${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`,
  );
  console.log('\n✓ 8 步全流程通过');
} catch (err) {
  console.error(`\n✗ 全流程失败：${String(err)}`);
  await shot(page, '99-failure.png').catch(() => undefined);
  process.exitCode = 1;
} finally {
  stop.done = true;
  await playerPromise?.catch(() => undefined);
  await browser.close();
}
