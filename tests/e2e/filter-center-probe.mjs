#!/usr/bin/env node
/**
 * `ShockwaveFilter` 的**中心坐标语义**实测校准 —— 票 07。
 *
 * ## 为什么必须实测
 *
 * `pixi-filters@6.1.5` 的 `ShockwaveFilter.d.ts` 注释说中心是
 * 「normalized screen coords」（0~1），但着色器
 * （`lib/shockwave/shockwave.mjs`）算的是：
 *
 * ```glsl
 * vec2 dir = uv - uOffset / gfu.uInputSize.xy;
 * ```
 *
 * `uInputSize` 是**像素**，所以 `uOffset` 也应该是**像素** —— `.d.ts` 的注释与实现冲突。
 * 注释与实现冲突时不能靠「读代码猜」，这里用画面实测。
 *
 * ## 怎么测（差分重心法）
 *
 * 1. 场景里撒一圈**静止**的亮环（寿命 60 秒）当高对比参照物。
 * 2. 读一帧画布像素（基线）。
 * 3. 在**位置 A** 触发一次暴击（表现层据此把冲击波中心设成 A）→ 读一帧 → 差值图 D_A。
 * 4. 在**位置 B** 触发 → 读一帧 → 差值图 D_B。
 * 5. 比较两个差值图的**重心差**：
 *
 * | 语义 | A=(0,0)、B=(640,332) 时的重心差 |
 * |---|---|
 * | **像素** | ≈ (640, 332) —— 两个波真的落在两个位置 |
 * | 归一化 | ≈ (0, 0) —— 两个波都跑到左上角去了（0.5/1280 ≈ 0） |
 *
 * 注意：差值图的绝对重心**不等于**波心（位移量随离波心距离变大，
 * 画面角落的差更大，会把重心拽偏）—— 所以这里比较的是**两个重心之差**，
 * 那个偏置在两次测量里基本抵消。
 *
 * 用法：先 `npm run build`，然后 `node tests/e2e/filter-center-probe.mjs`。
 */

import { join, resolve } from 'node:path';

import { assert, launchBrowser, openApp } from './lib/harness.mjs';

const OUT = process.env.E2E_SHOTS_DIR
  ? resolve(process.env.E2E_SHOTS_DIR)
  : resolve(process.cwd(), 'dist', 'e2e-shots', '07');

/** 读画布像素（同一个 rAF 批次）。 */
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

/** 逐像素差的重心（按差值大小加权）。 */
function diffCentroid(a, b) {
  if (!a || !b) return null;
  const { data: da, width } = a;
  const db = b.data;
  let sum = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d =
      Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    if (d < 12) continue;
    const p = i / 4;
    const x = p % width;
    const y = Math.floor(p / width);
    sum += d;
    sx += x * d;
    sy += y * d;
  }
  if (sum === 0) return null;
  return { x: sx / sum, y: sy / sum, weight: sum };
}

const browser = await launchBrowser();

try {
  const { page } = await openApp(browser, {
    viewport: { width: 1280, height: 720 },
    query: '?debug',
  });
  await page.locator('#startScreen h2').click();
  await page.addStyleTag({ content: '.overlay{display:none !important}' });
  await page.waitForTimeout(600);

  const dpr = await page.evaluate(() => {
    const c = globalThis.document.querySelector('.canvas-host canvas');
    return c.width / c.clientWidth;
  });

  // 静止参照物：一圈寿命 60 秒的亮环（前后两帧完全一样 → 差值图只剩冲击波）。
  await page.evaluate(() => {
    const spots = [
      [200, 120, 40],
      [200, 120, 70],
      [320, 300, 50],
      [480, 150, 60],
      [560, 420, 45],
      [700, 220, 55],
      [820, 380, 50],
      [640, 120, 65],
      [1100, 150, 50],
      [1150, 500, 60],
      [400, 560, 50],
      [900, 600, 45],
    ];
    globalThis.__FX_DEBUG__.apply(
      spots.map(([x, y, r]) => ({
        type: 'ring',
        x,
        y,
        life: 60,
        r0: r,
        r1: r + 2,
        color: '#ffd24a',
      })),
    );
  });
  await page.waitForTimeout(300);

  const trigger = async (x, y) => {
    await page.evaluate(
      (t) => {
        globalThis.__FX_DEBUG__.apply([
          { type: 'burst', x: t.x, y: t.y, color: '#ffd24a', count: 36, power: 1.5 },
        ]);
      },
      { x, y },
    );
    return page.evaluate(READ_PIXELS);
  };

  const A = { x: 0, y: 0 };
  const B = { x: 640, y: 332 };

  const base = await page.evaluate(READ_PIXELS);
  const frameA = await trigger(A.x, A.y);
  const frameB = await trigger(B.x, B.y);
  await page.screenshot({ path: join(OUT, 'shockwave-center-probe.png') });

  const cA = diffCentroid(base, frameA);
  const cB = diffCentroid(base, frameB);
  assert(cA && cB, '两次触发都造成了可见的位移（差值图非空）');

  // 判据：**两张差值图之间**的差异度。
  //   像素语义   → 两个波落在两个地方 → D_A 与 D_B 完全不同（比值 ≈ 1）
  //   归一化语义 → 两个波都跑到左上角 → D_A ≈ D_B（比值 ≈ 0）
  let abSum = 0;
  let aSum = 0;
  for (let i = 0; i < frameA.data.length; i += 4) {
    abSum +=
      Math.abs(frameA.data[i] - frameB.data[i]) +
      Math.abs(frameA.data[i + 1] - frameB.data[i + 1]) +
      Math.abs(frameA.data[i + 2] - frameB.data[i + 2]);
    aSum +=
      Math.abs(frameA.data[i] - base.data[i]) +
      Math.abs(frameA.data[i + 1] - base.data[i + 1]) +
      Math.abs(frameA.data[i + 2] - base.data[i + 2]);
  }
  const ratio = aSum > 0 ? abSum / aSum : 0;

  console.log('── ShockwaveFilter 中心语义实测（两个中心产生的位移场差异度）──');
  console.log(`  A = (${A.x}, ${A.y})   B = (${B.x}, ${B.y})（CSS 像素）`);
  console.log(`  |D_A - D_B| / |D_A - 基线| = ${ratio.toFixed(3)}`);
  console.log('  像素语义 → 两个波在两个地方 → 比值 ≈ 1');
  console.log('  归一化语义 → 两个波都在左上角 → 比值 ≈ 0');
  console.log(
    `  差值重心：A=(${(cA.x / dpr).toFixed(0)}, ${(cA.y / dpr).toFixed(0)})  B=(${(cB.x / dpr).toFixed(0)}, ${(cB.y / dpr).toFixed(0)})`,
  );
  console.log(`  📷 ${join(OUT, 'shockwave-center-probe.png')}`);

  assert(
    ratio > 0.5,
    `两个中心产生了**明显不同**的位移场（比值 ${ratio.toFixed(3)} > 0.5）—— 中心按**像素**解释，.d.ts 的「normalized」注释是错的`,
  );
  console.log('\n✓ 中心语义 = 像素（着色器为准）');
} catch (err) {
  console.error(`\n✗ 失败：${String(err)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
