/**
 * 难度星级的**显示元数据** —— 名字、一句话说明、两条轴的归一化长度。
 *
 * **规则层不关心这些**：`src/game/constants.ts` 的 `DIFFS` 只有两个倍率
 * （`spawnMul` / `speedMul`），名字与文案是界面层的事，所以住在 `src/app/`。
 *
 * ## 为什么要两条轴
 *
 * 难度星级**不是一条单调阶梯**（`DIFFS` 的实际取值）：
 *
 * | 星级 | 刷新密度 | 移速 | 性格 |
 * | --- | --- | --- | --- |
 * | 1★ | ×1 | ×1 | 基准 |
 * | 2★ | ×2 | ×1.5 | 怪更多、也更快 |
 * | 3★ | ×3 | ×1 | **怪最多，但速度不变** |
 * | 4★ | ×2.5 | ×2 | **最快，但怪比 3★ 少** |
 *
 * 只看 ★ 会以为「越多越快越密」，而 3★ 与 4★ 其实是**两条不同的难法**
 * （3★ 考手速与 throughput，4★ 考反应窗口）。
 * 所以每档把密度与移速各画一条条，让这个非单调关系一眼可见，
 * 而不是逼玩家读两遍文字。
 *
 * 轴长按**四档里的最大值**归一化（`×3` / `×2`），所以最满的那条就是天花板。
 *
 * 名字与说明集中在这里 —— 想改文案只改这一处。
 */

import { DIFFS } from '../game/constants';
import type { Difficulty } from '../game/types';

/** 四档难度（`Difficulty` 的全部取值，按星级升序）。 */
export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4];

/** 每档的显示元数据。 */
export interface DifficultyMeta {
  /** 显示名。 */
  name: string;
  /** 一句话说明这一档的难法。 */
  note: string;
  /** 刷新密度轴的长度（0~1）。 */
  density: number;
  /** 移速轴的长度（0~1）。 */
  speed: number;
  /** 星级字样（`★` 重复 N 次）。 */
  stars: string;
}

/** 名称与说明 —— 唯一需要维护文案的地方。 */
const COPY: Record<Difficulty, { name: string; note: string }> = {
  1: { name: '标准', note: '密度与速度都是基准值。' },
  2: { name: '加速', note: '怪来得更多，也走得更快。' },
  3: { name: '密集', note: '怪来得最密，但速度不变。' },
  4: { name: '疾驰', note: '速度最快，怪比 3 星略少。' },
};

/** 密度轴的天花板 = 四档里最大的 `spawnMul`。 */
const MAX_SPAWN_MUL = Math.max(...DIFFICULTIES.map((d) => DIFFS[d].spawnMul));

/** 移速轴的天花板 = 四档里最大的 `speedMul`。 */
const MAX_SPEED_MUL = Math.max(...DIFFICULTIES.map((d) => DIFFS[d].speedMul));

/** 取某一档的显示元数据。 */
export function difficultyMeta(diffLevel: Difficulty): DifficultyMeta {
  const copy = COPY[diffLevel];
  return {
    name: copy.name,
    note: copy.note,
    density: DIFFS[diffLevel].spawnMul / MAX_SPAWN_MUL,
    speed: DIFFS[diffLevel].speedMul / MAX_SPEED_MUL,
    stars: '★'.repeat(diffLevel),
  };
}

/**
 * 上下移动一档（**环形** —— 从 1★ 往上走回到 4★）。
 *
 * 菜单里用上下键换档；难度即光标（难度是跨局保留的全局选择，
 * 改选中档不影响当前局面）。
 */
export function stepDifficulty(current: Difficulty, delta: -1 | 1): Difficulty {
  const index = DIFFICULTIES.indexOf(current);
  const next = DIFFICULTIES[(index + delta + DIFFICULTIES.length) % DIFFICULTIES.length];
  return next ?? current;
}
