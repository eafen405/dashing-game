# 01 — 工程基线：ESLint / Prettier / Vitest / CI

Status: resolved
Blocked by: (none)

## 目标

把 Phase 0 Spike 搭好的工程补成可持续开发的基线。TypeScript 严格模式与 `npm run typecheck` 已在 Spike 中就位，本票只补其余部分。

## 要做

1. **ESLint**（flat config）：`typescript-eslint` 严格档 + `eslint-plugin-react-hooks`。规则层禁止 `any` 逃逸。
2. **Prettier**：统一格式，与 ESLint 集成（`eslint-config-prettier`）。
3. **Vitest**：接入 `vitest.config.ts`，`environment: 'node'`（规则层不需要 DOM）。`npm test` 跑通 —— 此时可以先放一个占位断言，正式用例由 02/03 补。
4. **GitHub Actions**（`.github/workflows/ci.yml`）：Node 24，顺序执行 `typecheck → lint → test → build → verify-single-file`。
5. **`scripts/verify-single-file.mjs` 入 CI**：把 Playwright 检查拆成两步 —— 静态检查（无浏览器也能跑，必过）+ 浏览器检查（CI 里用 `chromium` + `--enable-unsafe-swiftshader`）。若 CI 环境无法启动浏览器，退化为静态检查并明确标注，不允许静默跳过。

## 验收

- `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` 全绿。
- `node scripts/verify-single-file.mjs` 在本地通过（Chromium）。
- 推送到 GitHub 后 Actions 全绿。

## 备注

- **`playwright` 已正式进 `devDependencies`**（`^1.64.1`，已裁决）。CI 里用 `npx playwright install --with-deps chromium` 只装 Chromium，避免拉全套浏览器。
- CI 暂不做性能断言（见 ADR-0004）。

## Answer

已实现并合并到集成分支 `feat/refactor-v2`（合并提交 `d4b806e`，实现提交 `58f41fa`）。

- ESLint flat config：`typescript-eslint` 严格档 + `eslint-plugin-react-hooks` + `eslint-config-prettier`。
  规则层拦截段 `files: ['src/game/**/*.{ts,tsx}']` 拦 React / ReactDOM / Pixi import、
  DOM 全局（`document` / `window` / `navigator` / `localStorage` …）、33 个 DOM 类型、`Math.random()`、`any`。
- Prettier（`.prettierrc` / `.prettierignore`），`source.html` 与 `dist/` 已排除。
- Vitest：独立 `vitest.config.ts`（`environment: 'node'`，不加载 singlefile 插件），
  `include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}']`。
  `tests/tooling/lint-boundaries.test.ts` 用 ESLint 公开 API 验证拦截规则**真的拦得住**。
- CI：`.github/workflows/ci.yml`，Node 24，`typecheck → lint → test → build → verify-single-file`。
- `scripts/verify-single-file.mjs` 拆成静态检查 + 浏览器检查，
  支持 `--no-browser` / `--browser`；浏览器不可用时打印明确 WARN 并以退出码 `2` 退出（不允许静默跳过）。
  退出码约定：`0` 通过 / `1` 校验失败 / `2` 浏览器不可用。
- 新增 devDependency：`eslint` `^10.13.0`、`@eslint/js` `^10.0.1`、`typescript-eslint` `^8.72.0`、
  `eslint-plugin-react-hooks` `^7.1.1`、`eslint-config-prettier` `^10.1.8`、`prettier` `^3.9.10`、
  `vitest` `^5.0.5`、`@vitest/coverage-v8` `^5.0.5`。

遗留（归入后续票）：

- `verify` 脚本的浏览器检查仍依赖 Phase 0 的 `window.__SPIKE__` 契约，真实应用替换 spike 后需同步改（票 10）。
- `format:check` 未加入 CI 步骤序列（票 01 只枚举了五步）。
