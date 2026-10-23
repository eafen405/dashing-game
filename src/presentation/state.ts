/**
 * 表现层状态 —— 规则层效果事件 → 可变表现状态的翻译层。
 *
 * 分层依据 ADR-0003「规则层不可变、表现层可变」：
 *
 * ```
 * 规则层 game/  ──Effect[]──▶  表现层 presentation/  ──FrameView──▶  战场层 battlefield/
 * ```
 *
 * 规则层只描述「发生了什么」（`src/game/effects.ts` 的 `Effect`），
 * 这里决定「怎么表现」：加粒子、加环、加刀光、加飘字、改震动、闪红。
 *
 * 少数事件（`toast` / `lane-flash` / `vibrate` / `hurt` / `fever-*` / `game-over`）
 * 是**上层（会话层 / HUD 层）**的事，本层不处理，通过 `EffectSink` 钩子转交。
 *
 * ## 票 07：批次级视觉签名
 *
 * 规则层**不可改动**，所以「这次是不是暴击」「这是不是双生同破」只能从
 * **效果事件的签名**反推（`fx.ts` 的签名表）。判定在**批次**级做 ——
 * 一次规则层动作产生的全部事件算一批（`strike()` 把刀光与击破合并成一批）。
 *
 * 判定结果决定三件事：
 *
 * - **粒子形态**（`shard` 暴击碎片 / `ember` FEVER 余烬 / `spark` 普攻火花）
 * - **冲击环档位**（普攻 / 暴击 / 双生同破 → 粗细与颜色分档）
 * - **冲击波**（暴击 / 双生同破时瞬时触发一次全屏冲击波）
 */

import type { ScreenFx } from '../battlefield/types';
import { SHOCK_LIFE } from '../battlefield/types';
import type { Effect } from '../game/effects';
import type { Lane, Layout } from '../game/types';
import { EffectsPool } from './effects';
import { classifyBatch, particleFormOf, ringTierOf, shakeTierOf, type BatchSignature } from './fx';
import { ShakeState } from './shake';

/** 色散强度的爬升 / 回落速率（每秒）—— 0.35 秒走完一档。 */
const RGB_SPLIT_RATE = 1 / 0.35;

/** 暴击余晖的寿命倍数（相对主刀光的 0.3 秒）。 */
const AFTERGLOW_LIFE_SCALE = 1.7;

/** FEVER 周身火花的发射间隔区间（秒）—— 旧 `source.html:1245` 的 `rand(0.035, 0.08)`。 */
const FEVER_SPARK_MIN = 0.035;
const FEVER_SPARK_MAX = 0.08;

/** 双生击破时角色「大幅跳起下砸」的动画时长（秒）。 */
export const PAIR_SMASH_DUR = 0.62;

/**
 * 上层钩子 —— 表现层不处理的事件转交到这里。
 *
 * 04b（会话层 / HUD 层）实现它；不实现就**丢弃**这些事件（不影响画面）。
 */
export interface EffectSink {
  /** 旧 `showToast(text, color)`。 */
  toast(text: string, color: string): void;
  /** 旧 `laneTop/laneBot.classList.add("hit")`。 */
  laneFlash(lane: Lane): void;
  /** 旧 `nudgeVibrate(ms | ms[])`。 */
  vibrate(pattern: number | number[]): void;
  /** 旧 `flashHurt()`。 */
  hurt(): void;
  /** 旧 `enterFrenzy()`。 */
  feverStart(): void;
  /** 旧 `endFrenzy()`。 */
  feverEnd(): void;
  /** 旧 `gameOverNow()`。 */
  gameOver(): void;
}

/**
 * 表现层状态。
 *
 * 会话层（04b）持有它，每帧：应用效果事件 → 推进 → 读出 `FrameView` 需要的字段
 * （`effects` / `shake` / `playerFlash` / `screenFx`）。
 */
export class PresentationState {
  /** 粒子 / 刀光 / 冲击环 / 飘字。 */
  readonly effects = new EffectsPool();
  /** 屏幕震动强度。 */
  readonly shake = new ShakeState();
  /** 角色受击红闪强度（0 = 正常）。 */
  playerFlash = 0;

  /** 双生击破下砸动画的剩余时间（秒）；0 = 未播放。 */
  pairSmashT = 0;

  /**
   * 全屏特效状态 —— 表现层**拥有**它（色散强度、冲击波计时与中心）。
   *
   * 滤镜实例只创建一次（`src/battlefield/pixi/filters.ts`），
   * 靠这里插值出来的数值过渡，不重建实例。
   */
  private readonly fxState = {
    /** FEVER 色散强度（0 = 关闭，1 = 全强度）。 */
    rgbSplit: 0,
    /** 冲击波已播放时间（秒）。 */
    shockAge: 0,
    /** 冲击波强度档（0 = 无 / 1 = 暴击 / 2 = 双生同破）。 */
    shockLevel: 0,
    /** 冲击波中心 x（CSS 像素）。 */
    shockX: 0,
    /** 冲击波中心 y（CSS 像素）。 */
    shockY: 0,
  };

  /** FEVER 是否生效（由 `fever-start` / `fever-end` 事件驱动）。 */
  private feverActive = false;

  /** FEVER 周身火花的发射计时（秒）。 */
  private feverSparkT = 0;

  /** 战场布局 —— FEVER 周身火花要知道角色在哪。 */
  private layout: Layout | null = null;

  /** 批次签名（复用，零分配）。 */
  private readonly sig: BatchSignature = { crit: false, wave: 'none', waveX: 0, waveY: 0 };

  private readonly sink: EffectSink | null;

  constructor(sink: EffectSink | null = null) {
    this.sink = sink;
  }

  /** 全屏特效状态（只读）。 */
  get screenFx(): ScreenFx {
    return this.fxState;
  }

  /** FEVER 是否生效（表现层自己跟踪，不依赖规则层快照）。 */
  get isFeverActive(): boolean {
    return this.feverActive;
  }

  /**
   * 更新战场布局 —— FEVER 周身火花要知道角色的位置与半径。
   *
   * 会话层在 `resize()` 时调用（布局变了就得重新贴）。
   */
  setLayout(layout: Layout): void {
    this.layout = layout;
  }

  /**
   * 消费规则层的效果事件。
   *
   * 这一层是「效果事件 → 表现状态」的唯一入口，规则层不直接碰表现状态。
   */
  applyEffects(list: readonly Effect[]): void {
    if (list.length === 0) return;

    // FEVER 的开关**先**落实 —— 同一批里的爆散要用 FEVER 之后的形态。
    for (const e of list) {
      if (e.type === 'fever-start') this.feverActive = true;
      else if (e.type === 'fever-end') this.feverActive = false;
    }

    // 批次级视觉签名（零分配，结果写进复用的 `this.sig`）。
    classifyBatch(list, this.sig);
    const form = particleFormOf(this.sig, this.feverActive);
    const tier = ringTierOf(this.sig);

    for (const e of list) {
      switch (e.type) {
        case 'burst':
          this.effects.burst(e.x, e.y, e.color, e.count, e.power, form);
          break;
        case 'ring':
          this.effects.addRing(e.x, e.y, e.life, e.r0, e.r1, e.color, tier);
          break;
        case 'slash':
          this.effects.addSlash(e.x, e.x0, e.y, e.life, e.lane, 'main');
          // 暴击追加**余晖**：同几何、更长寿命、更淡的金色拖尾（票 07）。
          if (this.sig.crit) {
            this.effects.addSlash(
              e.x,
              e.x0,
              e.y,
              e.life * AFTERGLOW_LIFE_SCALE,
              e.lane,
              'afterglow',
            );
          }
          break;
        case 'soul-strike':
          // 灵魂分身：按住长条怪时点另一条轨，身体不动，灵魂飞出去代打。
          this.effects.addSoul(e.x0, e.y0, e.x, e.y, e.life, e.from, e.lane, e.hit, e.crit);
          break;
        case 'floater':
          this.effects.addFloater(e.x, e.y, e.text, e.color);
          break;
        case 'shake-add':
          this.shake.add(shakeTierOf(e.amount));
          break;
        case 'shake-max':
          this.shake.raiseTo(shakeTierOf(e.amount));
          break;
        case 'shake-set':
          this.shake.set(shakeTierOf(e.amount));
          break;
        case 'player-flash':
          this.playerFlash = 1;
          break;
        case 'toast':
          this.sink?.toast(e.text, e.color);
          break;
        case 'lane-flash':
          this.sink?.laneFlash(e.lane);
          break;
        case 'vibrate':
          this.sink?.vibrate(e.pattern);
          break;
        case 'hurt':
          this.sink?.hurt();
          break;
        case 'fever-start':
          this.sink?.feverStart();
          break;
        case 'fever-end':
          this.sink?.feverEnd();
          break;
        case 'pair-smash':
          this.pairSmashT = PAIR_SMASH_DUR;
          break;
        case 'game-over':
          this.sink?.gameOver();
          break;
        default:
          break;
      }
    }

    // 冲击波：暴击 / 双生同破时**瞬时触发**（重置计时，参数插值交给渲染层）。
    if (this.sig.wave !== 'none') {
      this.fxState.shockAge = 0;
      this.fxState.shockLevel = this.sig.wave === 'twin' ? 2 : 1;
      this.fxState.shockX = this.sig.waveX;
      this.fxState.shockY = this.sig.waveY;
    }
  }

  /**
   * 推进一帧。
   *
   * 衰减口径逐字照抄旧实现：
   * - 粒子 / 环 / 刀光 / 飘字：`source.html:1378-1381` 与 `1405-1408`
   * - 角色红闪：`playerFlash = Math.max(0, playerFlash - dt*2.4)`（`source.html:1388`）
   * - 震动：`shake *= Math.pow(0.001, dt)`，`< 0.2` 归零（`source.html:1389-1390`）
   *
   * 注意旧代码在 **paused 状态下粒子/环/刀光/飘字仍继续衰减**
   * （`stepVisualOnly`，`source.html:1400-1411`）—— 这里也是照抄的，
   * 暂停与否由上层决定要不要调用 `step()`。
   */
  step(dt: number): void {
    this.effects.step(dt);
    this.playerFlash = Math.max(0, this.playerFlash - dt * 2.4);
    this.pairSmashT = Math.max(0, this.pairSmashT - dt);
    this.shake.decay(dt);
    this.stepScreenFx(dt);
    this.stepFeverSparks(dt);
  }

  /** 清空（换局 / 重置）。 */
  reset(): void {
    this.effects.clear();
    this.shake.reset();
    this.playerFlash = 0;
    this.pairSmashT = 0;
    this.feverActive = false;
    this.feverSparkT = 0;
    this.fxState.rgbSplit = 0;
    this.fxState.shockAge = 0;
    this.fxState.shockLevel = 0;
    this.fxState.shockX = 0;
    this.fxState.shockY = 0;
  }

  // ── 内部 ──────────────────────────────────────────────────

  /** 色散强度插值 + 冲击波计时。 */
  private stepScreenFx(dt: number): void {
    // 色散：FEVER 期间爬到 1，结束后回落到 0（线性，0.35 秒走完）。
    const target = this.feverActive ? 1 : 0;
    const delta = target - this.fxState.rgbSplit;
    const maxStep = RGB_SPLIT_RATE * dt;
    this.fxState.rgbSplit += Math.abs(delta) <= maxStep ? delta : Math.sign(delta) * maxStep;

    // 冲击波：寿命走完就关掉（渲染层据此 `enabled = false`）。
    if (this.fxState.shockLevel > 0) {
      this.fxState.shockAge += dt;
      if (this.fxState.shockAge >= SHOCK_LIFE) {
        this.fxState.shockAge = 0;
        this.fxState.shockLevel = 0;
      }
    }
  }

  /**
   * FEVER 周身金色火花 —— 旧 `emitFrenzy`（`source.html:1238-1254`）。
   *
   * 旧实现是**规则层之外**的全局函数，由 `enterFrenzy` / `endFrenzy` 驱动；
   * 这里落在表现层：`fever-start` 事件开始发射，`fever-end` 停。
   *
   * 旧口径逐字保留：发射间隔 `rand(0.035, 0.08)` 秒、
   * 环半径 `playerR * rand(1.2, 2.1)`、速度 `vx = -rand(40, 160)` / `vy = rand(-70, 20)`、
   * 半径 `rand(1.4, 3.2)`、寿命 `rand(0.3, 0.7)`、颜色 35% 概率 `#fff4c2` 否则金色。
   */
  private stepFeverSparks(dt: number): void {
    if (!this.feverActive) return;
    this.feverSparkT -= dt;
    if (this.feverSparkT > 0) return;
    this.feverSparkT = FEVER_SPARK_MIN + Math.random() * (FEVER_SPARK_MAX - FEVER_SPARK_MIN);
    const layout = this.layout;
    if (!layout) return;
    this.effects.emitFeverSpark(layout.playerX, layout.height / 2, layout.playerR);
  }
}
