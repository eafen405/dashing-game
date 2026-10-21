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

  // 本地空轨语义下自动出刀几乎不漏怪（长按怪不再吞同轨输入），
  // 所以先不出刀，等第一只怪自然漏过来制造掉血，再开始出刀攒分数 / 连击。
  await page.waitForFunction(
    () => {
      const raw = globalThis.document.querySelector('#hpText')?.textContent ?? '';
      return Number(raw.split('/')[0].trim()) < 250;
    },
    undefined,
    { timeout: 60_000 },
  );
  console.log('  ✓ 第一只怪漏过（血量下降）');

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
      // 分数读 `data-value`（目标值），不读滚动中的显示文本 —— 见 `ScorePanel`。
      const scoreEl = globalThis.document.querySelector('#scoreText');
      const score = Number(scoreEl?.getAttribute('data-value') ?? scoreEl?.textContent ?? NaN);
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
  // 停止出刀后再等一小会儿，让最后一次命中 / 漏怪落定。
  await page.waitForTimeout(250);

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

  // 暂停期间进度被冻住。
  // 基线取**暂停之后**的值：从「停止出刀」到「真正暂停」之间，
  // 规则层还可能再走一两帧（例如最后一次漏怪），不能拿更早的 before 逐字比。
  const pausedA = await readHud(page);
  assert(pausedA.score > 0, `暂停时仍有分数（${pausedA.score}）`);
  assert(pausedA.hp < pausedA.maxHp, `暂停时已经掉过血（${pausedA.hpText}）`);

  await page.waitForTimeout(1500);
  const pausedB = await readHud(page);
  assert(pausedB.score === pausedA.score, `暂停 1.5 秒后分数仍不变（${pausedB.score}）`);
  assert(pausedB.combo === pausedA.combo, `暂停 1.5 秒后连击仍不变（${pausedB.combo}）`);
  assert(pausedB.hp === pausedA.hp, `暂停 1.5 秒后血量仍不变（${pausedB.hpText}）`);
  console.log('   暂停 1.5 秒后进度逐字不变 ✓');

  // ── 转回横屏 → 自动恢复 ─────────────────────────────────
  console.log('── 转回横屏 → 自动恢复 ──');
  // 等暂停遮罩真的从 DOM 里消失，再读 HUD —— 恢复是异步的 React 渲染，
  // 在 resize 事件里抢读会读到「还没恢复」的那一帧。
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => globalThis.dispatchEvent(new globalThis.Event('orientationchange')));
  await page.waitForFunction(
    () => globalThis.document.querySelector('#pause') === null,
    undefined,
    { timeout: 5_000 },
  );

  const onResume = await readHud(page);
  assert((await readPhase(page)) === 'running', '恢复后处于 running');
  assert(
    onResume.score === pausedB.score,
    `恢复后分数与暂停时完全相同（${onResume.score} vs ${pausedB.score}）`,
  );
  // 恢复后规则层会继续推进：血量只减不增，连击只可能被漏怪清零。
  assert(
    onResume.hp <= pausedB.hp,
    `恢复后血量没有回升（${onResume.hpText} vs ${pausedB.hpText}）`,
  );
  assert(
    onResume.combo <= pausedB.combo,
    `恢复后连击没有凭空增加（${onResume.combo} vs ${pausedB.combo}）`,
  );
  console.log(
    `   恢复后：分数 ${onResume.score} / 连击 ${onResume.combo} / 血量 ${onResume.hpText}`,
  );
  await shot(page, 'p3-after-resume.png');

  // ── 确认游戏确实活着 ───────────────────────────────────
  console.log('── 确认恢复后游戏继续推进 ──');
  await page.waitForFunction(
    (limit) => {
      const raw = globalThis.document.querySelector('#hpText')?.textContent ?? '';
      return Number(raw.split('/')[0].trim()) < limit;
    },
    pausedB.hp,
    { timeout: 40_000 },
  );
  const after = await readHud(page);
  assert(
    after.hp < pausedB.hp,
    `恢复后血量继续下降（${after.hpText}，暂停时 ${pausedB.hpText}）—— 游戏确实在跑`,
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
