/**
 * 端到端：键盘长按怪 —— 按住 3 秒贯穿。
 *
 * 跑法（先 build）：
 *   npm run build
 *   node tests/e2e/hold-monster-keyboard.mjs
 *
 * **要证明的事**（brief-05 §4）：
 * > 长按怪要靠 `keyup` / `pointerup` 判失败 —— 验证键盘长按怪能正常走完 3 秒。
 *
 * **怎么驱动**（长按怪的时序是概率性的，所以全程用可观察信号驱动）：
 *
 * 1. 长按怪在 `now > 8s` 之后按 **28%** 概率刷新 → 出现时弹 toast
 *    「长按敌人！头进判定框后点击」。等这条 toast。
 * 2. 长按怪的头进入判定区时按下 → 规则层 `startHold` →
 *    toast「长按中… 保持 3 秒」+ 头部 +200。**这就是「起手成功」的信号。**
 * 3. 起手成功后**不能松键**（松键 = `releaseHold` = 长按失败，怪会自逃），
 *    所以脚本在每次尝试里先按住 320ms 再判断：起手了就继续保持，
 *    没起手才松键重试（上下轨轮流按）。
 * 4. 保持 3 秒 → toast「长按贯穿！」+ 尾部 +200；期间第 1 秒还有一次 +200。
 *    总计 +600 分。
 *
 * **断言**：出现「长按贯穿！」toast，且分数比起手前多 600。
 */

import { assert, launchBrowser, openApp, readHud, readPhase, shot } from './lib/harness.mjs';

/** 等一条 toast 出现（按文本包含匹配，返回记录或 null）。 */
async function waitToast(page, keyword, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await page.evaluate(
      (kw) => globalThis.__toasts.find((t) => t.text.includes(kw)) ?? null,
      keyword,
    );
    if (found) return found;
    await page.waitForTimeout(50);
  }
  return null;
}

/** 当前 toast 记录条数。 */
function toastCount(page) {
  return page.evaluate(() => globalThis.__toasts.length);
}

const browser = await launchBrowser();
const { page, pageErrors } = await openApp(browser);

try {
  await page.locator('#startScreen h2').click();
  await page.waitForTimeout(300);
  assert((await readPhase(page)) === 'running', '已进入游戏（1 星）');

  // ── 等长按怪刷新 ─────────────────────────────────────────
  console.log('── 等长按怪刷新（28% 概率，可能要等十几秒）──');
  const spawn = await waitToast(page, '长按敌人', 90_000);
  assert(spawn !== null, '长按怪刷新了（toast：长按敌人…）');
  console.log(`   长按怪出现：${spawn.text}`);

  // ── 起手：上下轨轮流按住，直到出现「长按中」 ─────────────
  console.log('── 起手（按住不放）──');
  //
  // **为什么不能「按住一会儿就松手」**：起手成功后松键 = 规则层判长按失败，
  // 怪直接自逃（`failLong` → `escaped: true`），这一局就废了。
  // 所以每次尝试都**先按住再判断**：起手了就继续保持，没起手才松键换轨。
  //
  // 每次尝试：按住 → 最多观察 140ms（起手成功会出现 toast「长按中…」）→
  // 再留 60ms 余量（toast 观察器是微任务，滞后 < 5ms）→ 仍没起手才松键。
  const ATTEMPT_MS = 140;
  const GRACE_MS = 60;
  const deadline = Date.now() + 25_000;
  let heldKey = null;
  let scoreBeforeHold = null;

  outer: while (Date.now() < deadline) {
    for (const key of ['ArrowUp', 'ArrowDown']) {
      const mark = await toastCount(page);
      await page.keyboard.down(key);

      let started = false;
      const watchUntil = Date.now() + ATTEMPT_MS;
      while (Date.now() < watchUntil) {
        await page.waitForTimeout(10);
        const hit = await page.evaluate(
          (from) => globalThis.__toasts.slice(from).find((t) => t.text.includes('长按中')) ?? null,
          mark,
        );
        if (hit) {
          started = true;
          break;
        }
      }
      if (!started) {
        // 余量：确认「起手」这条 toast 确实没被漏看，再决定松不松手
        await page.waitForTimeout(GRACE_MS);
        const late = await page.evaluate(
          (from) => globalThis.__toasts.slice(from).find((t) => t.text.includes('长按中')) ?? null,
          mark,
        );
        started = late !== null;
      }

      if (started) {
        heldKey = key;
        scoreBeforeHold = (await readHud(page)).score;
        console.log(`   起手成功（${key} 保持按住）`);
        break outer;
      }
      await page.keyboard.up(key);
    }
    if ((await readPhase(page)) === 'over') {
      throw new Error('游戏在长按怪出现前就结算了');
    }
  }
  assert(heldKey !== null, '用键盘起手成功（toast：长按中… 保持 3 秒）');
  await shot(page, 'hold-1-holding.png');

  // ── 保持 3 秒，等「长按贯穿！」 ─────────────────────────
  console.log('── 保持按住 3 秒 ──');
  const done = await waitToast(page, '长按贯穿', 12_000);
  assert(done !== null, '长按走完 3 秒（toast：长按贯穿！）');
  await page.keyboard.up(heldKey);
  await shot(page, 'hold-2-done.png');

  const after = await readHud(page);
  const gained = after.score - scoreBeforeHold;
  console.log(`   起手前分数 ${scoreBeforeHold} → 现在 ${after.score}（+${gained}）`);
  // 起手瞬间已经拿到头部 +200，所以「起手后」新增的是 1 秒 +200 与尾部 +200。
  assert(gained >= 400, `长按期间拿到 1 秒 + 尾部的分数（+${gained}）`);

  assert(
    pageErrors.length === 0,
    `无页面异常${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`,
  );
  console.log('\n✓ 键盘长按怪检查通过');
} catch (err) {
  console.error(`\n✗ 键盘长按怪检查失败：${String(err)}`);
  await shot(page, 'hold-failure.png').catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser.close();
}
