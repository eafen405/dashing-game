/**
 * Golden trace 的**共享配置** —— 旧 harness 驱动、新回放器、比对器、
 * CI 门禁全部从这里取参数，保证「同一种子 / 同一难度 / 同一帧数」。
 */

/** 固定 viewport（900×600，见 `scripts/legacy/legacy-patch-spec.md` §5.3）。 */
export const VIEWPORT = { width: 900, height: 600 };

/** 每帧时长 —— 固定 double `1/60`，**不从时间戳反算**（T1 / T3）。 */
export const DT = 1 / 60;

/** 每局 120 秒 = 7200 帧 @ 60fps。 */
export const FRAMES = 7200;

/**
 * 零输入场景（`mode: 'idle'`）的帧数。
 *
 * 零输入 → 每只普通怪必然触线漏怪（-20 血）→ **13 次**漏怪把 250 血打光
 * → `hp <= 0 → gameOverNow()`。实测 1★ 走 1250 帧（≈21 秒）、2★ 走 734 帧
 * （≈12 秒）；这里给 60 秒（3600 帧）留足余量 —— 轨迹在 `phase` 变成 `over`
 * 的那一帧就停，实际帧数远小于这个上限。
 */
export const IDLE_FRAMES = 3600;

/**
 * 固定种子（3 个）。
 *
 * 选种标准（由 `scripts/trace-search.mjs` 实测筛出）：每个种子在 1★ / 2★ 下都
 * 要能跑满 120 秒（血量不归零），并且**十条结算路径全部覆盖**。
 *
 * 实测结果（`node scripts/trace-search.mjs --from 20240101 --count 40 --diff all`）：
 * - 1★：40 个候选里 11 个十路径全覆盖
 * - 2★：40 个候选里 25 个十路径全覆盖
 * - 下面这 3 个在**两个难度下都**全覆盖。
 */
export const SEEDS = [20240109, 20240118, 20240119];

/** 难度星级：1★ 标准 / 2★ 更快更密。 */
export const DIFFICULTIES = [1, 2];

/** 比对容差：连续字段（浮点）允许的最大偏差。 */
export const TOLERANCE = 1e-9;
