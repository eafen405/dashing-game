/**
 * 规则层（game/）公共出口。
 *
 * 分层约束（`.scratch/refactor/spec.md` · ADR-0003「规则层不可变、表现层可变」）：
 *   - 纯函数：不持有可变状态，入参 → 出参
 *   - 无 DOM、无 Pixi、无 React
 *   - 不用 `Math.random()`：随机性一律走注入的种子 PRNG
 *
 * 上面三条由 `eslint.config.js` 的 `src/game/**` 段强制执行，
 * 回归测试见 `tests/tooling/lint-boundaries.test.ts`。
 *
 * **公共接口形状**（票 03 / 04 / 05 都依赖它）：
 *   - 主入口：`reduce(state, event, rng) → { state, effects }`
 *   - 规则函数：`computeLayout` / `spawnInterval` / `speedNow` / `clearLane` /
 *     `hasActiveLong` / `hasActivePair` / `laneBlocked` / `strike` / 结算函数族 /
 *     `triggerFever` / `endFever` / `tick`
 */

export * from './constants';
export * from './effects';
export * from './layout';
export * from './reducer';
export * from './rng';
export * from './state';
export * from './trace';
export * from './types';
export * from './rules/difficulty';
export * from './rules/fever';
export * from './rules/resolve';
export * from './rules/spawn';
export * from './rules/strike';
export * from './rules/tick';

/** 规则层标识。 */
export const RULES_LAYER_ID = 'game';
