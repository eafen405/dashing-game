/**
 * 怪物类别的判定谓词 —— `Monster['kind']` 的**单一判定口径**。
 *
 * `kind` 是联合类型（`'normal' | 'twin' | 'hold'`），到处在写 `m.kind === 'hold'`
 * —— 散在规则层与战场层的 7 个模块里（`rules/resolve` / `rules/tick` /
 * `rules/spawn` / `rules/strike` / `game/trace` / `PixiRenderer` / `pixi/monster`）。
 * 这是典型的「重复的 switch」气味：同一个类别的判定散落各处，
 * 读代码的人要逐处确认「这里说的是不是同一件事」。
 *
 * 本模块把**纯粹的类别判定**收拢一处（只是「是不是这一类」，不涉及任何行为分支）。
 * 规则层里那几处直接用它；战场层与 `game/trace.ts` 暂不改动 ——
 * `trace.ts` 会被 `patch-legacy.mjs` 单独转译内联进旧 harness（不能有值导入），
 * 战场层的改动则要跟着走一次视觉验收。剩下的散点记在
 * `.scratch/refactor/handoff.md` 的「已知陷阱」里，作为**已知的后续项**。
 */

import type { HoldMonster, Monster, TwinMonster } from './types';

/** 是不是**长按怪**。 */
export function isHoldMonster(m: Monster): m is HoldMonster {
  return m.kind === 'hold';
}

/** 是不是**双生怪**。 */
export function isTwinMonster(m: Monster): m is TwinMonster {
  return m.kind === 'twin';
}
