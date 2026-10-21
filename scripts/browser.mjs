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
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

/**
 * 依次尝试候选可执行文件，返回第一个能启动的 browser。
 *
 * @throws {Error} 所有候选都失败时抛出最后一个错误。
 */
export async function launchChromium(chromium) {
  let lastError = null;
  for (const executablePath of chromiumCandidates()) {
    try {
      return await chromium.launch({ executablePath, args: CHROMIUM_ARGS });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('无法启动 Chromium');
}
