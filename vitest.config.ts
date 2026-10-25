import { defineConfig } from 'vitest/config';

/**
 * Vitest 配置 —— 独立于 `vite.config.ts`。
 *
 * 为什么不复用 `vite.config.ts`：`vite.config.ts` 挂载了 `vite-plugin-singlefile`，
 * 该插件会改写产物形态，测试跑的是源码而不是产物，让它参与会平白引入干扰。
 * Vitest 只要发现同目录的 `vitest.config.ts`，就不会再加载 `vite.config.ts`。
 *
 * `environment: 'node'` —— 规则层是纯函数层，不需要 DOM（见 spec.md 分层图）。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx,mjs}'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      include: ['src/game/**'],
      exclude: ['src/game/**/__tests__/**'],
      reporter: ['text', 'html'],
    },
  },
});
