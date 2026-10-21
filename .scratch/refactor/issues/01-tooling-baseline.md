# 01 — 工程基线：ESLint / Prettier / Vitest / CI

Status: ready-for-agent
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
