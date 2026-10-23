/**
 * 规则层类型 —— 对应旧实现里那一堆可变全局变量（见 `legacy-semantics.md` §0）。
 *
 * 关键约定：
 *
 * 1. **单一 `removed` 标志**。旧实现里 `done` 只在长按怪上赋值、`dead` 只在普通怪 /
 *    双生上赋值，两套语义交叉（`clearLane()` 与 `hasActivePair()` 口径不一致）。
 *    新代码统一用 `removed`（已离场）表达同一件事。
 * 2. **长按怪 escaped 但还没滑出屏幕时 `removed` 仍是 `false`** ——
 *    它依然占用轨道、依然吞掉该轨的输入（旧 `hasActiveLong` / `laneBlocked` /
 *    `findLongInLane` 都是这个语义）。
 * 3. **`vt`（视觉时钟）不在规则层**。它只被绘制代码用，与胜负无关。
 * 4. **`holdMonsterId`（正在被长按的怪）与 `holdInputId`（按住的指针 id）是两个东西**，
 *    不可变状态里不能把指针 id 挂在怪身上。
 */

/** 轨道：上轨 / 下轨。 */
export type Lane = 'top' | 'bottom';

/** 局面阶段。 */
export type Phase = 'idle' | 'running' | 'paused' | 'over';

/** 难度星级（1 星标准，2 星更快更密）。 */
export type Difficulty = 1 | 2;

/**
 * 战场几何布局（`source.html:534-577` 的纯函数化结果）。
 *
 * 全部是「CSS 像素」单位；`dpr` 只用于表现层换算设备像素。
 */
export interface Layout {
  width: number;
  height: number;
  dpr: number;
  /** 两条轨道的纵坐标。 */
  laneY: Record<Lane, number>;
  /** 角色半径。 */
  playerR: number;
  /** 角色横坐标。 */
  playerX: number;
  /** 判定区中心横坐标。 */
  hitX: number;
  /** 判定区宽度。 */
  hitW: number;
  /** 判定区半宽。 */
  zoneHalf: number;
  /** 暴击区半宽。 */
  critHalf: number;
}

/** 所有怪物的公共字段。 */
export interface MonsterBase {
  /** 局内唯一 id（用于不可变状态下的互相引用）。 */
  id: number;
  lane: Lane;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * 已离场（被击破 / 贯穿完成 / 逃逸滑出屏幕）。
   *
   * 这是旧实现 `done` / `dead` 两个标志的**统一替代**：单一语义，单一来源。
   */
  removed: boolean;
}

/** 会移动的怪物（普通怪、双生）的公共字段。 */
export interface MovingMonster extends MonsterBase {
  vx: number;
  /** 速度系数，随全局移速同步。 */
  sf: number;
  phase: number;
  wob: number;
}

/** 普通怪。 */
export interface NormalMonster extends MovingMonster {
  kind: 'normal';
}

/** 双生怪（与 `partnerId` 指向的同组另一只互为锁链）。 */
export interface TwinMonster extends MovingMonster {
  kind: 'twin';
  /** 双生组编号（同组两只共享）。 */
  pairId: number;
  /** 同组另一只的 id；解除锁链后为 `null`。 */
  partnerId: number | null;
  /** 已挂起，等待另一轨在 `PAIR_WINDOW` 内补齐。 */
  pairPending: boolean;
  /** 挂起窗口剩余秒数。 */
  pairT: number;
  /** 挂起那一击是否落在暴击区。 */
  pairCrit: boolean;
}

/** 长按怪。 */
export interface HoldMonster extends MonsterBase {
  kind: 'hold';
  /** 身体长度（沿轨道方向）。 */
  len: number;
  /** 已锚定（头部进入判定区并被按住）。 */
  anchored: boolean;
  /** 已放弃（长按失败 / 漏怪），正高速滑出屏幕。 */
  escaped: boolean;
  /** 已按住秒数。 */
  holdT: number;
  /** 头部得分已发放。 */
  headAwarded: boolean;
  /** 满 1 秒得分已发放。 */
  midAwarded: boolean;
  /** 未按住时的宽限倒计时。 */
  waitT: number;
  /** 正在被按住。 */
  holding: boolean;
  /** 「太早」提示的时间戳（用于 0.6 秒节流）。 */
  tipT: number | null;
  /** 逃逸时的滑出速度。 */
  escSpeed: number;
  /** 浮动相位（表现层用；旧实现长按怪也有 `phase`）。 */
  phase: number;
}

export type Monster = NormalMonster | TwinMonster | HoldMonster;

/**
 * 规则层状态 —— 旧实现 45 个可变全局变量收成的**一个**不可变对象。
 *
 * 不含表现层的东西（粒子 / 命中火花 / 冲击环 / 飘字 / 屏幕震动 / 角色闪白），
 * 也不含跨局持久化的 `best`（最高分属于 HUD 层）。
 */
export interface GameState {
  /** 局面阶段。 */
  phase: Phase;
  /** 本局种子（仅作记录，用于 trace 复现；随机数由外部注入的 PRNG 产生）。 */
  seed: number;
  /** 难度星级。 */
  diffLevel: Difficulty;
  /** 战场几何。 */
  layout: Layout;

  /** 游戏时间（秒），只在 `running` 阶段累加。 */
  now: number;
  /** 剩余生命值。 */
  hp: number;
  score: number;
  combo: number;
  maxCombo: number;
  kills: number;
  critCount: number;
  normalCount: number;

  /** 在场怪物（含本 tick 内刚被移除、尚未清理的）。 */
  monsters: Monster[];

  /** 距下一次生成的倒计时。 */
  spawnTimer: number;
  /** FEVER 是否生效。 */
  frenzyActive: boolean;
  /** FEVER 剩余秒数。 */
  feverT: number;
  /** 下一次触发 FEVER 所需的连击数。 */
  nextFeverAt: number;

  /** 双生组编号。 */
  pairSeq: number;
  /** 距下一组双生的冷却（秒）。 */
  pairCooldown: number;
  /** 本局是否已提示过双生规则。 */
  pairHintShown: boolean;

  /** 距下一个长按怪的冷却（秒）。 */
  longCooldown: number;
  /** 本局是否已提示过长按规则。 */
  longHintShown: boolean;

  /** 正在被长按的长按怪 id（不是指针 id）。 */
  holdMonsterId: number | null;
  /** 发起长按的指针 / 按键 id。 */
  holdInputId: string | null;

  /** 出招动作剩余时间（>0 表示正在挥击）。 */
  attackT: number;
  /** 出招轨道。 */
  attackLane: Lane | null;
  /**
   * 角色当前驻守的轨道。默认 `'bottom'`（在下轨地面上跑）；上跳打上轨时
   * 变为 `'top'`，落回下轨后再变回 `'bottom'`。
   *
   * 角色只在自己驻守的轨道上才会**碰到**漏过来的怪：另一轨的怪会从身边擦过，
   * 不扣血，但连击清零。双生怪两轨各有一只，因此触线时必定撞上角色。
   */
  playerLane: Lane | null;
  /**
   * 上跳滞空剩余秒数（仅 `playerLane === 'top'` 且不在长按悬浮时生效）。
   *
   * 到 0 时角色落回下轨（`playerLane` 改回 `'bottom'`）。
   */
  airT: number;

  /** 下一个怪物 id 计数器。 */
  nextMonsterId: number;

  /**
   * **仅供 golden trace 对照使用的兼容开关** —— 让 `clearLane()` 回到旧实现的
   * 错误口径（把普通怪 / 双生怪也算作「占用轨道」）。
   *
   * **默认 `false`，且生产路径不可达**：
   * - 唯一的写入点是 {@link createGameState} 的同名选项；
   * - 规则层的 `Start` 事件不传这个选项 → 走 `reduce()` 开局的游戏恒为 `false`；
   * - 因此只有票 03 的 trace 回放器（直接调 `createGameState`）能打开它。
   *
   * 存在意义：模式 B′ 要让**两边都保留旧的 `clearLane` bug**，逐帧完全一致，
   * 以此证明「D1 是唯一的语义差异」。
   */
  legacyClearLane: boolean;

  /**
   * **仅供 golden trace 对照使用的兼容开关** —— 关闭「上下轨触碰」判定，
   * 回到旧实现「任何轨道的怪触线都扣血」的口径。
   *
   * 默认 `false`，生产路径不可达（同 {@link legacyClearLane}）。
   * 存在的意义：旧版 harness 没有上下轨概念，golden trace 要比较的是
   * 除本地新增玩法之外的规则核心。
   */
  legacyCollision: boolean;
}
