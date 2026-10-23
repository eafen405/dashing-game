#!/usr/bin/env node
/**
 * 票 09 的**可复现验收图** —— 三档特效 + 双生同破，2×2 拼图。
 *
 * 和 `fx-moments.mjs` 的区别：
 * - `fx-moments` 打**真实对局**，等 toast 出现再截图 —— 证明「玩家真能打到」，
 *   但时机不可控，截图里有没有冲击波/粒子看运气。
 * - 这里通过 `?debug` 的 `__FX_DEBUG__.apply()` **定点注入**效果帧，
 *   同一份参数每次跑出来一模一样，专门用来对照票 09 的四条验收项。
 *
 * 四格分别验证：
 * 1. 普攻只有接触点小环 + 木屑，没有冲击波；
 * 2. 暴击有金环 / 白热核 / 碎片 / 全屏冲击波，震动档位更高；
 * 3. FEVER 整屏暖金 + 包边 + 色散，判定区描边仍然连续（可读性另有
 *    `fx-fever-readability.mjs` 逐像素度量）；
 * 4. 双生同破两轨同时出粉色冲击环 + 冲击波 + 下砸。
 *
 * ## 无头直接跑（不需要 xvfb）
 *
 * `scripts/browser.mjs` 的 `CHROMIUM_ARGS` 带 `--enable-unsafe-swiftshader`，
 * Chromium 实际跑在 `--use-angle=swiftshader-webgl` 上 ——
 * **无头就拿得到 WebGL**，Pixi 不会回退 Canvas2D，bloom / 色散 / 冲击波
 * 全部在画面上，截图能当视觉验收。
 * （以前写的「无头拿不到 WebGL，必须 `HEADED=1 xvfb-run`」已经过期，见票 20。）
 *
 * 用法：先 `npm run build`，再 `node tests/e2e/fx-acceptance.mjs`
 * —— CI 里跑的是 `npm run test:visual`（把本脚本和另外几个特效脚本一起当门禁）。
 *
 * SwiftShader 是**软件光栅**，FPS 挂件只有 11–13 —— 那**不是**产品性能指标，
 * 不能当 60fps 证据（ADR-0004）。FPS 挂件不是产品 UI，截图前会被隐藏。
 * 真机 60fps 仍需用户实机确认（票 08/09 的共同遗留项）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { assert, captureShot, launchBrowser, openApp } from './lib/harness.mjs';

const OUT = process.env.E2E_SHOTS_DIR
  ? resolve(process.env.E2E_SHOTS_DIR)
  : resolve(process.cwd(), 'dist', 'e2e-shots', '09');

const browser = await launchBrowser();

try {
  mkdirSync(OUT, { recursive: true });
  const { page, pageErrors } = await openApp(browser, {
    viewport: { width: 1280, height: 720 },
    query: '?debug',
  });

  // FPS 挂件是调试 UI，不属于验收画面；软件渲染的 11–13 会被误读成产品帧率。
  await page.addStyleTag({ content: '.debug-stats{display:none!important}' });

  await page.locator('#startScreen h2').click();
  await page.waitForTimeout(700);

  const layout = await page.evaluate(() => globalThis.__FX_DEBUG__.layout());
  console.log(
    `  布局 ${Math.round(layout.width)}×${Math.round(layout.height)} · hitX ${layout.hitX.toFixed(1)} · 判定半径 ${layout.zoneHalf.toFixed(1)}`,
  );

  const shot = async (name) => {
    const path = join(OUT, `new-${name}.png`);
    await captureShot(page, path);
    console.log(`  📷 ${path}`);
    return path;
  };

  /** 注入一组表现层效果，等 80ms 让 bloom / 粒子进入稳定帧后截图。 */
  const inject = async (effects, name) => {
    await page.evaluate((list) => globalThis.__FX_DEBUG__.apply(list), effects);
    await page.waitForTimeout(80);
    return shot(name);
  };

  // ① 普攻：小环 + 橙色木屑，不触发冲击波。
  await inject(
    [
      {
        type: 'slash',
        x: layout.hitX,
        x0: layout.playerX,
        y: layout.laneY.bottom,
        life: 0.3,
        lane: 'bottom',
      },
      {
        type: 'burst',
        x: layout.hitX,
        y: layout.laneY.bottom,
        color: '#ff8a5c',
        count: 26,
        power: 1.25,
      },
      {
        type: 'burst',
        x: layout.hitX,
        y: layout.laneY.bottom,
        color: '#ffffff',
        count: 10,
        power: 0.9,
      },
      {
        type: 'ring',
        x: layout.hitX,
        y: layout.laneY.bottom,
        life: 0.42,
        r0: 26,
        r1: 86,
        color: '#ff8a5c',
      },
      { type: 'shake-add', amount: 5, cap: 17 },
      {
        type: 'floater',
        x: layout.hitX,
        y: layout.laneY.bottom - 70,
        text: '命中 +200',
        color: '#ffb37a',
      },
    ],
    'normal',
  );
  await page.waitForTimeout(500);

  // ② 暴击：金色大环 + 白热核 + 碎片 + 冲击波（`wave` 由 resolve 触发，这里手动给镜头）。
  await inject(
    [
      {
        type: 'slash',
        x: layout.hitX,
        x0: layout.playerX,
        y: layout.laneY.top,
        life: 0.3,
        lane: 'top',
      },
      {
        type: 'burst',
        x: layout.hitX,
        y: layout.laneY.top,
        color: '#bfe9ff',
        count: 36,
        power: 1.5,
      },
      {
        type: 'burst',
        x: layout.hitX,
        y: layout.laneY.top,
        color: '#ffffff',
        count: 16,
        power: 0.9,
      },
      {
        type: 'ring',
        x: layout.hitX,
        y: layout.laneY.top,
        life: 0.42,
        r0: 30,
        r1: 100,
        color: '#ffd24a',
      },
      { type: 'shake-add', amount: 11, cap: 17 },
      {
        type: 'floater',
        x: layout.hitX,
        y: layout.laneY.top - 70,
        text: '暴击 +300',
        color: '#ffd24a',
      },
    ],
    'crit',
  );
  await page.waitForTimeout(500);

  // ③ FEVER：等色散 / 暖金洗色爬到满强度。
  await page.evaluate(() => globalThis.__FX_DEBUG__.fever(true));
  await page.waitForTimeout(1300);
  await shot('fever');

  // ④ 双生同破：关掉 FEVER，让粉色读得干净。
  await page.evaluate(() => globalThis.__FX_DEBUG__.fever(false));
  await page.waitForTimeout(600);
  await inject(
    [
      {
        type: 'slash',
        x: layout.hitX,
        x0: layout.playerX,
        y: layout.laneY.top,
        life: 0.3,
        lane: 'top',
      },
      {
        type: 'slash',
        x: layout.hitX,
        x0: layout.playerX,
        y: layout.laneY.bottom,
        life: 0.3,
        lane: 'bottom',
      },
      {
        type: 'burst',
        x: layout.hitX,
        y: layout.laneY.top,
        color: '#ff5ecb',
        count: 34,
        power: 1.5,
      },
      {
        type: 'burst',
        x: layout.hitX,
        y: layout.laneY.bottom,
        color: '#ff5ecb',
        count: 34,
        power: 1.5,
      },
      {
        type: 'burst',
        x: layout.hitX,
        y: layout.laneY.top,
        color: '#ffffff',
        count: 12,
        power: 0.9,
      },
      {
        type: 'burst',
        x: layout.hitX,
        y: layout.laneY.bottom,
        color: '#ffffff',
        count: 12,
        power: 0.9,
      },
      {
        type: 'ring',
        x: layout.hitX,
        y: layout.laneY.top,
        life: 0.42,
        r0: 30,
        r1: 110,
        color: '#ff5ecb',
      },
      {
        type: 'ring',
        x: layout.hitX,
        y: layout.laneY.bottom,
        life: 0.42,
        r0: 30,
        r1: 110,
        color: '#ff5ecb',
      },
      { type: 'pair-smash' },
      { type: 'shake-set', amount: 16 },
      {
        type: 'floater',
        x: layout.hitX,
        y: layout.laneY.top - 80,
        text: '双生击破 +700',
        color: '#ff5ecb',
      },
    ],
    'twin',
  );

  // ── 2×2 拼图 ────────────────────────────────────────────
  const dataUrl = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#12141c;color:#eef3ff;font-family:system-ui,sans-serif}
  #sheet{width:1300px;padding:14px}
  h2{font-size:17px;margin-bottom:10px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  figure{background:#0b0d13;border:1px solid #2a2f3d;padding:6px}
  figcaption{font-size:12px;color:#8d9ab8;margin:4px 0 6px}
  img{width:100%;display:block}
  .note{font-size:11px;color:#7d89a5;margin-top:10px;line-height:1.5}
</style></head><body><div id="sheet">
  <h2>票 09 · 三档特效验收（新版，1280×720，?debug 稳定复现）</h2>
  <div class="grid">
    <figure><figcaption>① 普攻：接触点小环 + 橙色木屑，无冲击波，震动 5</figcaption><img src="${dataUrl(join(OUT, 'new-normal.png'))}"></figure>
    <figure><figcaption>② 暴击：金色大环 + 白热核 + 碎片 + 全屏冲击波，震动 11</figcaption><img src="${dataUrl(join(OUT, 'new-crit.png'))}"></figure>
    <figure><figcaption>③ FEVER：整屏暖金洗色 + 包边 + 周身火花 + 色散，判定区仍连续可读</figcaption><img src="${dataUrl(join(OUT, 'new-fever.png'))}"></figure>
    <figure><figcaption>④ 双生同破：两轨粉色冲击环 + 双轨木屑 + 冲击波 + 下砸，震动 16</figcaption><img src="${dataUrl(join(OUT, 'new-twin.png'))}"></figure>
  </div>
  <p class="note">判定区中心到角色的“拖影”已按实机手感改为木棒挥击残影 + 接触点余晖（不再有飞行刀光/剑气）。<br>
  截图机为无头 Chromium + SwiftShader 软件光栅（真实 WebGL 路径），FPS 挂件 11–13 不代表真机，故已隐藏；实机 60fps 仍需用户确认。</p>
</div></body></html>`;
  const htmlPath = join(OUT, 'acceptance-09.html');
  writeFileSync(htmlPath, html);
  const sheet = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  await sheet.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  const sheetPath = join(OUT, 'acceptance-09.png');
  await captureShot(sheet.locator('#sheet'), sheetPath);
  console.log(`  📷 ${sheetPath}`);

  assert(
    pageErrors.length === 0,
    `页面无异常${pageErrors.length ? '：' + pageErrors.join(' | ') : ''}`,
  );
  console.log(`\n✓ 四格验收图完成 → ${OUT}`);
} catch (err) {
  console.error(`\n✗ 失败：${String(err)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
