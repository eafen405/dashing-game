/**
 * 出刀输入风控 —— 防止连点器把「按下频率」直接换成收益。
 *
 * 这一层不改变规则层对单次按下的结算，只在**事件进入规则层之前**做三件事：
 *
 * 1. **令牌桶**：短时间最多放行 {@link INPUT_GUARD.burst} 次，长期平均不超过
 *    {@link INPUT_GUARD.maxPressesPerSecond} 次/秒。连点器按 20Hz 甚至 100Hz
 *    发送，也拿不到对应的有效输入。
 * 2. **同轨锁**：同一条轨在 {@link INPUT_GUARD.sameLaneLock} 秒内重复按下会被忽略。
 *    这个值小于一次挥击的 `ATTACK_DUR × 0.42`，不会误伤正常的连续出刀。
 * 3. **空挥连击锁**：第一次空挥只警告；{@link INPUT_GUARD.whiffWindow} 秒内再次空挥，
 *    进入 {@link INPUT_GUARD.whiffLock} 秒硬直。正常玩家偶尔点早一下不受罚，
 *    「两轨同时狂点」会迅速把自己锁住。
 *
 * 时间统一用规则层时钟（`GameState.now`），所以暂停 / 切后台不会偷走锁定时间，
 * 重开一局时由会话层调用 {@link reset} 清空。
 */

import type { Lane } from '../game/types';
import type { StrikeOutcome } from '../game/rules/strike';

/** 风控参数。数值集中在这里，方便调参与单测。 */
export const INPUT_GUARD = {
  /** 长期平均输入上限（次/秒）。 */
  maxPressesPerSecond: 8,
  /** 令牌桶容量（短时间允许的突发次数）。 */
  burst: 4,
  /** 同轨重复按下的最小间隔（秒）。 */
  sameLaneLock: 0.16,
  /** 连续空挥的判定窗口（秒）。 */
  whiffWindow: 0.3,
  /** 连续空挥后的硬直时长（秒）。 */
  whiffLock: 0.18,
} as const;

/**
 * 一次按下的准入控制。
 *
 * 调用顺序必须是：
 *
 * ```
 * if (!guard.allow(now, lane)) return;
 * const result = reduce(state, { type: 'Press', lane, ... });
 * guard.record(now, lane, result.pressOutcome);
 * ```
 *
 * `allow` 只负责「这次输入能不能进规则层」；`record` 才知道规则层把它判成
 * 命中、空挥、长按还是无效操作。
 */
export class StrikeGuard {
  private tokens: number = INPUT_GUARD.burst;
  private lastNow: number | null = null;
  private lastSwingLane: Lane | null = null;
  private lastSwingAt = Number.NEGATIVE_INFINITY;
  private lastWhiffAt = Number.NEGATIVE_INFINITY;
  private lockedUntil = Number.NEGATIVE_INFINITY;

  /** 新一局 / 回主页面时清空所有历史。 */
  reset(): void {
    this.tokens = INPUT_GUARD.burst;
    this.lastNow = null;
    this.lastSwingLane = null;
    this.lastSwingAt = Number.NEGATIVE_INFINITY;
    this.lastWhiffAt = Number.NEGATIVE_INFINITY;
    this.lockedUntil = Number.NEGATIVE_INFINITY;
  }

  /** 这次按下是否放行。被拒绝的输入不消耗令牌，也不产生任何规则层事件。 */
  allow(now: number, lane: Lane): boolean {
    if (now < this.lockedUntil) return false;

    if (this.lastNow !== null) {
      const elapsed = Math.max(0, now - this.lastNow);
      this.tokens = Math.min(
        INPUT_GUARD.burst,
        this.tokens + elapsed * INPUT_GUARD.maxPressesPerSecond,
      );
    }
    this.lastNow = now;

    if (this.tokens < 1) return false;
    if (this.lastSwingLane === lane && now - this.lastSwingAt < INPUT_GUARD.sameLaneLock) {
      return false;
    }

    this.tokens -= 1;
    return true;
  }

  /**
   * 记录一次已放行输入的结果。
   *
   * - `hit` / `hold` 会打断空挥连击；
   * - `whiff` 在窗口内连续出现时触发硬直；
   * - `neutral` 不参与同轨锁和空挥链（例如「太早」、重复按正在长按的轨道）。
   *
   * @returns 是否**刚刚触发**了空挥硬直（用于播一次提示，而不是每次拒绝都刷屏）。
   */
  record(now: number, lane: Lane, outcome: StrikeOutcome | undefined): boolean {
    if (outcome === undefined || outcome === 'neutral') return false;

    if (outcome === 'whiff') {
      this.lastSwingLane = lane;
      this.lastSwingAt = now;
      let lockedNow = false;
      if (now - this.lastWhiffAt <= INPUT_GUARD.whiffWindow) {
        const nextLock = now + INPUT_GUARD.whiffLock;
        lockedNow = nextLock > this.lockedUntil;
        this.lockedUntil = Math.max(this.lockedUntil, nextLock);
      }
      this.lastWhiffAt = now;
      return lockedNow;
    }

    // 命中 / 成功长按：这一刀是有效操作，空挥链清零。
    this.lastSwingLane = lane;
    this.lastSwingAt = now;
    this.lastWhiffAt = Number.NEGATIVE_INFINITY;
    return false;
  }
}
