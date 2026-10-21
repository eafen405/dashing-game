/**
 * 规则层（game/）公共出口 —— 票 01 只建骨架。
 *
 * 分层约束（`.scratch/refactor/spec.md` · ADR-0003「规则层不可变、表现层可变」）：
 *   - 纯函数：不持有可变状态，入参 → 出参
 *   - 无 DOM、无 Pixi、无 React
 *   - 不用 `Math.random()`：随机性一律走注入的种子 PRNG
 *
 * 上面三条由 `eslint.config.js` 的 `src/game/**` 段强制执行，
 * 回归测试见 `tests/tooling/lint-boundaries.test.ts`。
 *
 * 票 02 在本文件补齐真实导出（constants · types · state · rng · reducer · rules）。
 */

/** 规则层标识。占位导出，票 02 起改为真实的规则层公共 API。 */
export const RULES_LAYER_ID = 'game';
