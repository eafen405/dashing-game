#!/usr/bin/env node
/**
 * FEVER 色散的**可读性回归**检查 —— 票 07。
 *
 * FEVER 期间全屏挂 `RGBSplitFilter`（红蓝通道左右错开）。
 * 判据：**判定区的描边不能被色散撕碎** —— 沿着判定区的圆周采样，
 * 看「每个角度上还能不能找到判定区描边的那根亮线」。
 *
 * | 指标 | 含义 |
 * |---|---|
 * | `outlineKeep` | 判定区圆周上「找得到描边」的比例（1 = 完全连续） |
 * | `maxFringe` | 判定区区域里红蓝通道的最大差（色散撕扯的幅度） |
 * | `fringeRatio` | 判定区区域里 `|R-B| > 30` 的像素占比（彩色边的面积） |
 *
 * 判据：FEVER 开启后 `outlineKeep` 不应明显下降（描边仍然是一条连续的线），
 * 且 `fringeRatio` 保持在低位（色散是氛围，不是把画面撕烂）。
 *
 * 用法：先 `npm run build`，然后
 *   node tests/e2e/fx-fever-readability.mjs
 */

import { join, resolve } from 'node:path';

import { assert, launchBrowser, openApp } from './lib/harness.mjs';

const OUT = process.env.E2E_SHOTS_DIR
  ? resolve(process.env.E2E_SHOTS_DIR)
  : resolve(process.cwd(), 'dist', 'e2e-shots', '07');

/** 在同一个 rAF 批次里读画布像素。 */
const READ_PIXELS = () =>
  new Promise((resolve) => {
    globalThis.requestAnimationFrame(() => {
      const canvas = globalThis.document.querySelector('.canvas-host canvas');
      if (!(canvas instanceof globalThis.HTMLCanvasElement)) {
        resolve(null);
        return;
      }
      const scratch = globalThis.document.createElement('canvas');
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      const sctx = scratch.getContext('2d');
      if (!sctx) {
        resolve(null);
        return;
      }
      sctx.drawImage(canvas, 0, 0);
      const { data } = sctx.getImageData(0, 0, scratch.width, scratch.height);
      resolve({ data: Array.from(data), width: scratch.width, height: scratch.height });
    });
  });

/**
 * 判定区描边连续性 + 色散幅度。
 *
 * @param layout 判定区几何（`hitX` / `laneY` / `zoneHalf`）。
 */
function measureZone(stats, layout) {
  const { data, width, height } = stats;
  const dpr = width / layout.width;
  const cx = layout.hitX * dpr;
  const cy = layout.laneY.top * dpr;
  const r = layout.zoneHalf * dpr;

  // ① 描边连续性：沿圆周取 360 个角度，每个角度找 ±4px 内的亮像素。
  let found = 0;
  const SAMPLES = 360;
  for (let i = 0; i < SAMPLES; i++) {
    const a = (i / SAMPLES) * Math.PI * 2;
    let hit = false;
    for (let rad = -4; rad <= 4 && !hit; rad++) {
      const px = Math.round(cx + Math.cos(a) * (r + rad));
      const py = Math.round(cy + Math.sin(a) * (r + rad));
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const idx = (py * width + px) * 4;
      // 判定区描边是霓虹色（很亮）；背景是深色。
      if (Math.max(data[idx], data[idx + 1], data[idx + 2]) >= 90) hit = true;
    }
    if (hit) found++;
  }

  // ② 色散幅度：判定区圆内的红蓝通道差。
  const r0 = Math.max(0, Math.round(cx - r));
  const r1 = Math.min(width - 1, Math.round(cx + r));
  const y0 = Math.max(0, Math.round(cy - r));
  const y1 = Math.min(height - 1, Math.round(cy + r));
  let maxFringe = 0;
  let fringeCount = 0;
  let total = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = r0; x <= r1; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] === 0) continue;
      total++;
      const fringe = Math.abs(data[idx] - data[idx + 2]);
      if (fringe > maxFringe) maxFringe = fringe;
      if (fringe > 30) fringeCount++;
    }
  }

  return {
    outlineKeep: found / SAMPLES,
    maxFringe,
    fringeRatio: total > 0 ? fringeCount / total : 0,
  };
}

const browser = await launchBrowser();

try {
  const { page } = await openApp(browser, {
    viewport: { width: 1280, height: 720 },
    query: '?renderer=pixi&debug',
  });
  await page.locator('#startScreen h2').click();
  await page.waitForTimeout(600);

  const layout = await page.evaluate(() => globalThis.__FX_DEBUG__.layout());

  // ── 基线：没有 FEVER ─────────────────────────────────────
  const before = measureZone(await page.evaluate(READ_PIXELS), layout);
  console.log('── 基线（无 FEVER）──');
  console.log(
    `  判定区描边连续性 ${(before.outlineKeep * 100).toFixed(1)}% · 最大红蓝差 ${before.maxFringe} · 彩色边像素占比 ${(before.fringeRatio * 100).toFixed(2)}%`,
  );

  // ── FEVER 期间 ─────────────────────────────────────────
  await page.evaluate(() => globalThis.__FX_DEBUG__.fever(true));
  await page.waitForTimeout(700); // 等色散爬到满强度（0.35 秒）
  const after = measureZone(await page.evaluate(READ_PIXELS), layout);
  console.log('── FEVER（色散满强度）──');
  console.log(
    `  判定区描边连续性 ${(after.outlineKeep * 100).toFixed(1)}% · 最大红蓝差 ${after.maxFringe} · 彩色边像素占比 ${(after.fringeRatio * 100).toFixed(2)}%`,
  );
  console.log(
    `  差异：描边连续性 ${((after.outlineKeep - before.outlineKeep) * 100).toFixed(1)} 个百分点 · 最大红蓝差 +${after.maxFringe - before.maxFringe}`,
  );

  await page.screenshot({ path: join(OUT, 'fever-readability.png') });
  console.log(`  📷 ${join(OUT, 'fever-readability.png')}`);

  assert(
    after.outlineKeep >= before.outlineKeep - 0.05,
    'FEVER 期间判定区描边仍然连续（色散没有把判定区撕碎）',
  );
  assert(after.maxFringe > before.maxFringe, '色散确实生效了（红蓝通道被拉开）');
  // 判定区本来就是青色的 → 基线的「红蓝差 > 30」占比本来就不低，
  // 所以看的是**增量**：色散额外撕开的面积必须有限（画面仍然可读）。
  const fringeUp = after.fringeRatio - before.fringeRatio;
  console.log(`  彩色边像素占比增量：+${(fringeUp * 100).toFixed(2)} 个百分点`);
  assert(
    fringeUp < 0.2,
    `色散只额外撕开了 ${(fringeUp * 100).toFixed(1)}% 的判定区像素（画面仍然可读）`,
  );

  console.log('\n✓ 可读性回归通过');
} catch (err) {
  console.error(`\n✗ 失败：${String(err)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
