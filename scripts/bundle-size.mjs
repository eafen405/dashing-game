import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';

// Keep the original code budget; embedded original frames have a separate cap.
export const BUNDLE_BUDGET = {
  codeBytes: 1200 * 1024,
  codeGzipBytes: 380 * 1024,
  imageBytes: 1200 * 1024,
  imageGzipBytes: 1000 * 1024,
};

export function measureBundle(html) {
  const images = [...html.matchAll(/data:image\/[^;"']+;base64,[A-Za-z0-9+/=]+/g)];
  const imageData = images.map((match) => match[0]).join('\n');
  const code = html.replace(/data:image\/[^;"']+;base64,[A-Za-z0-9+/=]+/g, 'data:image/inline');
  return {
    htmlBytes: Buffer.byteLength(html),
    gzipBytes: gzipSync(html).length,
    inlineImages: images.length,
    codeBytes: Buffer.byteLength(code),
    codeGzipBytes: gzipSync(code).length,
    imageBytes: Buffer.byteLength(imageData),
    imageGzipBytes: gzipSync(imageData).length,
  };
}

export function bundleWarnings(size) {
  const warnings = [];
  for (const [key, label] of [
    ['codeBytes', '代码 / 样式'],
    ['codeGzipBytes', '代码 / 样式 gzip'],
    ['imageBytes', '内联原画'],
    ['imageGzipBytes', '内联原画 gzip'],
  ]) {
    if (size[key] > BUNDLE_BUDGET[key]) {
      warnings.push(
        `${label} ${(size[key] / 1024).toFixed(1)} KB 超过预算 ${BUNDLE_BUDGET[key] / 1024} KB`,
      );
    }
  }
  return warnings;
}
