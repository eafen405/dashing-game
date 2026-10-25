// Lossless format conversion using the browser already installed for web tests.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../node_modules/playwright/index.mjs';
import { launchChromium } from '../../scripts/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'src/battlefield/pixi/rin');
const dest = path.join(root, 'unity/Assets/Resources/Rin');
await fs.mkdir(dest, { recursive: true });
const browser = await launchChromium(chromium);
const page = await browser.newPage();
let count = 0;
try {
  for (const [prefix, n, sub] of [['idle', 5, ''], ['atk', 12, ''], ['ride', 9, 'ride']]) {
    for (let i = 0; i < n; i++) {
      const file = path.join(source, sub, `${prefix}-${i}.webp`);
      const src = `data:image/webp;base64,${(await fs.readFile(file)).toString('base64')}`;
      const result = await page.evaluate(async (src) => {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        return { data: c.toDataURL('image/png').split(',')[1], w: img.width, h: img.height };
      }, src);
      await fs.writeFile(path.join(dest, `${prefix}-${i}.png`), Buffer.from(result.data, 'base64'));
      count++;
    }
  }
  console.log(`Converted ${count} Rin frames to ${dest}`);
} finally { await browser.close(); }
