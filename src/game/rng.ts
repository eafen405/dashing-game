/**
 * 可注入的带种子伪随机数发生器（mulberry32）。
 *
 * 规则层**禁止**直接调 `Math.random()`（`eslint.config.js` 的
 * `no-restricted-properties` 会拦）。所有随机性都从这里走，
 * 于是整局游戏可复现 —— 这是票 03「golden trace 对照」的前提。
 *
 * PRNG 是**有状态**的，所以它不能待在不可变的 `GameState` 里：
 * 状态不可变的前提是「同一个输入永远得到同一个输出」，
 * 而一个随调用次数变化的随机源放进状态里会直接破坏这个前提。
 * 因此 PRNG 由调用方持有并通过参数注入。
 */

/** 随机数发生器。 */
export interface Rng {
  /** 返回 `[0, 1)` 区间的均匀随机数。 */
  next(): number;
  /**
   * 返回 `[min, max)` 区间的均匀随机数。
   *
   * 等价于旧实现的 `rand(a, b) = a + Math.random() * (b - a)`
   * （`source.html:493`）—— 注意是「先乘后加」，这里逐字保持。
   */
  range(min: number, max: number): number;
}

/**
 * mulberry32 —— 32 位状态、周期 2^32 的快速伪随机数发生器。
 *
 * @param seed 种子。同一个种子必然产出同一串随机数。
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min: number, max: number): number => min + next() * (max - min),
  };
}
