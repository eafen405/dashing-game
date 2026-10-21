/**
 * 屏幕震动强度 —— 表现层可变状态之一。
 *
 * 旧实现是一个全局 `let shake`（`source.html:469`），被规则层顺手改写
 * （`shake = Math.min(shake + n, cap)` / `Math.max(shake, n)` / `shake = 14`）。
 * 新实现里规则层只发**效果事件**，语义由这里落实（见 `src/game/effects.ts`）。
 *
 * ## 票 07：三档强度
 *
 * 旧实现把「普攻 / 暴击 / 双生同破」三种情形全压在一个上限 17 的值上，
 * 视觉上分不出轻重。这里改成**三档显式档位**（`fx.ts` 的 `SHAKE_TIERS`）：
 *
 * | 档位 | 强度 | 实际位移（`rand(-s,s)*0.5`） | 触发 |
 * |---|---|---|---|
 * | `normal` | 6 | ±3 px | 普攻 / 空挥 / 长按 |
 * | `crit` | 12 | ±6 px | 暴击击破 / 长按完成 |
 * | `twin` | 18 | ±9 px | 双生同破 / 角色受击 |
 *
 * 规则层事件里的 `cap`（17 / 18 / 20）是旧实现的封顶，本层不再采用 ——
 * 封顶由**档位**决定（见 `SHAKE_CAPS`）。
 *
 * 衰减公式逐字照抄 `source.html:1389-1390`（与 `1410-1411` 同一口径）：
 *
 * ```js
 * shake *= Math.pow(0.001, dt);
 * if (shake < 0.2) shake = 0;
 * ```
 *
 * **抖动位移不在这里施加** —— 位移是渲染层的事（旧 `source.html:1463`），
 * 本模块只管强度。
 */

import { SHAKE_CAPS, SHAKE_TIERS, type ShakeTier } from './fx';

export class ShakeState {
  /** 当前震动强度（0 = 无震动）。 */
  value = 0;

  /**
   * 累加一档震动并封顶。
   *
   * 封顶取 `max(本档封顶, 当前强度)` —— 强档落下后，
   * 后续的弱档**不会**把画面拉回更轻的抖动（只增不减）。
   */
  add(tier: ShakeTier): void {
    const amount = SHAKE_TIERS[tier];
    const ceiling = Math.max(SHAKE_CAPS[tier], this.value);
    this.value = Math.min(this.value + amount, ceiling);
  }

  /** 只在更大时抬升（规则层的 `shake-max`）。 */
  raiseTo(tier: ShakeTier): void {
    this.value = Math.max(this.value, SHAKE_TIERS[tier]);
  }

  /** 直接赋值（规则层的 `shake-set`）。 */
  set(tier: ShakeTier): void {
    this.value = SHAKE_TIERS[tier];
  }

  /** 衰减一帧（逐字照抄旧实现）。 */
  decay(dt: number): void {
    this.value *= Math.pow(0.001, dt);
    if (this.value < 0.2) this.value = 0;
  }

  /** 清零。 */
  reset(): void {
    this.value = 0;
  }
}
