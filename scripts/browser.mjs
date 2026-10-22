/**
 * 启动 headless Chromium —— Playwright 自带 → 本机缓存 → 系统 chromium。
 *
 * 回退链的必要性：本机 Playwright 缓存的浏览器版本与当前 `playwright` 包
 * 期望的版本可能不一致（`Executable doesn't exist at .../chromium-1248/...`），
 * CI 里则由 `npx playwright install --with-deps chromium` 保证一致。
 * 两条路径都能跑，门禁不该因为浏览器版本对不上而红。
 */

import { join } from 'node:path';

export const CHROMIUM_ARGS = ['--enable-unsafe-swiftshader', '--no-sandbox'];

/** 候选可执行文件（`undefined` = 用 Playwright 自带的）。 */
export function chromiumCandidates() {
  return [
    undefined,
    join(process.env.HOME ?? '', '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'),
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/local/chrome/chrome',
    '/snap/bin/chromium',
  ];
}

/**
 * 依次尝试候选可执行文件，返回第一个能启动的 browser。
 *
 * @throws {Error} 所有候选都失败时抛出最后一个错误。
 */
export async function launchChromium(chromium) {
  // **默认无头，而且无头就拿得到 WebGL**。
  //
  // `CHROMIUM_ARGS` 带 `--enable-unsafe-swiftshader`，Chromium 实际跑在
  // `--use-angle=swiftshader-webgl` 上 —— Pixi 走的是**真实 WebGL 路径**，
  // 不会回退 Canvas2D，bloom / 色散 / 冲击波全部生效。
  // （以前写的「无头拿不到 WebGL，要 `HEADED=1 xvfb-run`」已经过期，见票 20。）
  //
  // SwiftShader 是**软件光栅**：FPS 挂件只有 11–13 —— 那**不是**产品性能指标，
  // 不能当 60fps 证据（ADR-0004）。视觉脚本的判据不看 fps，所以进 CI 没有这个问题。
  //
  // `HEADED=1` 仍然保留：只有本地想**人眼看窗口**时才需要（还得有显示服务）。
  const headless = process.env.HEADED !== '1';
  let lastError = null;
  for (const executablePath of chromiumCandidates()) {
    try {
      return await chromium.launch({ executablePath, args: CHROMIUM_ARGS, headless });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('无法启动 Chromium');
}
