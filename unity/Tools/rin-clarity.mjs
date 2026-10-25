import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readPng, writePng, enhance, upscale2, sample } from './image-pixels.mjs';
import { correspondence, encodeFlow, fieldAt } from './rin-motion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'Assets/Resources/Rin'), dest = path.join(root, 'Assets/Resources/RinRefined'), motion = path.join(root, 'Assets/Resources/RinMotion'), results = path.join(root, 'TestResults/RinClarity');
for (const dir of [dest, motion, results]) await fs.mkdir(dir, { recursive: true });
const images = new Map(), report = { method: 'deterministic local enhancement + offline bidirectional patch correspondence; no AI redrawing', frames: [], pairs: [] };
for (const [prefix, count] of [['idle', 5], ['atk', 12], ['ride', 9]]) for (let i = 0; i < count; i++) {
  const name = `${prefix}-${i}`, image = await readPng(path.join(source, `${name}.png`)); images.set(name, image);
  const originalBytes = await fs.readFile(path.join(source, `${name}.png`));
  if (!process.argv.includes('--motion-only')) {
    const output = upscale2(enhance(image)); await writePng(path.join(dest, `${name}.png`), output);
    console.log(`refined ${name}: ${image.width}x${image.height} -> ${output.width}x${output.height}`);
  }
  const refined = await readPng(path.join(dest, `${name}.png`));
  if (refined.width !== image.width * 2 || refined.height !== image.height * 2) throw new Error(`Refined dimensions differ: ${name}`);
  report.frames.push({ name, source: [image.width, image.height], output: [refined.width, refined.height], originalSha256: createHash('sha256').update(originalBytes).digest('hex') });
}
const pairs = [['idle', 0, 1], ['idle', 1, 2], ['idle', 2, 3], ...Array.from({ length: 9 }, (_, i) => ['ride', i, (i + 1) % 9])];
for (const [prefix, from, to] of pairs) {
  if (process.argv.includes('--preview') && !(prefix === 'ride' && from === 3)) continue;
  const a = images.get(`${prefix}-${from}`), b = images.get(`${prefix}-${to}`), flow = correspondence(a, b);
  await writePng(path.join(motion, `${prefix}-${from}-${to}.png`), encodeFlow(flow.forward));
  await writePng(path.join(motion, `${prefix}-${to}-${from}.png`), encodeFlow(flow.backward));
  let before = 0, after = 0, count = 0, reliable = 0;
  for (let y = 0; y < a.height; y += 2) for (let x = 0; x < a.width; x += 2) {
    if (sample(a, x, y, 3) < 230) continue;
    const dx = fieldAt(flow.forward, x, y, 0), dy = fieldAt(flow.forward, x, y, 1), confidence = fieldAt(flow.forward, x, y, 2);
    if (confidence < .55) continue; reliable++;
    for (let c = 0; c < 3; c++) { const v = sample(a, x, y, c); before += (v - sample(b, x, y, c)) ** 2; after += (v - sample(b, x + dx, y + dy, c)) ** 2; count++; }
  }
  const metrics = { prefix, from, to, reliablePoints: reliable, beforeError: before / Math.max(1, count), afterError: after / Math.max(1, count) };
  report.pairs.push(metrics); console.log(JSON.stringify(metrics));
  if (prefix === 'ride' && from === 3) {
    const width = a.width * 2, height = a.height, pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < a.width; x++) {
      const mix = .5, fa = [fieldAt(flow.forward, x, y, 0), fieldAt(flow.forward, x, y, 1)], fb = [fieldAt(flow.backward, x, y, 0), fieldAt(flow.backward, x, y, 1)];
      for (let half = 0; half < 2; half++) {
        const ax = x - (half ? fa[0] * mix : 0), ay = y - (half ? fa[1] * mix : 0), bx = x - (half ? fb[0] * (1 - mix) : 0), by = y - (half ? fb[1] * (1 - mix) : 0);
        const aa = sample(a, ax, ay, 3) / 255, ba = sample(b, bx, by, 3) / 255, alpha = (aa + ba) / 2, i = (y * width + x + half * a.width) * 4;
        pixels[i + 3] = Math.round(alpha * 255);
        for (let c = 0; c < 3; c++) pixels[i + c] = alpha > .001 ? Math.round((sample(a, ax, ay, c) * aa + sample(b, bx, by, c) * ba) / 2 / alpha) : 0;
      }
    }
    await writePng(path.join(results, 'motion-before-after.png'), { width, height, pixels });
  }
}
await fs.writeFile(path.join(results, 'asset-report.json'), JSON.stringify(report, null, 2));
console.log('RIN_CLARITY_ASSETS_PASS');
