/**
 * 屏幕震动强度 —— 表现层可变状态之一。
 *
 * 旧实现是一个全局 `let shake`（`source.html:469`），被规则层顺手改写
 * （`shake = Math.min(shake + n, cap)` / `Math.max(shake, n)` / `shake = 14`）。
 * 新实现里规则层只发**效果事件**，语义由这里落实（见 `src/game/effects.ts`）。
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
export class ShakeState {
  /** 当前震动强度（0 = 无震动）。 */
  value = 0;

  /** `shake-add` —— 累加并封顶。 */
  add(amount: number, cap: number): void {
    this.value = Math.min(this.value + amount, cap);
  }

  /** `shake-max` —— 只在更大时抬升。 */
  raiseTo(amount: number): void {
    this.value = Math.max(this.value, amount);
  }

  /** `shake-set` —— 直接赋值。 */
  set(amount: number): void {
    this.value = amount;
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
