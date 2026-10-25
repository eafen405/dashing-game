// Dependency-free, 8-bit RGBA PNG I/O for reproducible offline sprite processing.
import fs from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const paeth = (a, b, c) => {
  const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c);
  return x <= y && x <= z ? a : y <= z ? b : c;
};
export async function readPng(file) {
  const png = await fs.readFile(file), chunks = [];
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Not PNG: ${file}`);
  let width, height;
  for (let p = 8; p < png.length;) {
    const n = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8), data = png.subarray(p + 8, p + 8 + n);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error(`Expected noninterlaced RGBA8: ${file}`);
    }
    if (type === 'IDAT') chunks.push(data);
    p += n + 12;
  }
  const bytes = inflateSync(Buffer.concat(chunks)), pixels = new Uint8Array(width * height * 4), stride = width * 4;
  if (bytes.length !== (stride + 1) * height) throw new Error(`Invalid scanline size: ${file}`);
  for (let y = 0; y < height; y++) {
    const filter = bytes[y * (stride + 1)];
    if (filter > 4) throw new Error(`Unsupported PNG filter: ${filter}`);
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= 4 ? pixels[i - 4] : 0, b = y ? pixels[i - stride] : 0, c = y && x >= 4 ? pixels[i - stride - 4] : 0;
      pixels[i] = bytes[y * (stride + 1) + x + 1] + (filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : 0);
    }
  }
  return { width, height, pixels };
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const chunk = (type, data) => {
  const bytes = Buffer.alloc(data.length + 12); bytes.writeUInt32BE(data.length); bytes.write(type, 4); data.copy(bytes, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < bytes.length - 4; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, bytes.length - 4); return bytes;
};
export async function writePng(file, { width, height, pixels }) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const bytes = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    bytes[y * (width * 4 + 1)] = 1;
    for (let x = 0; x < width * 4; x++) {
      const i = y * width * 4 + x; bytes[y * (width * 4 + 1) + x + 1] = (pixels[i] - (x >= 4 ? pixels[i - 4] : 0)) & 255;
    }
  }
  await fs.writeFile(file, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(bytes, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
export function sample(image, x, y, channel) {
  x = clamp(x, 0, image.width - 1); y = clamp(y, 0, image.height - 1);
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, nx = Math.min(ix + 1, image.width - 1), ny = Math.min(iy + 1, image.height - 1), d = image.pixels;
  return (d[(iy * image.width + ix) * 4 + channel] * (1 - fx) + d[(iy * image.width + nx) * 4 + channel] * fx) * (1 - fy) +
    (d[(ny * image.width + ix) * 4 + channel] * (1 - fx) + d[(ny * image.width + nx) * 4 + channel] * fx) * fy;
}
export function enhance(image) {
  const { width, height, pixels } = image, cleaned = new Uint8Array(pixels), luma = (i) => .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = (y * width + x) * 4, a = pixels[i + 3] / 255;
    if (a < .015) continue;
    let weight = 0, blurred = 0, opaque = 0, red = 0, green = 0, blue = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = ((y + dy) * width + x + dx) * 4, w = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1) * pixels[j + 3] / 255;
      blurred += luma(j) * w; weight += w;
      if (pixels[j + 3] > 240) { opaque++; red += pixels[j]; green += pixels[j + 1]; blue += pixels[j + 2]; }
    }
    // A bounded luminance-only detail lift keeps hue / face design consistent.
    let detail = luma(i) - blurred / Math.max(.001, weight);
    detail = Math.abs(detail) < 1.5 ? 0 : clamp(detail * .27, -8, 8);
    for (let c = 0; c < 3; c++) cleaned[i + c] = clamp(pixels[i + c] + detail, 0, 255);
    if (a < .9 && opaque) {
      const inside = [red / opaque, green / opaque, blue / opaque];
      const fringe = Math.min(...inside.map((v, c) => pixels[i + c] - v));
      // Only remove bright matte contamination on semitransparent cutout pixels.
      if (fringe > 16) for (let c = 0; c < 3; c++) cleaned[i + c] = clamp(cleaned[i + c] + (inside[c] - cleaned[i + c]) * (1 - a) * .6, 0, 255);
    }
  }
  return { width, height, pixels: cleaned };
}
const sinc = (x) => Math.abs(x) < 1e-7 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
const lanczos = (x) => Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0;
export function upscale2(image) {
  const { width, height, pixels } = image, outW = width * 2, outH = height * 2;
  const tmp = new Float32Array(outW * height * 4), output = new Uint8Array(outW * outH * 4);
  const weights = (length) => Array.from({ length: length * 2 }, (_, i) => {
    const center = (i + .5) / 2 - .5, start = Math.ceil(center - 3), list = []; let total = 0;
    for (let k = 0; k < 6; k++) { const w = lanczos(center - start - k); list.push([clamp(start + k, 0, length - 1), w]); total += w; }
    return list.map(([p, w]) => [p, w / total]);
  });
  const wx = weights(width), wy = weights(height);
  for (let y = 0; y < height; y++) for (let x = 0; x < outW; x++) for (const [sx, w] of wx[x]) {
    const i = (y * width + sx) * 4, o = (y * outW + x) * 4, a = pixels[i + 3] / 255;
    for (let c = 0; c < 3; c++) tmp[o + c] += pixels[i + c] / 255 * a * w;
    tmp[o + 3] += a * w;
  }
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const v = [0, 0, 0, 0];
    for (const [sy, w] of wy[y]) for (let c = 0; c < 4; c++) v[c] += tmp[(sy * outW + x) * 4 + c] * w;
    const i = (y * outW + x) * 4, a = clamp(v[3], 0, 1); output[i + 3] = Math.round(a * 255);
    for (let c = 0; c < 3; c++) output[i + c] = a > .005 ? Math.round(clamp(v[c] / Math.max(v[3], .005), 0, 1) * 255) : 0;
  }
  return { width: outW, height: outH, pixels: output };
}
