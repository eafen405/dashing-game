/**
 * 端到端：HUD 重渲染的量化证据。
 *
 * 跑法（先 build）：
 *   npm run build
 *   node tests/e2e/hud-stats.mjs
 *
 * **要证明的事**（票 05 的硬验收项）：
 * > HUD 不许 60fps 重渲染 —— 血量条 / 分数的更新频率由「值变化」驱动，不是由帧驱动。
 *
 * **怎么测**（数字全部来自页面里的真实计数器，不是估算）：
 *
 * | 计数 | 来源 | 含义 |
 * | --- | --- | --- |
 * | `frames` | 页面里的 rAF 计数器 | 这段时间渲染了多少帧 |
 * | `publishes` | `hudStore.publish()` 调用次数 | 应用层每帧发布一次 HUD 快照 |
 * | `notifications` | `hudStore` 通知订阅者的次数 | **值真的变了**才 +1（React 被要求更新 HUD 的次数） |
 * | `renders` | `HudView` 提交次数 | HUD **产出 DOM 变化**的次数（主指标） |
 * | `shellRenders` | 外层 `Hud` 提交次数 | 被父组件事件带着重跑，但不产出 DOM 变化 |
 * | `domMutations` | HUD 子树的 `MutationObserver` | HUD 的 DOM 真正变了几处 |
 *
 * **判据**：`renders` 与 `domMutations` 必须**远小于** `frames`。
 * 若它们接近帧数，就说明 HUD 在 60fps 重渲染 —— 那就违反硬约束，必须修。
 *
 * 跑两个场景（各自重新开一局，保证测量窗口内规则层在跑）：
 *   - A「静置」：不操作 —— 分子应当只跟漏怪次数挂钩。
 *   - B「连续操作」：持续出刀 —— 分子随**事件**增长，而不是随帧增长。
 */

import { assert, launchBrowser, openApp, readPhase, shot, strike } from './lib/harness.mjs';

/** 每个场景的测量窗口（秒）。 */
const WINDOW_SECONDS = 30;

const browser = await launchBrowser();
const { page, pageErrors } = await openApp(browser);

/** 装一次性的 rAF 帧计数器（后续只清零，不重复安装 —— 否则会数重）。 */
async function installFrameCounter() {
  await page.evaluate(() => {
    if (!globalThis.__frameLoop) {
      globalThis.__frames = 0;
      globalThis.__frameLoop = () => {
        globalThis.__frames += 1;
        globalThis.requestAnimationFrame(globalThis.__frameLoop);
      };
      globalThis.requestAnimationFrame(globalThis.__frameLoop);
    }
    globalThis.__frames = 0;
  });
}

/** 重新开一局（结算后点「再来一局」，否则刷新页面）。 */
async function startFreshGame() {
  if ((await readPhase(page)) === 'over') {
    await page.locator('#btnRestart').click();
  } else if ((await readPhase(page)) === 'idle') {
    await page.locator('#startScreen h2').click();
  } else {
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.canvas-host canvas', { timeout: 20_000 });
    await page.locator('#startScreen h2').click();
  }
  await page.waitForTimeout(300);
}

/**
 * 跑一个测量场景。
 *
 * @param label 场景名。
 * @param clickIntervalMs 出刀间隔；`null` 表示静置（不出刀）。
 */
async function measure(label, clickIntervalMs) {
  await startFreshGame();
  await installFrameCounter();
  await page.evaluate(() => globalThis.__HUD_STATS_RESET__());

  const started = Date.now();
  const clicks = { count: 0 };
  let stop = false;
  const player = (async () => {
    if (clickIntervalMs === null) return;
    let lane = 'top';
    while (!stop) {
      try {
        await strike(page, lane);
        clicks.count += 1;
        await page.waitForTimeout(clickIntervalMs);
      } catch {
        if (stop) return;
      }
      lane = lane === 'top' ? 'bottom' : 'top';
    }
  })();

  await page.waitForTimeout(WINDOW_SECONDS * 1000);
  stop = true;
  await player;

  const elapsed = (Date.now() - started) / 1000;
  const result = await page.evaluate(() => ({
    frames: globalThis.__frames,
    stats: { ...globalThis.__HUD_STATS__ },
  }));
  const s = result.stats;
  const phase = await readPhase(page);

  console.log(`\n── 场景 ${label} ──`);
  console.log(`   测量窗口          ${elapsed.toFixed(1)} 秒`);
  console.log(
    `   浏览器 rAF 帧数   ${result.frames}（≈ ${(result.frames / elapsed).toFixed(1)} FPS）`,
  );
  console.log(`   publish 调用次数  ${s.publishes}`);
  console.log(`   订阅者通知次数    ${s.notifications}`);
  console.log(`   HUD 内容渲染次数  ${s.renders}（产出 DOM 变化的一层）`);
  console.log(`   HUD 外壳渲染次数  ${s.shellRenders}（父组件事件带着重跑，不产出 DOM 变化）`);
  console.log(`   HUD DOM 变更次数  ${s.domMutations}`);
  console.log(`   出刀次数          ${clicks.count}`);
  console.log(`   结束时屏幕状态    ${phase}`);
  if (s.mutationLog.length) {
    console.log('   变更明细（前 8 条）:');
    for (const line of s.mutationLog.slice(0, 8)) console.log(`     · ${line}`);
  }

  return { ...result, elapsed, clicks: clicks.count, phase };
}

try {
  // ── 场景 A：静置 30 秒 ───────────────────────────────────
  const a = await measure('A · 静置 30 秒（不操作）', null);
  assert(a.stats.publishes > 1000, `静置 30 秒跑了 ${a.stats.publishes} 帧（确实在跑）`);
  assert(
    a.stats.domMutations < a.frames * 0.05,
    `静置时 HUD DOM 变更 ${a.stats.domMutations} 次 « 帧数 ${a.frames} 的 5%`,
  );
  assert(
    a.stats.renders < a.frames * 0.05,
    `静置时 HUD 内容渲染 ${a.stats.renders} 次 « 帧数 ${a.frames} 的 5%`,
  );

  // ── 场景 B：连续操作 30 秒 ───────────────────────────────
  const b = await measure('B · 连续出刀 30 秒（每 ~120ms 一次）', 120);
  assert(b.clicks > 100, `连续出刀 ${b.clicks} 次`);
  assert(
    b.stats.domMutations < b.frames * 0.2,
    `连续操作时 HUD DOM 变更 ${b.stats.domMutations} 次 « 帧数 ${b.frames} 的 20%`,
  );
  assert(
    b.stats.renders < b.frames * 0.2,
    `连续操作时 HUD 内容渲染 ${b.stats.renders} 次 « 帧数 ${b.frames} 的 20%`,
  );
  assert(
    b.stats.domMutations < b.clicks * 3,
    `HUD DOM 变更 ${b.stats.domMutations} 次 < 出刀次数 ${b.clicks} 的 3 倍（变更由「值变化」驱动，不是由帧驱动）`,
  );

  // ── 汇总 ─────────────────────────────────────────────────
  const pct = (n, d) => ((n / d) * 100).toFixed(2);
  console.log('\n── 汇总 ──');
  console.log(
    `   静置：${a.frames} 帧 / HUD DOM 变更 ${a.stats.domMutations} 次（${pct(
      a.stats.domMutations,
      a.frames,
    )}%）/ 内容渲染 ${a.stats.renders} 次`,
  );
  console.log(
    `   操作：${b.frames} 帧 / HUD DOM 变更 ${b.stats.domMutations} 次（${pct(
      b.stats.domMutations,
      b.frames,
    )}%）/ 内容渲染 ${b.stats.renders} 次 / 出刀 ${b.clicks} 次`,
  );
  console.log(
    `   场景 B 的外壳渲染 ${b.stats.shellRenders} 次（父组件事件驱动），内容渲染只有 ${b.stats.renders} 次 —— DOM 协调被 memo 挡在「值变化」这一层`,
  );

  await shot(page, 'hud-stats-final.png');
  assert(
    pageErrors.length === 0,
    `无页面异常${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`,
  );
  console.log('\n✓ HUD 重渲染量化检查通过');
} catch (err) {
  console.error(`\n✗ HUD 统计检查失败：${String(err)}`);
  await shot(page, 'hud-stats-failure.png').catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser.close();
}
