/**
 * 端到端测试的公共脚手架 —— Playwright 驱动 `file://` 产物。
 *
 * 三个脚本共用这里的启动、断言、截图、HUD 读取与「出刀」原语：
 *   - `tests/e2e/flow-8-steps.mjs`     全流程 8 步
 *   - `tests/e2e/hud-stats.mjs`        HUD 重渲染量化
 *   - `tests/e2e/portrait-progress.mjs` 竖屏暂停 + 进度保留
 *   - `tests/e2e/compare-legacy.mjs`   与旧版并排对比
 *
 * **设计约束**：断言一律落在**可观察的 DOM 状态**上
 * （元素文本 / 类名 / `localStorage`），不依赖任何被测代码里的调试钩子 ——
 * 唯一的例外是 `window.__HUD_STATS__`（HUD 统计计数器），
 * 它统计的是「React 有没有被要求重渲染」，本身就是被验收的那件事。
 */

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { launchChromium } from '../../../scripts/browser.mjs';

/** 产物路径（单文件打包后的 `dist/index.html`）。 */
export const DIST = resolve(process.cwd(), 'dist', 'index.html');

/**
 * 截图目录。
 *
 * **默认写在仓库内**（`dist/e2e-shots/`）—— `dist/` 已被 gitignore，
 * 换机器不会因为写不进去而崩。
 * 需要把截图放到别处时用环境变量覆盖：`E2E_SHOTS_DIR=/some/path node tests/e2e/...`
 */
export const SHOTS = process.env.E2E_SHOTS_DIR
  ? resolve(process.env.E2E_SHOTS_DIR)
  : resolve(process.cwd(), 'dist', 'e2e-shots', '05');

/** 默认视口 —— 横屏桌面。 */
export const DESKTOP = { width: 1280, height: 720 };

/** 断言失败时抛错（脚本以非零退出码结束）。 */
export function assert(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
  console.log(`  ✓ ${message}`);
}

/** 截图（顺带保证目录存在）。 */
export async function shot(page, name) {
  mkdirSync(SHOTS, { recursive: true });
  const path = join(SHOTS, name);
  await page.screenshot({ path });
  console.log(`  📷 ${path}`);
  return path;
}

/** 启动浏览器（带回退链）。 */
export async function launchBrowser() {
  return launchChromium(chromium);
}

/**
 * 打开产物页面。
 *
 * 装了两个页面侧的观察器（**只观察，不干预被测代码**）：
 *   1. `screen.orientation.type` 随视口推导 —— 无头 Chromium 里它恒为
 *      `landscape-primary`，真实设备会跟随视口；旧实现是三重兜底的「或」关系，
 *      这里只补齐设备桩。
 *   2. `window.__toasts` —— 记录每一次 toast 出现（按 DOM 节点身份去重，
 *      所以连续两次相同文案也算两次）。
 *
 * @param browser 浏览器实例。
 * @param options 视口 / 查询串。
 */
export async function openApp(browser, options = {}) {
  const viewport = options.viewport ?? DESKTOP;
  const query = options.query ?? '';
  const page = await browser.newPage({ viewport });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.addInitScript(() => {
    // 设备桩：`screen.orientation.type` 随视口推导（真实设备就是这样）。
    Object.defineProperty(globalThis.screen.orientation, 'type', {
      configurable: true,
      get() {
        return globalThis.innerWidth > globalThis.innerHeight
          ? 'landscape-primary'
          : 'portrait-primary';
      },
    });

    // toast 观察器：每次 toast 节点换新（React 用递增的 key 重建节点）就记一条。
    //
    // **用 MutationObserver 而不是 rAF 轮询**：MutationObserver 的回调是**微任务**，
    // 节点一插入就能读到（rAF 轮询要等下一帧，滞后一整帧 ~16ms）。
    // 长按怪的起手判定必须又快又准 —— 起手后若被误判成「没起手」而松键，
    // 规则层会判长按失败，怪直接自逃（`failLong` → `escaped`），这一局就废了。
    globalThis.__toasts = [];
    const record = (text) => {
      globalThis.__toasts.push({ text, at: Math.round(globalThis.performance.now()) });
    };
    const installObserver = () => {
      const stage = globalThis.document.querySelector('.stage');
      if (!stage) {
        globalThis.requestAnimationFrame(installObserver);
        return;
      }
      const observer = new globalThis.MutationObserver((records) => {
        for (const rec of records) {
          for (const node of rec.addedNodes) {
            if (node.nodeType === 1 && node.classList && node.classList.contains('toast')) {
              record((node.textContent ?? '').trim());
            }
          }
        }
      });
      observer.observe(stage, { childList: true, subtree: true });
    };
    globalThis.requestAnimationFrame(installObserver);
  });

  await page.goto(pathToFileURL(DIST).href + query, { waitUntil: 'load' });
  await page.waitForSelector('.canvas-host canvas', { timeout: 20_000 });
  return { page, pageErrors };
}

/** 读取 HUD 数值（全部来自 DOM 文本）。 */
export function readHud(page) {
  return page.evaluate(() => {
    const text = (sel) => globalThis.document.querySelector(sel)?.textContent?.trim() ?? null;
    const num = (sel) => {
      const raw = text(sel);
      if (raw === null) return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    };
    const hpRaw = text('#hpText') ?? '';
    return {
      hpText: hpRaw,
      hp: hpRaw ? Number(hpRaw.split('/')[0].trim()) : null,
      maxHp: hpRaw ? Number(hpRaw.split('/')[1].trim()) : null,
      score: num('#scoreText'),
      combo: num('#comboText'),
      comboLabel: text('#comboLabel'),
      crit: text('#critText'),
      best: num('#bestText'),
    };
  });
}

/** 读 `localStorage["dualrail_best"]`（读不到就返回 null）。 */
export function readStoredBest(page) {
  return page.evaluate(() => {
    try {
      return globalThis.localStorage.getItem('dualrail_best');
    } catch {
      return null;
    }
  });
}

/** 舞台矩形。 */
export function stageBox(page) {
  return page.locator('.stage').boundingBox();
}

/**
 * 出刀 —— 点上半屏 / 下半屏。
 *
 * 点的位置取舞台的 1/4 与 3/4 处（对应「上半屏 → 上轨」「下半屏 → 下轨」）。
 */
export async function strike(page, lane) {
  const box = await stageBox(page);
  if (!box) throw new Error('拿不到舞台矩形');
  const x = box.x + box.width * 0.62;
  const y = lane === 'top' ? box.y + box.height * 0.25 : box.y + box.height * 0.75;
  await page.mouse.click(x, y);
}

/** 拿到 toast 记录条数（用来判断「有没有新的 toast」）。 */
export function toastCount(page) {
  return page.evaluate(() => globalThis.__toasts.length);
}

/** 读最后一条 toast 记录。 */
export function lastToast(page) {
  return page.evaluate(() => {
    const list = globalThis.__toasts;
    return list.length ? list[list.length - 1] : null;
  });
}

/** 等到出现新的 toast（文本匹配 `pattern`），返回该 toast 记录。 */
export async function waitForToast(page, pattern, timeout = 30_000) {
  const start = await toastCount(page);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const record = await page.evaluate(
      ({ from, source }) => {
        const re = new RegExp(source);
        return globalThis.__toasts.slice(from).find((t) => re.test(t.text));
      },
      { from: start, source: pattern },
    );
    if (record) return record;
    await page.waitForTimeout(20);
  }
  throw new Error(`等不到匹配 /${pattern}/ 的 toast`);
}

/** 页面是否已经结算（结算遮罩在）。 */
export function isGameOver(page) {
  return page.evaluate(() => globalThis.document.querySelector('#gameOver') !== null);
}

/** 页面当前处于哪个屏幕：`idle | running | paused | over`。 */
export function readPhase(page) {
  return page.evaluate(() => {
    if (globalThis.document.querySelector('#gameOver')) return 'over';
    if (globalThis.document.querySelector('#pause')) return 'paused';
    if (globalThis.document.querySelector('#startScreen')) return 'idle';
    return 'running';
  });
}
