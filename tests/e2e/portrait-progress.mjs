/**
 * 端到端：竖屏自动暂停 + **进度保留**。
 *
 * 跑法（先 build）：
 *   npm run build
 *   node tests/e2e/portrait-progress.mjs
 *
 * **要证明的事**（票 05 硬约束）：
 * > 竖屏必须能自动暂停并保留进度。
 *
 * 旧实现的行为（`source.html:500-515`）：竖屏 → 若在 running 则暂停并记下
 * 「因竖屏暂停」；转回横屏 → 若当前是 paused 且是「因竖屏暂停」则自动恢复。
 *
 * **怎么证明「保留进度」**（不靠肉眼，靠数值）：
 *
 * 1. 打出分数 / 连击 / 掉血，得到一份「暂停前的进度」。
 * 2. 转竖屏 → 自动暂停 → **隔 1.5 秒再读一次**：两次读数必须完全相同
 *    （暂停期间规则层不推进，进度被冻住；重置成新局的话这里会露出 250 血 / 0 分）。
 * 3. 转回横屏 → 自动恢复 → **在「恢复发生的那一刻」读一次**：
 *    页面侧监听 `resize` 事件，读到的就是恢复瞬间的 HUD 数值，
 *    必须与步骤 2 的数值逐字相同（比分 / 连击 / 血量 / 击杀）。
 * 4. 再确认游戏确实「活着」：恢复后血量会继续掉（漏怪）—— 说明不是卡在暂停。
 */

import {
  assert,
  launchBrowser,
  openApp,
  readHud,
  readPhase,
  shot,
  strike,
} from './lib/harness.mjs';

const browser = await launchBrowser();
const { page, pageErrors } = await openApp(browser);

try {
  // ── 准备：打出一份「有内容的进度」 ───────────────────────
  console.log('── 准备：制造分数 / 连击 / 掉血 ──');
  await page.locator('#startScreen h2').click();
  await page.waitForTimeout(300);

  let stop = false;
  const player = (async () => {
    let lane = 'top';
    while (!stop) {
      try {
        await strike(page, lane);
        await page.waitForTimeout(90);
      } catch {
        if (stop) return;
      }
      lane = lane === 'top' ? 'bottom' : 'top';
    }
  })();

  // 至少命中一次（分数 > 0）且至少掉一次血（漏怪），并拿到连击 > 0 的一刻。
  // **必须一次性取快照**：分三次读会撞上「漏怪把连击清零」的时刻。
  const handle = await page.waitForFunction(
    () => {
      const text = (sel) => globalThis.document.querySelector(sel)?.textContent?.trim() ?? null;
      const raw = text('#hpText') ?? '';
      const hp = Number(raw.split('/')[0].trim());
      const score = Number(text('#scoreText'));
      const combo = Number(text('#comboText'));
      if (!(score > 0 && combo > 0 && hp < 250)) return false;
      return {
        hpText: raw,
        hp,
        maxHp: Number(raw.split('/')[1].trim()),
        score,
        combo,
        comboLabel: text('#comboLabel'),
        crit: text('#critText'),
        best: Number(text('#bestText')),
      };
    },
    undefined,
    { timeout: 60_000 },
  );
  const before = await handle.jsonValue();
  stop = true;
  await player;

  assert(before.score > 0, `暂停前分数 > 0（${before.score}）`);
  assert(before.combo > 0, `暂停前连击 > 0（${before.combo}）`);
  assert(before.hp < before.maxHp, `暂停前已掉血（${before.hpText}）`);
  console.log(
    `   暂停前的进度：分数 ${before.score} / 连击 ${before.combo} / 血量 ${before.hpText}`,
  );
  await shot(page, 'p1-before-portrait.png');

  // ── 竖屏 → 自动暂停 ─────────────────────────────────────
  console.log('── 竖屏 → 自动暂停 ──');
  await page.setViewportSize({ width: 500, height: 800 });
  await page.evaluate(() => globalThis.dispatchEvent(new globalThis.Event('orientationchange')));
  await page.waitForTimeout(400);
  assert((await readPhase(page)) === 'paused', '转竖屏后自动进入暂停');
  // 竖屏时整个游戏层被 `display:none`（`.app:not(.landscape) .game`）——
  // 旧版同理（`body:not(.landscape) #game{display:none}`），
  // 所以玩家看到的是「请横屏游玩」提示，暂停遮罩在 DOM 里但不可见。
  assert(
    (await page.locator('#pause').count()) === 1,
    '暂停遮罩在 DOM 里（游戏层被竖屏布局隐藏，与旧版一致）',
  );
  assert(await page.locator('.rotate').isVisible(), '竖屏提示可见');
  assert(!(await page.locator('#pause').isVisible()), '竖屏时暂停遮罩不可见（游戏层整体隐藏）');
  await shot(page, 'p2-portrait-paused.png');

  // 暂停期间进度被冻住
  const pausedA = await readHud(page);
  assert(pausedA.score === before.score, `暂停期间分数不变（${pausedA.score}）`);
  assert(pausedA.combo === before.combo, `暂停期间连击不变（${pausedA.combo}）`);
  assert(pausedA.hp === before.hp, `暂停期间血量不变（${pausedA.hpText}）`);

  await page.waitForTimeout(1500);
  const pausedB = await readHud(page);
  assert(pausedB.score === pausedA.score, `暂停 1.5 秒后分数仍不变（${pausedB.score}）`);
  assert(pausedB.combo === pausedA.combo, `暂停 1.5 秒后连击仍不变（${pausedB.combo}）`);
  assert(pausedB.hp === pausedA.hp, `暂停 1.5 秒后血量仍不变（${pausedB.hpText}）`);
  console.log('   暂停 1.5 秒后进度逐字不变 ✓');

  // ── 转回横屏 → 自动恢复（读「恢复瞬间」的数值）──────────
  console.log('── 转回横屏 → 自动恢复 ──');
  // 页面侧监听 resize：在应用自己的监听器之后跑（它先注册），
  // 此刻规则层已经恢复，但还没推进任何一帧 —— 读到的就是恢复瞬间的 HUD。
  await page.evaluate(() => {
    globalThis.__onResume = null;
    globalThis.addEventListener('resize', () => {
      const text = (sel) => globalThis.document.querySelector(sel)?.textContent?.trim() ?? null;
      globalThis.__onResume = {
        hpText: text('#hpText'),
        score: Number(text('#scoreText')),
        combo: Number(text('#comboText')),
        crit: text('#critText'),
        best: Number(text('#bestText')),
        pauseVisible: globalThis.document.querySelector('#pause') !== null,
      };
    });
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => globalThis.dispatchEvent(new globalThis.Event('orientationchange')));
  await page.waitForTimeout(300);

  const onResume = await page.evaluate(() => globalThis.__onResume);
  assert(onResume !== null, '捕捉到了恢复瞬间的 HUD 读数');
  assert(onResume.pauseVisible === false, '恢复瞬间暂停界面已经隐藏');
  assert(
    onResume.score === before.score,
    `恢复瞬间分数与暂停前完全相同（${onResume.score} vs ${before.score}）`,
  );
  assert(
    onResume.combo === before.combo,
    `恢复瞬间连击与暂停前完全相同（${onResume.combo} vs ${before.combo}）`,
  );
  assert(
    onResume.hpText === before.hpText,
    `恢复瞬间血量与暂停前完全相同（${onResume.hpText} vs ${before.hpText}）`,
  );
  console.log(
    `   恢复瞬间：分数 ${onResume.score} / 连击 ${onResume.combo} / 血量 ${onResume.hpText}`,
  );
  await shot(page, 'p3-after-resume.png');

  // ── 确认游戏确实活着 ───────────────────────────────────
  console.log('── 确认恢复后游戏继续推进 ──');
  assert((await readPhase(page)) === 'running', '恢复后处于 running');
  await page.waitForFunction(
    (limit) => {
      const raw = globalThis.document.querySelector('#hpText')?.textContent ?? '';
      return Number(raw.split('/')[0].trim()) < limit;
    },
    before.hp,
    { timeout: 40_000 },
  );
  const after = await readHud(page);
  assert(
    after.hp < before.hp,
    `恢复后血量继续下降（${after.hpText}，暂停前 ${before.hpText}）—— 游戏确实在跑`,
  );
  await shot(page, 'p4-running-after-resume.png');

  assert(
    pageErrors.length === 0,
    `无页面异常${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`,
  );
  console.log('\n✓ 竖屏自动暂停 + 进度保留检查通过');
} catch (err) {
  console.error(`\n✗ 竖屏检查失败：${String(err)}`);
  await shot(page, 'portrait-failure.png').catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser.close();
}
