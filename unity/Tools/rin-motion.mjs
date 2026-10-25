// Offline pyramidal block correspondence, not an ML model or runtime solver.
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function pyramid(image) {
  let w = image.width, h = image.height;
  let gray = new Float32Array(w * h), alpha = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const a = image.pixels[i * 4 + 3] / 255; alpha[i] = a;
    gray[i] = (.2126 * image.pixels[i * 4] + .7152 * image.pixels[i * 4 + 1] + .0722 * image.pixels[i * 4 + 2]) / 255 * a + .12 * a;
  }
  const levels = [{ w, h, gray, alpha }];
  for (let level = 1; level < 3; level++) {
    const nw = Math.ceil(w / 2), nh = Math.ceil(h / 2), ng = new Float32Array(nw * nh), na = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = Math.min(h - 1, y * 2 + dy) * w + Math.min(w - 1, x * 2 + dx);
      ng[y * nw + x] += gray[i] / 4; na[y * nw + x] += alpha[i] / 4;
    }
    w = nw; h = nh; gray = ng; alpha = na; levels.push({ w, h, gray, alpha });
  }
  return levels;
}
function fieldAt(field, x, y, c) {
  const gx = clamp((x + .5) / field.imageW * field.w - .5, 0, field.w - 1), gy = clamp((y + .5) / field.imageH * field.h - .5, 0, field.h - 1);
  const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy, nx = Math.min(ix + 1, field.w - 1), ny = Math.min(iy + 1, field.h - 1);
  return (field.data[(iy * field.w + ix) * 3 + c] * (1 - fx) + field.data[(iy * field.w + nx) * 3 + c] * fx) * (1 - fy) +
    (field.data[(ny * field.w + ix) * 3 + c] * (1 - fx) + field.data[(ny * field.w + nx) * 3 + c] * fx) * fy;
}
function solve(a, b) {
  const ap = pyramid(a), bp = pyramid(b), w = Math.ceil(a.width / 4), h = Math.ceil(a.height / 4), data = new Float32Array(w * h * 3), errors = new Float32Array(w * h);
  for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
    const x = (gx + .5) / w * a.width - .5, y = (gy + .5) / h * a.height - .5, index = (gy * w + gx) * 3;
    let dx = 0, dy = 0, score = 0;
    for (let level = 2; level >= 0; level--) {
      if (level < 2) { dx *= 2; dy *= 2; }
      const aa = ap[level], bb = bp[level], px = Math.round(x / (1 << level)), py = Math.round(y / (1 << level)), radius = level === 2 ? 5 : 2;
      const patchG = [], patchA = [];
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const i = clamp(py + oy, 0, aa.h - 1) * aa.w + clamp(px + ox, 0, aa.w - 1); patchG.push(aa.gray[i]); patchA.push(aa.alpha[i]);
      }
      if (level === 2 && Math.max(...patchA) < .015) { score = 1; break; }
      const cost = (tx, ty) => {
        let sum = 0, k = 0;
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
          const i = clamp(py + ty + oy, 0, bb.h - 1) * bb.w + clamp(px + tx + ox, 0, bb.w - 1);
          const d = patchG[k] - bb.gray[i], da = patchA[k++] - bb.alpha[i]; sum += d * d + da * da * .09;
        }
        return sum / 25 + .000003 * ((tx - dx) ** 2 + (ty - dy) ** 2);
      };
      let best = Infinity, bx = dx, by = dy;
      for (let sy = -radius; sy <= radius; sy++) for (let sx = -radius; sx <= radius; sx++) {
        const tx = dx + sx, ty = dy + sy, c = cost(tx, ty);
        if (c < best) { best = c; bx = tx; by = ty; }
      }
      dx = bx; dy = by; score = best;
    }
    data[index] = dx; data[index + 1] = dy; data[index + 2] = score < 1 ? 1 : 0; errors[gy * w + gx] = score;
  }
  // Remove isolated matches and extend coherent motion just beyond the alpha edge.
  for (let pass = 0; pass < 2; pass++) {
    const prev = new Float32Array(data);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xs = [], ys = [], i = (y * w + x) * 3;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const j = (clamp(y + oy, 0, h - 1) * w + clamp(x + ox, 0, w - 1)) * 3;
        if (prev[j + 2] > 0) { xs.push(prev[j]); ys.push(prev[j + 1]); }
      }
      if (!xs.length) continue;
      xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
      const mx = xs[xs.length >> 1], my = ys[ys.length >> 1];
      const outlier = Math.hypot(mx - prev[i], my - prev[i + 1]) > 4 || prev[i + 2] === 0;
      data[i] = outlier ? mx : prev[i] * .65 + mx * .35; data[i + 1] = outlier ? my : prev[i + 1] * .65 + my * .35;
      if (prev[i + 2] === 0) data[i + 2] = .5;
    }
  }
  return { w, h, imageW: a.width, imageH: a.height, data, errors };
}
export function correspondence(a, b) {
  const forward = solve(a, b), backward = solve(b, a);
  // Confidence is conservative: rejected correspondences use the original frame.
  for (const [field, other] of [[forward, backward], [backward, forward]]) for (let gy = 0; gy < field.h; gy++) for (let gx = 0; gx < field.w; gx++) {
    const i = (gy * field.w + gx) * 3, x = (gx + .5) / field.w * field.imageW - .5, y = (gy + .5) / field.h * field.imageH - .5;
    const dx = field.data[i], dy = field.data[i + 1], residual = Math.hypot(dx + fieldAt(other, x + dx, y + dy, 0), dy + fieldAt(other, x + dx, y + dy, 1));
    field.data[i + 2] *= clamp(1 - residual / 8, 0, 1) * clamp((.045 - field.errors[gy * field.w + gx]) / .035, 0, 1);
  }
  regularize(forward);regularize(backward);
  return { forward, backward };
}
function regularize(field) {
  const { w, h, data } = field, headX = [], headY = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    if (x / w > .33 && x / w < .67 && y / h > .12 && y / h < .45 && data[i + 2] > .55) { headX.push(data[i]); headY.push(data[i + 1]); }
  }
  headX.sort((a, b) => a - b);headY.sort((a, b) => a - b);
  const baseX = headX.length ? headX[headX.length >> 1] : 0, baseY = headY.length ? headY[headY.length >> 1] : 0;
  // Weak matches follow coherent head translation rather than unrelated pixels.
  for (let i = 0; i < data.length; i += 3) {
    let trust = clamp((data[i + 2] - .18) / .54, 0, 1);trust = trust * trust * (3 - 2 * trust);
    data[i] = baseX + (data[i] - baseX) * trust;data[i + 1] = baseY + (data[i + 1] - baseY) * trust;
  }
  for (let pass = 0; pass < 2; pass++) {
    const prev = new Float32Array(data);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let dx = 0, dy = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const i = (clamp(y + oy, 0, h - 1) * w + clamp(x + ox, 0, w - 1)) * 3, weight = (ox === 0 ? 2 : 1) * (oy === 0 ? 2 : 1) / 16;
        dx += prev[i] * weight;dy += prev[i + 1] * weight;
      }
      const i = (y * w + x) * 3;data[i] = dx;data[i + 1] = dy;
    }
  }
  // Bound local derivatives so the inverse UV warp cannot fold hair / blade edges.
  const maxStep = Math.min(field.imageW / w, field.imageH / h) * .45;
  for (let pass = 0; pass < 60; pass++) {
    const reverse = pass % 2;
    for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
      const x = reverse ? w - 1 - gx : gx, y = reverse ? h - 1 - gy : gy, i = (y * w + x) * 3;
      for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const j = (ny * w + nx) * 3, dx = data[i] - data[j], dy = data[i + 1] - data[j + 1], length = Math.hypot(dx, dy);
        if (length > maxStep) {
          const correction = (length - maxStep) / length * .5;
          data[i] -= dx * correction;data[i + 1] -= dy * correction;
          data[j] += dx * correction;data[j + 1] += dy * correction;
        }
      }
    }
  }
  // A final uniform contraction guarantees the bound even before convergence.
  let largest = maxStep;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
    if (nx >= w || ny >= h) continue;const i = (y * w + x) * 3, j = (ny * w + nx) * 3;
    largest = Math.max(largest, Math.hypot(data[i] - data[j], data[i + 1] - data[j + 1]));
  }
  const contraction = maxStep / largest;
  for (let i = 0; i < data.length; i += 3) { data[i] = baseX + (data[i] - baseX) * contraction;data[i + 1] = baseY + (data[i + 1] - baseY) * contraction; }
}
export function encodeFlow(field) {
  const pixels = new Uint8Array(field.w * field.h * 4);
  for (let i = 0; i < field.w * field.h; i++) {
    pixels[i * 4] = Math.round(clamp(128 + field.data[i * 3] * 127 / 32, 1, 255));
    pixels[i * 4 + 1] = Math.round(clamp(128 + field.data[i * 3 + 1] * 127 / 32, 1, 255));
    pixels[i * 4 + 2] = Math.round(field.data[i * 3 + 2] * 255); pixels[i * 4 + 3] = 255;
  }
  return { width: field.w, height: field.h, pixels };
}
export { fieldAt };
