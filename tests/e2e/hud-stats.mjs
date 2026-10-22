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
 * | `domMutations` | HUD 子树的 `MutationObserver` | React 提交产生的 DOM 变更 |
 * | `animatedMutations` | 同上，但按 `data-motion` 标记归类 | Motion 直接写 DOM（分数滚动 / FEVER 脉冲） |
 *
 * **判据**：`renders` 与 `domMutations` 必须**远小于** `frames`。
 * 若它们接近帧数，就说明 HUD 在 60fps 重渲染 —— 那就违反硬约束，必须修。
 * 分数滚动是事件驱动的动画（一次得分触发 0.45 秒），单列为 `animatedMutations`。
 *
 * 跑两个场景（各自重新开一局，保证测量窗口内规则层在跑）：
 *   - A「静置」：不操作 —— 分子应当只跟漏怪次数挂钩。
 *   - B「连续操作」：持续出刀 —— 分子随**事件**增长，而不是随帧增长。
 *
 * ── 判据的性质：结构，不是速度（票 18 / ADR-0004）────────────────
 *
 * 本脚本要证明的是**结构**：「HUD 不随帧重渲染」—— HUD 的更新由「值变化」驱动，
 * 不是由帧驱动。这条**与机器快慢无关**，所以判据必须写成**相对量**。
 *
 * 「跑多快」**不是 CI 的职责**（ADR-0004：CI 不做性能断言）。
 * 曾经那条 `publishes > 600` 名义上判「循环在跑」，实际是一条**帧率下限**
 * （600 次 / 30 秒 = 20fps）：CI 的 WebGL 走 SwiftShader 软件光栅，只有 ~13.7fps
 * （30 秒 411 帧），410 < 600 → 红；本机 2026-10-22 记的是 ~29fps（876 帧），
 * 同一天复跑却只有 ~17.5fps（524 帧）—— **连本机都在 600 这条线上晃**。
 * **判据绑在「跑测试那台机器有多快」上，本身就是 bug** ——
 * 修法是换成结构判据，而不是把 600 调低到 CI 也够得着
 * （那仍然是帧率断言，机器再慢一点又会红）。
 *
 * 现在用三条判据（见 `assertLoopAlive`）：
 *   1. `publishes > 0` —— 循环没冻；
 *   2. `publishes >= frames * 0.9` —— **每帧发布一次**（结构：两条 rAF 链同频）；
 *   3. `publishes >= 30` —— 「没冻」的保险丝（30 秒 ≈ 1fps，任何环境都够得着）。
 *
 * 场景 B 的**出刀次数**同理：判「这台机器能交付的上限」的相对比例，
 * 不钉绝对次数（钉死的次数也是帧率断言）。
 */

import { assert, launchBrowser, openApp, readPhase, shot, strike } from './lib/harness.mjs';

/** 每个场景的测量窗口（秒）。 */
const WINDOW_SECONDS = 30;

/** 场景 B 的出刀间隔（毫秒）—— 每隔这么久点一次。 */
const STRIKE_INTERVAL_MS = 120;

/**
 * 「每帧发布一次」的容差 —— **结构判据**，与机器速度无关。
 *
 * `publishes` 由游戏会话的 rAF 驱动（`GameSession.tickFrame` → `App.handleFrame`
 * → `hudStore.publish()`），`frames` 由本脚本装的另一条 rAF 驱动 ——
 * 两条链同频，所以比值应当 ≈ 1，与帧率高低无关。
 * 10% 的容差留给两次清零之间的零头（最多差一帧）。
 */
const PUBLISH_PER_FRAME_RATIO = 0.9;

/**
 * 「循环没冻」的保险丝 —— 30 秒窗口内至少 30 次发布（≈ 1fps）。
 *
 * **这个数要低到任何环境都够得着**（CI 的软件光栅约 13.7fps，本机实测 17–29fps）。
 * 它只负责「循环是不是冻住了」，**不判「跑多快」**。
 */
const MIN_PUBLISHES = 30;

/**
 * 「连续出刀」至少要打到**这台机器能交付的上限**的多少比例，才算真的在出刀。
 *
 * 上限 = `min(窗口时长 / 出刀间隔, 窗口内渲染的帧数)`：
 * 出刀一次要占用一次输入往返（点击 + 取舞台矩形），机器越慢能打出的次数越少，
 * 所以判据必须跟着「这台机器能交付多少」缩放，**不能钉一个绝对次数**
 * （钉死的次数就是又一条帧率断言 —— 票 18 拆掉的那条 `publishes > 600`）。
 *
 * 实测（30 秒窗口）：
 *   3200×1800 视口 ≈8.3fps → 252 帧 / 32 次（12.7%）· 4× 降速 ≈5.1fps → 157 帧 / 22 次（14%）
 *   满载 ≈16.8fps → 526 帧 / 57 次（23%）· 全速 ≈36fps → 1097 帧 / 97 次（39%）
 * 取 5% 作下限：最差的一档（12.7%）也还有 2.5 倍余量，CI（≈13.7fps）在 18% 上下。
 * 旧的 `clicks > 40` 在前两档（32 次 / 22 次）都会红 —— 那就是又一条帧率断言。
 */
const MIN_STRIKE_RATIO = 0.05;

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
  console.log(`   HUD DOM 变更次数  ${s.domMutations}（React 提交）`);
  console.log(`   动画直接写 DOM    ${s.animatedMutations}（分数滚动 / FEVER 脉冲，不经 React）`);
  console.log(`   出刀次数          ${clicks.count}`);
  console.log(`   结束时屏幕状态    ${phase}`);
  if (s.mutationLog.length) {
    console.log('   变更明细（前 8 条）:');
    for (const line of s.mutationLog.slice(0, 8)) console.log(`     · ${line}`);
  }

  return { ...result, elapsed, clicks: clicks.count, phase };
}

/**
 * 判「游戏循环在跑，且 HUD 每帧发布一次」。
 *
 * 三条判据都**与机器速度无关**（票 18 / ADR-0004：CI 不做性能断言）：
 *   - `publishes > 0` —— 循环没冻；
 *   - `publishes >= frames * 0.9` —— 每帧发布一次（**结构**）；
 *   - `publishes >= MIN_PUBLISHES` —— 「没冻」的保险丝（≈1fps，任何环境都够得着）。
 *
 * 这里**不判**「跑多快」—— 那既是被测代码的事，也不是 CI 的职责。
 *
 * @param label 场景名（进错误消息）。
 * @param m `measure()` 的返回值。
 */
function assertLoopAlive(label, m) {
  assert(m.stats.publishes > 0, `${label}：HUD 一次都没发布 —— 游戏循环冻住了`);
  assert(
    m.stats.publishes >= MIN_PUBLISHES,
    `${label}：${WINDOW_SECONDS} 秒只 publish 了 ${m.stats.publishes} 次（低于「没冻」保险丝 ${MIN_PUBLISHES} 次 ≈ 1fps）`,
  );
  assert(
    m.stats.publishes >= m.frames * PUBLISH_PER_FRAME_RATIO,
    `${label}：publish ${m.stats.publishes} 次 « 帧数 ${m.frames} 的 ${PUBLISH_PER_FRAME_RATIO * 100}% —— HUD 应每帧发布一次`,
  );
}

try {
  // ── 场景 A：静置 30 秒 ───────────────────────────────────
  const a = await measure('A · 静置 30 秒（不操作）', null);
  assertLoopAlive('静置 30 秒', a);
  assert(
    a.stats.domMutations < a.frames * 0.05,
    `静置时 HUD DOM 变更 ${a.stats.domMutations} 次 « 帧数 ${a.frames} 的 5%`,
  );
  assert(
    a.stats.renders < a.frames * 0.05,
    `静置时 HUD 内容渲染 ${a.stats.renders} 次 « 帧数 ${a.frames} 的 5%`,
  );

  // ── 场景 B：连续操作 30 秒 ───────────────────────────────
  const b = await measure('B · 连续出刀 30 秒（每 ~120ms 一次）', STRIKE_INTERVAL_MS);
  // 「连续出刀」要真的在出刀：一次都没打成（出刀原语坏了）要红；
  // 打成了但远低于这台机器能交付的上限（循环悄悄停了）也要红。
  // **判据是相对量** —— 上限随机器速度缩放，慢机器不会平白变红。
  const strikeCeiling = Math.min((b.elapsed * 1000) / STRIKE_INTERVAL_MS, b.frames);
  assert(b.clicks > 0, `连续出刀 ${b.clicks} 次（要 > 0：出刀原语坏了就红）`);
  assert(
    b.clicks >= strikeCeiling * MIN_STRIKE_RATIO,
    `连续出刀 ${b.clicks} 次 ≥ 本机上限 ${strikeCeiling.toFixed(0)} 次（时长/间隔 与 帧数 取小）的 ${MIN_STRIKE_RATIO * 100}%`,
  );
  assertLoopAlive('连续出刀 30 秒', b);
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
  assert(
    b.stats.animatedMutations > 0,
    `分数滚动确实在直接写 DOM（动画写 ${b.stats.animatedMutations} 次，不计入重渲染）`,
  );

  // ── 汇总 ─────────────────────────────────────────────────
  const pct = (n, d) => ((n / d) * 100).toFixed(2);
  console.log('\n── 汇总 ──');
  console.log(
    `   帧率参考（**观察值，不是判据**）：静置 ${(a.frames / a.elapsed).toFixed(1)} FPS / 操作 ${(b.frames / b.elapsed).toFixed(1)} FPS —— ADR-0004：CI 不做性能断言`,
  );
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
