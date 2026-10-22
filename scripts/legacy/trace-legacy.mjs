#!/usr/bin/env node
/**
 * 旧版 harness 驱动 —— 用 Playwright 跑 `legacy-harness-<mode>.html`，
 * 产出旧版轨迹（JSONL，每行一帧）。
 *
 * ```
 * node scripts/legacy/trace-legacy.mjs --mode A --seed 20240101 --diff 1 \
 *   --frames 7200 --out traces/legacy-A-20240101-d1.jsonl [--nodraw]
 * ```
 *
 * 关键约束（`scripts/legacy/legacy-patch-spec.md` §8.6）：
 * - viewport 必须在 `goto` **之前**设好（横屏，避免竖屏自动暂停 —— T26）。
 * - 每条轨迹用一个**全新 context**（`localStorage` 干净 —— T20）。
 * - **不用** `page.mouse.*` 注入输入（会触发 DOM 事件重复点击 —— T9）；
 *   事件由 harness 在页面内直接调 `pressLane` / `releaseHold`。
 * - harness 直接调 `startGame()`，不走 `beginFromTap()`（不碰 fullscreen —— T27）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchChromium } from '../browser.mjs';
import { FRAMES, VIEWPORT } from '../trace-spec.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 在 headless Chromium 里跑一条旧版轨迹。
 *
 * @param {{mode?: string, seed?: number, diff?: number, frames?: number, noDraw?: boolean, scriptMode?: 'active'|'idle'}} options
 * @returns {Promise<{trace: object[], step: object, rulesDraws: number}>}
 */
export async function runLegacyTrace(options = {}) {
  const mode = String(options.mode ?? 'A');
  const seed = Number(options.seed ?? 20240101);
  const diff = Number(options.diff ?? 1);
  const frames = Number(options.frames ?? FRAMES);
  const noDraw = options.noDraw === true;
  // 剧本模式：`idle` = 零输入（一个键都不按）→ 必然漏怪 → 走到 game over。
  const scriptMode = options.scriptMode === 'idle' ? 'idle' : 'active';

  const harnessPath = resolve(HERE, `legacy-harness-${mode}.html`);

  const browser = await launchChromium(chromium);
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    const url =
      `file://${harnessPath}?seed=${seed}&diff=${diff}` +
      `&fixedstep=1&w=${VIEWPORT.width}&h=${VIEWPORT.height}` +
      (noDraw ? '&nodraw=1' : '') +
      (scriptMode === 'idle' ? '&script=idle' : '');

    await page.goto(url);
    await page.waitForFunction(() => !!globalThis.window.__harness);
    await page.evaluate(() => globalThis.window.__harness.start());

    const result = await page.evaluate((n) => {
      const step = globalThis.window.__harness.stepFrames(n);
      return {
        step,
        trace: globalThis.window.__harness.trace(),
        rulesDraws: globalThis.window.__harness.rulesDraws(),
      };
    }, frames);
    return result;
  } finally {
    await browser.close();
  }
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      i++;
    }
  }
  return options;
}

// ── CLI ──────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('trace-legacy.mjs')) {
  const options = parseArgs(process.argv.slice(2));
  const mode = String(options.mode ?? 'A');
  const seed = Number(options.seed ?? 20240101);
  const diff = Number(options.diff ?? 1);
  const frames = Number(options.frames ?? FRAMES);
  const out = options.out ? String(options.out) : null;
  const noDraw = options.nodraw === true || options.nodraw === '1';

  const result = await runLegacyTrace({ mode, seed, diff, frames, noDraw });

  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, result.trace.map((f) => JSON.stringify(f)).join('\n') + '\n', 'utf8');
  }

  const last = result.trace[result.trace.length - 1];
  console.log(
    `[trace-legacy] mode=${mode} seed=${seed} diff=${diff} ` +
      `帧数=${result.trace.length} 步进=${result.step.stepped} ` +
      `结束状态=${result.step.state} 规则随机消费=${result.rulesDraws}` +
      (last
        ? ` hp=${last.hp} score=${last.score} combo=${last.combo} maxCombo=${last.maxCombo}`
        : ''),
  );
  if (out) console.log(`[trace-legacy] → ${out}`);
}
