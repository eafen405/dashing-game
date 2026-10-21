#!/usr/bin/env node
/**
 * bloom 生效的**可验证判据** —— 票 07。
 *
 * 同一个**静态场景**，分别在 `?debug`（带 bloom）与 `?debug&nobloom=1`（不带 bloom）
 * 下截图，然后**逐像素统计两张 PNG**：
 *
 * | 指标 | 期望 | 含义 |
 * |---|---|---|
 * | 非透明像素占比 | 上升 | bloom 把辉光摊到更大的面积上 |
 * | 非透明像素平均亮度 | 上升 | bloom 叠加了模糊后的亮部 |
 * | 总亮度 | 上升 | 整幅画面的光总量 |
 *
 * ## 为什么测 PNG 而不是读 WebGL 画布
 *
 * `preserveDrawingBuffer: false` 时画布的绘制缓冲在合成后就被丢弃，
 * `drawImage(canvas)` 的读回不可靠。这里改成：
 * **用 Playwright 截真实画面 → 把 PNG 画进 2D 画布 → 逐像素统计**，
 * 量到的就是玩家真正看到的那张图。
 *
 * ## 场景要「静止」
 *
 * 两页各自跑一遍，游戏状态必然不同（怪的位置、掉血都不一样），
 * 差值图就分不清是 bloom 还是状态差异。所以：
 *
 * - **不开局**（停在开始界面）→ 没有怪、没有掉血、连击不动；
 * - 用 CSS 把遮罩藏掉（只影响 DOM 叠加层，不碰画布渲染）；
 * - 只在场上放一条**寿命 60 秒的亮环**（几乎不动）。
 *
 * 剩下的差异就只有 bloom（以及极少量位移的星点）。
 *
 * 用法：先 `npm run build`，然后
 *   E2E_SHOTS_DIR=... node tests/e2e/bloom-ab.mjs
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { assert, launchBrowser, openApp } from './lib/harness.mjs';

const OUT = process.env.E2E_SHOTS_DIR
  ? resolve(process.env.E2E_SHOTS_DIR)
  : resolve(process.cwd(), 'dist', 'e2e-shots', '07');

/** 逐像素统计：非透明像素占比 + 非透明像素的平均亮度 + 总亮度。 */
const PNG_STATS = (urls) =>
  new Promise((resolve) => {
    const load = (src) =>
      new Promise((res, rej) => {
        const img = new globalThis.Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error(`读不到图片：${src}`));
        img.src = src;
      });
    Promise.all(urls.map(load)).then((imgs) => {
      resolve(
        imgs.map((img) => {
          const scratch = globalThis.document.createElement('canvas');
          scratch.width = img.naturalWidth;
          scratch.height = img.naturalHeight;
          const sctx = scratch.getContext('2d');
          sctx.drawImage(img, 0, 0);
          const { data } = sctx.getImageData(0, 0, scratch.width, scratch.height);
          let opaque = 0;
          let lumSum = 0;
          let totalLum = 0;
          let lit = 0;
          for (let i = 0; i < data.length; i += 4) {
            const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            totalLum += lum;
            if (data[i + 3] > 0) {
              opaque += 1;
              lumSum += lum;
            }
            // 「被点亮的像素」：亮度过线的像素数 —— bloom 会把辉光摊到更远处，
            // 所以这个数会变大（比「非透明像素占比」更贴切：整幅截图的 alpha
            // 都被 DOM 背景填满了，那个指标在整页截图上没有意义）。
            if (lum > 60) lit += 1;
          }
          const total = data.length / 4;
          return {
            opaqueRatio: opaque / total,
            meanLum: opaque > 0 ? lumSum / opaque : 0,
            totalLum,
            litRatio: lit / total,
            width: scratch.width,
            height: scratch.height,
          };
        }),
      );
    });
  });

const browser = await launchBrowser();

try {
  mkdirSync(OUT, { recursive: true });

  /** 截一张「静止场景」的画面。 */
  async function capture(query, name) {
    const { page } = await openApp(browser, { viewport: { width: 1280, height: 720 }, query });
    // 只藏 DOM 遮罩，画布渲染一点没动。
    await page.addStyleTag({ content: '.overlay{display:none !important}' });
    await page.waitForTimeout(500);
    const layout = await page.evaluate(() => globalThis.__FX_DEBUG__.layout());
    // 一条寿命 60 秒的亮环 —— 几乎不动。
    await page.evaluate((ring) => {
      globalThis.__FX_DEBUG__.apply([
        {
          type: 'ring',
          x: ring.x,
          y: ring.y,
          life: ring.life,
          r0: ring.r0,
          r1: ring.r1,
          color: '#ffd24a',
        },
      ]);
    }, { x: layout.hitX, y: layout.laneY.top, life: 60, r0: 90, r1: 92 });
    await page.waitForTimeout(200);
    const path = join(OUT, `bloom-${name}.png`);
    await page.screenshot({ path });
    await page.close();
    return path;
  }

  const onPath = await capture('?renderer=pixi&debug', 'on');
  const offPath = await capture('?renderer=pixi&debug&nobloom=1', 'off');

  // 逐像素统计：把 PNG 以 data URL 喂给页面（data URL 不会污染画布，
  // 而 file:// 互相读会污染 → getImageData 直接抛 SecurityError）。
  const dataUrl = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
  const helper = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await helper.goto('about:blank');
  const stats = await helper.evaluate(PNG_STATS, [dataUrl(onPath), dataUrl(offPath)]);
  await helper.close();

  const on = stats[0];
  const off = stats[1];
  console.log('── bloom A/B（同一静止场景：一条寿命 60 秒的亮环）──');
  console.log(
    `  带 bloom   ：被点亮像素占比 ${(on.litRatio * 100).toFixed(3)}% · 平均亮度 ${on.meanLum.toFixed(2)} · 总亮度 ${on.totalLum.toFixed(0)}`,
  );
  console.log(
    `  不带 bloom ：被点亮像素占比 ${(off.litRatio * 100).toFixed(3)}% · 平均亮度 ${off.meanLum.toFixed(2)} · 总亮度 ${off.totalLum.toFixed(0)}`,
  );
  console.log(
    `  差异       ：被点亮像素占比 +${((on.litRatio - off.litRatio) * 100).toFixed(3)} 个百分点 · 平均亮度 +${((on.meanLum / off.meanLum - 1) * 100).toFixed(1)}% · 总亮度 +${((on.totalLum / off.totalLum - 1) * 100).toFixed(1)}%`,
  );
  console.log(`  📷 ${onPath}`);
  console.log(`  📷 ${offPath}`);

  assert(
    on.meanLum > off.meanLum,
    'bloom 让平均亮度上升（辉光真的加出来了）',
  );
  assert(
    on.litRatio > off.litRatio,
    'bloom 让被点亮的像素变多（辉光溢出到了更远处）',
  );
  console.log('\n✓ bloom 判据通过');
} catch (err) {
  console.error(`\n✗ 失败：${String(err)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
