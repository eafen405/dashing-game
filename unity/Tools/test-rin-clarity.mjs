import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readPng, writePng, enhance, upscale2 } from './image-pixels.mjs';
import { correspondence, fieldAt, encodeFlow } from './rin-motion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dir = path.join(root, 'TestResults/RinClarity');await fs.mkdir(dir, { recursive: true });
let checks = 0;const check = (value, message) => { assert.ok(value, message); checks++; };
const flat = { width: 12, height: 10, pixels: new Uint8Array(12 * 10 * 4) };
for (let i = 0; i < flat.pixels.length; i += 4) flat.pixels.set([80, 105, 145, 255], i);
await writePng(path.join(dir, 'codec-roundtrip.png'), flat);
check(Buffer.from((await readPng(path.join(dir, 'codec-roundtrip.png'))).pixels).equals(Buffer.from(flat.pixels)), 'RGBA PNG roundtrip preserves every byte');
const lifted = enhance(flat);check(Buffer.from(lifted.pixels).equals(Buffer.from(flat.pixels)), 'Flat colors do not acquire sharpening rings');
const enlarged = upscale2(flat);check(enlarged.width === 24 && enlarged.height === 20, 'Exact twofold dimensions');
check(enlarged.pixels.every((v, i) => Math.abs(v - flat.pixels[i % 4]) <= 1), 'Alpha-aware resampling preserves opaque flat colors');
const empty = { width: 8, height: 8, pixels: new Uint8Array(8 * 8 * 4) };empty.pixels.fill(255);for (let i = 3; i < empty.pixels.length; i += 4) empty.pixels[i] = 0;
check(upscale2(empty).pixels.every((v) => v === 0), 'Hidden white matte cannot leak into transparent resampling');
const a = { width: 48, height: 48, pixels: new Uint8Array(48 * 48 * 4) }, b = { width: 48, height: 48, pixels: new Uint8Array(48 * 48 * 4) };
for (let y = 12; y < 36; y++) for (let x = 12; x < 36; x++) {
  const color = [60 + (x * 13 + y * 7) % 160, 30 + (x * 3 + y * 11) % 160, 90, 255];a.pixels.set(color, (y * 48 + x) * 4);b.pixels.set(color, ((y - 3) * 48 + x + 6) * 4);
}
const f = correspondence(a, b), dx = fieldAt(f.forward, 24, 24, 0), dy = fieldAt(f.forward, 24, 24, 1);
check(Math.abs(dx - 6) < 1.5 && Math.abs(dy + 3) < 1.5, 'Forward correspondence recovers known (+6,-3) pixel translation');
const bx = fieldAt(f.backward, 30, 21, 0), by = fieldAt(f.backward, 30, 21, 1);
check(Math.abs(bx + 6) < 1.5 && Math.abs(by - 3) < 1.5, 'Backward correspondence inverts known translation');
const encoded = encodeFlow(f.forward);check(encoded.pixels.every((v, i) => i % 4 !== 3 || v === 255), 'Motion maps keep their data channels opaque');
const report = JSON.parse(await fs.readFile(path.join(dir, 'asset-report.json'), 'utf8'));
check(report.frames.length === 26, 'All 26 poses enhanced');check(report.pairs.length === 12, 'All breathing / riding transitions include the loop seam');
for (const frame of report.frames) {
  const bytes = await fs.readFile(path.join(root, 'Assets/Resources/Rin', `${frame.name}.png`));
  check(createHash('sha256').update(bytes).digest('hex') === frame.originalSha256, `Original is intact: ${frame.name}`);
  const image = await readPng(path.join(root, 'Assets/Resources/RinRefined', `${frame.name}.png`));
  check(image.width === frame.source[0] * 2 && image.height === frame.source[1] * 2, `Original framing preserved: ${frame.name}`);
}
for (const pair of report.pairs) {
  check(pair.reliablePoints > 500, `Useful matches: ${pair.prefix} ${pair.from}->${pair.to}`);
  // Smooth, nonfolding correspondence is preferable to a locally perfect fit
  // that tears the silhouette. Check both correspondence error and UV slopes.
  check(pair.afterError < pair.beforeError * .4, `Reliable matches reduce correspondence error: ${pair.prefix} ${pair.from}->${pair.to}`);
  for (const [from, to] of [[pair.from, pair.to], [pair.to, pair.from]]) {
    const map = await readPng(path.join(root, 'Assets/Resources/RinMotion', `${pair.prefix}-${from}-${to}.png`));
    const original = await readPng(path.join(root, 'Assets/Resources/Rin', `${pair.prefix}-${from}.png`));
    let maxSlope = 0;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
      if (x + dx >= map.width || y + dy >= map.height) continue;
      const i = (y * map.width + x) * 4, j = ((y + dy) * map.width + x + dx) * 4;
      const change = Math.hypot(map.pixels[i] - map.pixels[j], map.pixels[i + 1] - map.pixels[j + 1]) * 32 / 127;
      maxSlope = Math.max(maxSlope, change / (dx ? original.width / map.width : original.height / map.height));
    }
    check(maxSlope < .65, `Quantized UV correspondence stays below fold slope: ${pair.prefix} ${from}->${to}`);
  }
}
await fs.writeFile(path.join(dir, 'pipeline-checks.json'), JSON.stringify({ passed: true, checks, translation: { dx, dy, bx, by }, note: 'Correspondence error is a technical check, not a perceptual quality score.' }, null, 2));
console.log(`RIN_CLARITY_PIPELINE_PASS ${checks} checks`);
