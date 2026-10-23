/**
 * 角色 —— 一个会走路的棒子人（本地玩法的 Pixi 移植）。
 *
 * 规则层只记录「角色驻守哪条轨道 / 是否在出招 / 双生下砸动画剩多久」，
 * 这里负责把这些状态翻译成动作：
 *
 * - **默认**：在下轨的地面上跑，脚底跟着轨道光带。
 * - **上轨**：从下轨跳进天空，约 1 秒的抛物线后受重力落回下轨；
 *   跳到最高点时脚底正好贴上轨，并向上挥棒（上勾式）。
 * - **下轨**：站在地上抡起后向下砸；若上跳途中改打下轨，会加速落地再砸。
 * - **双生击破**：大幅跳起，落到轨道上再狠狠下砸。
 * - **长按怪**：悬浮在对应轨道上方，棒子连续向下击打；结束后落回下轨。
 * - **换轨**：长按悬浮时平滑飞过去（腿随视觉时钟摆动）。
 *
 * 保留旧版角色已有的 FEVER 光环、脚下地面光、生命环与受击红闪。
 * 所有动作都由 `FrameContext` 的只读快照驱动，渲染层不持有规则状态。
 *
 * ## 容器结构
 *
 * ```
 * container（entities 层）
 * ├── shadowGfx    地面投影 + 走路尘土（世界坐标）
 * ├── bodyRoot     躯干变换（translate + rotate + scale）
 * │   ├── legsGfx
 * │   ├── swingGfx      挥棒弧线（在身体后面）
 * │   ├── ghostRoot0..2 三道淡棒影
 * │   ├── backArmGfx
 * │   ├── torsoGfx      躯干 + 头
 * │   ├── frontArmGfx
 * │   ├── batRoot       棒子原点（translate + rotate）
 * │   │   └── batGfx
 * │   └── flashGfx
 * ├── fxGfx        双生冲击环 / 落地尘环（世界坐标，画在身体之后）
 * └── hpGfx        生命环（世界坐标）
 *
 * haloGfx / platformGfx 不挂在 container 下 —— 渲染器把它们放进 `glow` 层，
 * 让 FEVER 光环与脚下地面光参与 bloom。
 * ```
 */

import { Container, Graphics, GraphicsPath } from 'pixi.js';
import type { FillGradient } from 'pixi.js';
import {
  ATTACK_DUR,
  CLUB_GRIP_R,
  CLUB_LEN_R,
  CLUB_PIVOT_X_R,
  FRENZY_LANE,
  LANE,
  TOP_AIR_TIME,
} from '../../game/constants';
import type { Lane } from '../../game/types';
import type { FrameContext } from './context';
import { destroyGradient, linearGradient, radialGradient } from './gradient';
import { FEET_OFFSET_R, laneGroundY } from './ground';
import {
  arcInto,
  attachPath,
  roundRectInto,
  setFill,
  setFillGradient,
  setStroke,
  starInto,
} from './gfx';
import { clamp, easeInOutCubic, easeOutCubic, lerp } from './math';
import { hexA } from './palette';

/** 待机时棒子搭在肩上的角度（弧度；0 = 指向右，负 = 向上）。 */
const IDLE_CLUB = -0.62;
/** 换轨平滑速度（每秒的指数逼近系数）。 */
const LANE_FOLLOW = 11;
/** 持续走路的步频（弧度/秒）。 */
const WALK_RATE = 13;
/** 长按连击的周期（秒）。 */
const HOLD_PERIOD = 0.24;
/** 从空中落回地面的重力（px/s²）—— 只用于 airT 结束后还没落地的情况。 */
const FALL_GRAVITY = 2400;
/** 落地压缩 / 尘环的持续时间（秒）。 */
const LAND_DUR = 0.18;

const SKIN = '#ffcf9f';
const SKIN_DARK = '#e2a76f';
const JERSEY = '#d94f4a';
const JERSEY_DARK = '#8f2f34';
const TRIM = '#f4ead6';
const PANTS = '#2a3f55';
const SHOE = '#ece4d2';
const CAP = '#14232f';
const CAP_BRIM = '#c9433f';
const BAT = '#e0a25e';
const BAT_DARK = '#a86b32';
const BAT_GRIP = '#3a2a20';

/* 凛的配色：青绿短打 + 紫裙 + 深紫长发。 */
const SKIN_F = '#ffd9c0';
const SKIN_F_DARK = '#e7b393';
const TOP_F = '#1f7a72';
const TOP_F_DARK = '#124b49';
const SASH_F = '#d44f7a';
const SKIRT_F = '#4b2a6b';
const SKIRT_F_DARK = '#2b1542';
const HAIR_F = '#2a1b2e';
const HAIR_F_LIGHT = '#5c3a66';
const LEGGING_F = '#211a2e';
const BOOT_F = '#7a5a92';
const SCYTHE_SHAFT = '#3b2c44';
const SCYTHE_METAL = '#c9b6d8';

/** 凛的刀光 / 残影：偏紫红。 */
const RIN_TRAIL = '#c84dff';
const RIN_IMPACT = '#ff4d9a';

/** 燃魂光环的参考脉冲 alpha。 */
const BURN_REF_ALPHA = 0.22;

const SIDES = [-1, 1] as const;

/** 挥棒残影的采样位置。 */
const GHOST_T = [0.42, 0.64, 0.86] as const;
/** 残影 alpha（与本地 Canvas 2D 版一致）。 */
const GHOST_ALPHA = [0.1, 0.15, 0.21] as const;

/** FEVER 光环渐变的参考脉冲值。 */
const HALO_REF_PULSE = 0.5;
/** FEVER 光环渐变在参考脉冲下的 alpha（`0.1 + pulse*0.08`）。 */
const HALO_REF_ALPHA = 0.1 + HALO_REF_PULSE * 0.08;
/** 脚下地面光渐变的参考 alpha。 */
const GLOW_REF_ALPHA = 0.16;

/**
 * 灵魂分身的单帧姿态。
 *
 * `SoulView` 直接复用 `PlayerView` 的全部身体绘制函数 —— 灵魂和本体
 * **同一套画法**（同一条腿 / 躯干 / 帽子 / 棒子），只是整体半透明、
 * 动作由这里的外部参数决定。这样「灵魂长什么样」永远跟着本体走，
 * 不会出现两套逐渐画歪的角色。
 */
export interface SoulPose {
  /** 身体中心的世界坐标。 */
  x: number;
  /** 身体中心的世界坐标。 */
  y: number;
  /** 相对本体的大小（1 = 与本体相同）。 */
  scale: number;
  /** 整体透明度（0..1）。 */
  alpha: number;
  /** 身体前倾（弧度）。 */
  rot: number;
  /** 收腿程度（0 = 站立，1 = 收满）。 */
  legTuck: number;
  /** 棒子角度（弧度；0 = 指向右，负 = 向上）。 */
  batA: number;
  /** 挥击残影的起始角（与 `batA` 一起决定残影弧）。 */
  trailFrom: number;
  /** 残影强度（0..1）。 */
  trail: number;
  /** 棒尖击打闪光强度（0..1）。 */
  impact: number;
}

export class PlayerView {
  /** 容器（挂到 `entities` 层）。 */
  readonly container = new Container();
  /** FEVER 光环（挂到 `glow` 层，参与 bloom）。 */
  readonly haloGfx = new Graphics();
  /** 脚下地面光（挂到 `glow` 层，参与 bloom）。 */
  readonly platformGfx = new Graphics();

  private readonly shadowGfx = new Graphics();
  private readonly bodyRoot = new Container();
  private readonly legsGfx = new Graphics();
  private readonly hairBackGfx = new Graphics();
  private readonly swingGfx = new Graphics();
  private readonly ghostRoots: Container[] = [];
  private readonly ghostGfx: Graphics[] = [];
  private readonly backArmGfx = new Graphics();
  private readonly torsoGfx = new Graphics();
  private readonly frontArmGfx = new Graphics();
  private readonly batRoot = new Container();
  private readonly batGfx = new Graphics();
  private readonly flashGfx = new Graphics();
  private readonly fxGfx = new Graphics();
  private readonly hpGfx = new Graphics();

  // ── 复用路径 ─────────────────────────────────────────────
  private readonly torsoPath = new GraphicsPath();
  private readonly headPath = new GraphicsPath();
  private readonly hatPath = new GraphicsPath();
  private readonly hairPath = new GraphicsPath();
  private readonly skirtPath = new GraphicsPath();
  private readonly bladePath = new GraphicsPath();
  private readonly flashPath = new GraphicsPath();
  private readonly hpPath = new GraphicsPath();
  private readonly haloArcPath = new GraphicsPath();
  private readonly swingArcPath = new GraphicsPath();
  private readonly batBodyPath = new GraphicsPath();
  private readonly ghostBatPath = new GraphicsPath();
  private readonly starPath = new GraphicsPath();
  private readonly shoePath = new GraphicsPath();

  // ── 渐变（复用，不每帧重建） ──────────────────────────────
  private bodyGradient: FillGradient | null = null;
  private bodyGradientF: FillGradient | null = null;
  private skirtGradient: FillGradient | null = null;
  private batGradient: FillGradient | null = null;
  private scytheGradient: FillGradient | null = null;
  private haloGradient: FillGradient | null = null;
  private burnGradient: FillGradient | null = null;
  private glowGradient: FillGradient | null = null;

  // ── 动作状态（渲染层内部，只跟视觉有关） ───────────────────
  /** 本帧是否画凛（女性外观 + 镰刀）。 */
  private female = false;
  /** 平滑后的身体中心纵坐标（换轨时走过去，而不是瞬移）。 */
  private displayY = Number.NaN;
  /** 上一帧的视觉时钟（用来算 dt；`vt` 在所有阶段都推进）。 */
  private lastVt = -1;
  /** 上一帧的游戏时间（检测新一局）。 */
  private lastNow = 0;
  /** 滞空结束后仍在空中时的下落速度（px/s）。 */
  private fallV = 0;
  /** 上一帧是否在空中（用于落地反馈）。 */
  private airborne = false;
  /** 落地压缩 / 尘环剩余时间（秒）。 */
  private landT = 0;

  constructor() {
    this.container.addChild(this.shadowGfx);
    this.container.addChild(this.bodyRoot);
    this.container.addChild(this.fxGfx);
    this.container.addChild(this.hpGfx);

    this.bodyRoot.addChild(this.legsGfx);
    this.bodyRoot.addChild(this.hairBackGfx);
    this.bodyRoot.addChild(this.swingGfx);
    for (let i = 0; i < GHOST_T.length; i++) {
      const root = new Container();
      const gfx = new Graphics();
      root.addChild(gfx);
      this.bodyRoot.addChild(root);
      this.ghostRoots.push(root);
      this.ghostGfx.push(gfx);
    }
    this.bodyRoot.addChild(this.backArmGfx);
    this.bodyRoot.addChild(this.torsoGfx);
    this.bodyRoot.addChild(this.frontArmGfx);
    this.bodyRoot.addChild(this.batRoot);
    this.batRoot.addChild(this.batGfx);
    this.bodyRoot.addChild(this.flashGfx);
  }

  prepare(): void {
    if (this.bodyGradient) return;
    // 躯干渐变：斜向（左上 → 右下）。
    this.bodyGradient = linearGradient(
      [
        { offset: 0, color: '#ef6a5f' },
        { offset: 0.55, color: JERSEY },
        { offset: 1, color: JERSEY_DARK },
      ],
      0,
      0,
      1,
      1,
    );
    // 棒身渐变：横向（上亮下暗）。
    this.batGradient = linearGradient(
      [
        { offset: 0, color: '#f0c088' },
        { offset: 0.45, color: BAT },
        { offset: 1, color: BAT_DARK },
      ],
      0,
      0,
      0,
      1,
    );
    // 凛的上衣渐变（青绿）。
    this.bodyGradientF = linearGradient(
      [
        { offset: 0, color: '#35a99c' },
        { offset: 0.55, color: TOP_F },
        { offset: 1, color: TOP_F_DARK },
      ],
      0,
      0,
      1,
      1,
    );
    // 紫裙渐变。
    this.skirtGradient = linearGradient(
      [
        { offset: 0, color: SKIRT_F },
        { offset: 1, color: SKIRT_F_DARK },
      ],
      0,
      0,
      0,
      1,
    );
    // 镰刀刃：紫红金属。
    this.scytheGradient = linearGradient(
      [
        { offset: 0, color: '#ff9ad5' },
        { offset: 0.45, color: RIN_IMPACT },
        { offset: 1, color: '#7a2fd0' },
      ],
      0,
      0,
      1,
      1,
    );
    // FEVER 光环：内圈透明 → 0.55 处最亮 → 外圈透明。
    this.haloGradient = radialGradient(
      [
        { offset: 0, color: 'rgba(255,210,74,0)' },
        { offset: 0.55, color: `rgba(255,210,74,${HALO_REF_ALPHA})` },
        { offset: 1, color: 'rgba(255,140,40,0)' },
      ],
      0.5,
      0.5,
      0,
      0.5,
    );
    // 脚下地面光。
    this.glowGradient = radialGradient(
      [
        { offset: 0, color: `rgba(96,200,255,${GLOW_REF_ALPHA})` },
        { offset: 1, color: 'rgba(96,200,255,0)' },
      ],
      0.5,
      0.5,
      0,
      0.5,
    );
    // 燃魂光环：品红 → 紫，外圈透明。
    this.burnGradient = radialGradient(
      [
        { offset: 0, color: 'rgba(255,122,192,0)' },
        { offset: 0.55, color: `rgba(255,77,141,${BURN_REF_ALPHA})` },
        { offset: 1, color: 'rgba(150,60,255,0)' },
      ],
      0.5,
      0.5,
      0,
      0.5,
    );
  }

  draw(fc: FrameContext): void {
    const { playerR: s, playerX } = fc.layout;
    this.female = fc.characterId === 'rin';

    const dt = this.frameDt(fc);

    // 新一局：游戏时间归零，清掉上一局残留的滞空 / 下落状态。
    if (fc.now + 0.01 < this.lastNow) {
      this.displayY = Number.NaN;
      this.fallV = 0;
      this.landT = 0;
      this.airborne = false;
    }
    this.lastNow = fc.now;
    if (this.landT > 0) this.landT = Math.max(0, this.landT - dt);

    const bottomY = fc.layout.laneY.bottom;
    const topY = fc.layout.laneY.top;
    const lane = fc.playerLane ?? 'bottom';
    const airT = clamp(fc.playerAirT, 0, TOP_AIR_TIME);
    const jumping = airT > 0;
    const groundFeet = laneGroundY(fc.layout, 'bottom');

    /* ---------- 重力：上跳抛物线 / 下落 ---------- */
    const targetY = lane === 'top' ? topY : bottomY;
    let y: number;
    let falling = false;

    if (jumping) {
      // 从下轨起跳：0.5 秒到最高点（脚底贴上轨），1 秒落回下轨。
      const p = 1 - airT / TOP_AIR_TIME;
      y = bottomY - (bottomY - topY) * 4 * p * (1 - p);
      this.displayY = y;
      this.fallV = 0;
    } else if (lane === 'bottom' && this.displayY > bottomY + 0.5) {
      // airT 被下轨出招打断 / 长按结束：还在空中，受重力落回地面。
      falling = true;
      if (dt > 0) {
        this.fallV += FALL_GRAVITY * dt;
        this.displayY = Math.min(bottomY, this.displayY + this.fallV * dt);
      }
      y = this.displayY;
    } else {
      y = this.followLane(targetY, dt);
      this.fallV = 0;
    }

    const airborneNow = jumping || falling;
    if (this.airborne && !airborneNow && lane === 'bottom') this.landT = LAND_DUR;
    this.airborne = airborneNow;

    /* ---------- 当前动作 ---------- */
    const hm = fc.holdMonster;
    const hold =
      hm && hm.anchored && !hm.escaped && (fc.playerLane === null || hm.lane === fc.playerLane)
        ? hm
        : null;
    const attackActive = fc.attackT > 0 && fc.attackLane !== null;
    const pairP = clamp(fc.pairSmash, 0, 1);

    // 只有踩在下轨地面上时才算「在走」；空中 / 悬浮 / 出招都暂停步态。
    const onGround = lane === 'bottom' && !jumping && !falling && Math.abs(y - bottomY) < 1.5;
    const walking = fc.phase === 'running' && !attackActive && !hold && pairP === 0 && onGround;
    const laneWalk = clamp(Math.abs(targetY - y) / (s * 0.8), 0, 1);
    const walkAmp = jumping || falling || hold ? 0 : Math.max(laneWalk, walking ? 1 : 0);
    const walkPhase = fc.now * WALK_RATE;

    /* ---------- 姿态参数 ---------- */
    let lift = 0; // 负值 = 跳起
    let hover = 0; // 长按悬浮
    let squash = 0; // 落地压缩
    let bodyRot = 0;
    let clubA = IDLE_CLUB + Math.sin(fc.vt * 2.2) * 0.04;
    let trailFrom = clubA;
    let trail = 0;
    let impact = 0;
    let legTuck = 0;

    if (pairP > 0) {
      // 双生击破：蓄力 → 大幅跳起 → 落下时把棒子砸到底。
      if (pairP < 0.16) {
        squash = Math.sin(Math.PI * (pairP / 0.16)) * 0.7;
        clubA = lerp(IDLE_CLUB, -1.95, easeOutCubic(pairP / 0.16));
      } else if (pairP < 0.58) {
        const k = easeOutCubic((pairP - 0.16) / 0.42);
        lift = -s * 2.5 * k;
        legTuck = k;
        clubA = -1.95;
      } else if (pairP < 0.8) {
        const k = (pairP - 0.58) / 0.22;
        lift = -s * 2.5 * (1 - k * k * k);
        legTuck = 1 - k;
        clubA = lerp(-1.95, 1.25, k * k);
        trailFrom = -1.95;
        trail = k;
        impact = clamp((pairP - 0.72) / 0.06, 0, 1);
        bodyRot = 0.16 * k;
      } else {
        squash = 1 - easeOutCubic((pairP - 0.8) / 0.2);
        impact = 1 - clamp((pairP - 0.8) / 0.14, 0, 1);
        trail = 1 - clamp((pairP - 0.8) / 0.12, 0, 1);
        clubA = lerp(1.25, IDLE_CLUB, easeInOutCubic((pairP - 0.82) / 0.18));
      }
    } else if (hold) {
      // 长按：悬浮在轨道上方，按固定周期连续向下敲击。
      hover = -s * 1.15 + Math.sin(fc.vt * 4.6) * s * 0.05;
      legTuck = 0.9;
      bodyRot = 0.05;
      if (hold.holding) {
        const h = ((fc.vt + 0.13) % HOLD_PERIOD) / HOLD_PERIOD;
        if (h < 0.45) {
          const k = easeOutCubic(h / 0.45);
          clubA = lerp(-1.5, 1.15, k);
          trailFrom = -1.5;
          trail = k;
        } else {
          const k = easeInOutCubic((h - 0.45) / 0.55);
          clubA = lerp(1.15, -1.5, k);
        }
        impact = h > 0.32 && h < 0.6 ? 1 - Math.abs(h - 0.46) / 0.14 : 0;
      } else {
        // 暂停 / 续按宽限：举棒等待。
        clubA = -1.35 + Math.sin(fc.vt * 3) * 0.05;
      }
    } else if (attackActive) {
      const T = clamp(1 - fc.attackT / ATTACK_DUR, 0, 1);
      if (fc.attackLane === 'top') {
        // 上轨：高度由滞空抛物线控制，这里只负责向上挥棒。
        if (T < 0.18) {
          squash = Math.sin(Math.PI * (T / 0.18)) * 0.55;
          clubA = lerp(IDLE_CLUB, 0.75, easeOutCubic(T / 0.18));
        } else if (T < 0.42) {
          const k = easeOutCubic((T - 0.18) / 0.24);
          clubA = lerp(0.75, -1.05, k);
          trailFrom = 0.75;
          trail = k;
          impact = clamp((T - 0.34) / 0.06, 0, 1);
        } else {
          clubA = T < 0.6 ? -1.05 : lerp(-1.05, IDLE_CLUB, easeInOutCubic((T - 0.6) / 0.4));
          impact = 1 - clamp((T - 0.42) / 0.2, 0, 1);
        }
      } else {
        // 下轨：抡到头顶 → 向下砸。
        if (T < 0.2) {
          clubA = lerp(IDLE_CLUB, -1.95, easeOutCubic(T / 0.2));
          squash = Math.sin(Math.PI * (T / 0.2)) * 0.25;
        } else if (T < 0.4) {
          const k = easeInOutCubic((T - 0.2) / 0.2);
          clubA = lerp(-1.95, 1.2, k);
          trailFrom = -1.95;
          trail = k;
          squash = k;
          bodyRot = 0.13 * k;
          impact = clamp((T - 0.34) / 0.05, 0, 1);
        } else {
          const k = easeInOutCubic((T - 0.4) / 0.6);
          clubA = lerp(1.2, IDLE_CLUB, k);
          squash = 1 - k;
          bodyRot = 0.13 * (1 - k);
          impact = 1 - clamp((T - 0.44) / 0.24, 0, 1);
        }
      }
    }

    // 滞空姿态：收腿、身体随上升 / 下落微微前倾。
    if (jumping) {
      const p = 1 - airT / TOP_AIR_TIME;
      legTuck = Math.max(legTuck, p < 0.55 ? 0.9 : 0.55);
      bodyRot += p < 0.5 ? -0.06 : 0.06;
    } else if (falling) {
      legTuck = Math.max(legTuck, 0.35);
      bodyRot += 0.05;
    }

    // 落地压缩：身体略微压扁、重心下沉。
    if (this.landT > 0) squash = Math.max(squash, (this.landT / LAND_DUR) * 0.45);
    lift += squash * s * 0.1;
    const bob =
      jumping || falling
        ? 0
        : Math.sin(fc.vt * 2.2) * s * 0.03 + Math.abs(Math.sin(walkPhase)) * s * 0.035 * walkAmp;

    const actionLane =
      pairP > 0
        ? (fc.playerLane ?? 'bottom')
        : hold
          ? hold.lane
          : attackActive
            ? (fc.attackLane ?? lane)
            : lane;
    const laneColor = fc.frenzyActive ? FRENZY_LANE[actionLane] : LANE[actionLane].color;

    /* ---------- 脚下地面光（glow 层） ---------- */
    this.drawGroundGlow(fc, playerX, groundFeet, s, lane, jumping, falling);

    /* ---------- 身体 ---------- */
    const bodyY = y + hover + lift + bob;

    /* ---------- 地面投影 + 走路尘土 ---------- */
    this.drawShadowAndDust(fc, playerX, bodyY, s, groundFeet, topY, walking, walkPhase);

    const pivotX = s * CLUB_PIVOT_X_R;
    const pivotY = -s * 0.26;
    const gripDist = s * CLUB_GRIP_R;
    const gripX = pivotX + Math.cos(clubA) * gripDist;
    const gripY = pivotY + Math.sin(clubA) * gripDist;

    /* ---------- FEVER 光环（glow 层） ---------- */
    this.drawFever(fc, playerX, bodyY, s);

    /* ---------- 身体变换 ---------- */
    const stretch = 1 + squash * 0.05;
    this.bodyRoot.position.set(playerX, bodyY);
    this.bodyRoot.rotation = bodyRot;
    this.bodyRoot.scale.set(1 / stretch, stretch);

    // 腿（在躯干后面）。
    this.drawLegs(s, walkAmp, walkPhase, legTuck);
    this.drawHairBack(fc, s, jumping || falling);

    // 挥棒残影（在身体后面）。
    this.drawSwingGhosts(s, pivotX, pivotY, gripDist, trailFrom, clubA, laneColor, trail);

    const skin = this.female ? SKIN_F : SKIN;
    const skinDark = this.female ? SKIN_F_DARK : SKIN_DARK;
    const sleeve = this.female ? TOP_F : JERSEY;
    const sleeveDark = this.female ? TOP_F_DARK : JERSEY_DARK;

    // 后手（深色）。
    this.drawArm(this.backArmGfx, s, -s * 0.28, -s * 0.3, gripX, gripY, skinDark, sleeveDark);

    // 躯干 + 头。
    this.drawTorso(s);
    this.drawHead(fc, s);

    // 前手 + 棒子。
    this.drawArm(this.frontArmGfx, s, s * 0.1, -s * 0.3, gripX, gripY, skin, sleeve);
    this.drawWeapon(s, gripX, gripY, clubA, trail, impact, laneColor);

    // 受击红闪。
    this.drawFlash(fc.playerFlash, s);

    /* ---------- 双生落地的冲击环 / 落地的尘环 ---------- */
    this.fxGfx.clear();
    this.drawPairRing(playerX, y, s, pairP);
    this.drawLandRing(playerX, groundFeet, s);

    /* ---------- 生命环 ---------- */
    this.drawHpRing(fc, playerX, bodyY, s);
  }

  /**
   * 画「灵魂分身」的一帧 —— 与 `draw()` **共用全部身体部件**：
   * 腿、挥棒残影、后手 / 躯干 / 头 / 前手 / 棒子都是同一套函数，
   * 所以灵魂看起来就是本体本人，只是整体半透明（`pose.alpha`）。
   *
   * 分身不参与世界层反馈（地面投影 / 尘土 / 生命环 / FEVER 光环 / 受击红闪），
   * 这些 `Graphics` 每次都清空；动作状态也全部由 `pose` 传入 ——
   * 这里不读 `fc.playerLane` / `fc.attackT`，不会和本体抢动作。
   */
  drawSoulPose(fc: FrameContext, lane: Lane, pose: SoulPose): void {
    const s = fc.layout.playerR * pose.scale;
    const laneColor = fc.frenzyActive ? FRENZY_LANE[lane] : LANE[lane].color;
    this.female = fc.characterId === 'rin';

    // 清掉分身不该有的世界层反馈（这些 Graphics 只属于本体）。
    this.shadowGfx.clear();
    this.fxGfx.clear();
    this.hpGfx.clear();
    this.haloGfx.clear();
    this.platformGfx.clear();
    this.flashGfx.clear();

    this.container.alpha = clamp(pose.alpha, 0, 1);
    this.container.visible = this.container.alpha > 0.01;

    const pivotX = s * CLUB_PIVOT_X_R;
    const pivotY = -s * 0.26;
    const gripDist = s * CLUB_GRIP_R;
    const gripX = pivotX + Math.cos(pose.batA) * gripDist;
    const gripY = pivotY + Math.sin(pose.batA) * gripDist;

    // 身体变换（与 `draw()` 相同的容器层级）。
    this.bodyRoot.position.set(pose.x, pose.y);
    this.bodyRoot.rotation = pose.rot;
    this.bodyRoot.scale.set(1, 1);

    // 腿（在躯干后面）。
    this.drawLegs(s, 0, 0, pose.legTuck);
    this.drawHairBack(fc, s, pose.legTuck > 0.3);

    // 挥棒残影（在身体后面）。
    this.drawSwingGhosts(
      s,
      pivotX,
      pivotY,
      gripDist,
      pose.trailFrom,
      pose.batA,
      laneColor,
      pose.trail,
    );

    const skin = this.female ? SKIN_F : SKIN;
    const skinDark = this.female ? SKIN_F_DARK : SKIN_DARK;
    const sleeve = this.female ? TOP_F : JERSEY;
    const sleeveDark = this.female ? TOP_F_DARK : JERSEY_DARK;

    // 后手（深色）。
    this.drawArm(this.backArmGfx, s, -s * 0.28, -s * 0.3, gripX, gripY, skinDark, sleeveDark);

    // 躯干 + 头。
    this.drawTorso(s);
    this.drawHead(fc, s);

    // 前手 + 棒子。
    this.drawArm(this.frontArmGfx, s, s * 0.1, -s * 0.3, gripX, gripY, skin, sleeve);
    this.drawWeapon(s, gripX, gripY, pose.batA, pose.trail, pose.impact, laneColor);
  }

  destroy(): void {
    destroyGradient(this.bodyGradient);
    destroyGradient(this.bodyGradientF);
    destroyGradient(this.skirtGradient);
    destroyGradient(this.batGradient);
    destroyGradient(this.scytheGradient);
    destroyGradient(this.haloGradient);
    destroyGradient(this.burnGradient);
    destroyGradient(this.glowGradient);
    this.bodyGradient = null;
    this.bodyGradientF = null;
    this.skirtGradient = null;
    this.batGradient = null;
    this.scytheGradient = null;
    this.haloGradient = null;
    this.burnGradient = null;
    this.glowGradient = null;
  }

  /* ------------------------------------------------------------------ *
   * 位置 / 姿态辅助
   * ------------------------------------------------------------------ */

  /** 每帧步长：用视觉时钟算，暂停时为 0（滞空 / 下落也跟着冻结）。 */
  private frameDt(fc: FrameContext): number {
    const vt = fc.vt;
    const raw = this.lastVt < 0 ? 1 / 60 : clamp(vt - this.lastVt, 0, 0.05);
    this.lastVt = vt;
    return fc.phase === 'paused' ? 0 : raw;
  }

  /** 换轨平滑：指数逼近目标轨道中心。 */
  private followLane(target: number, dt: number): number {
    if (Number.isNaN(this.displayY)) {
      this.displayY = target;
      return target;
    }
    const k = 1 - Math.exp(-dt * LANE_FOLLOW);
    this.displayY += (target - this.displayY) * k;
    if (Math.abs(target - this.displayY) < 0.25) this.displayY = target;
    return this.displayY;
  }

  /* ------------------------------------------------------------------ *
   * 世界坐标绘制
   * ------------------------------------------------------------------ */

  /** 脚下地面光 —— 只在踩在下轨地面上时出现。 */
  private drawGroundGlow(
    fc: FrameContext,
    x: number,
    groundFeet: number,
    s: number,
    lane: 'top' | 'bottom',
    jumping: boolean,
    falling: boolean,
  ): void {
    const g = this.platformGfx;
    g.clear();
    if (!this.glowGradient || lane !== 'bottom' || jumping || falling) return;
    setFillGradient(g, this.glowGradient, 1);
    g.beginPath();
    g.ellipse(x, groundFeet, s * 1.65, s * 0.3);
    g.fill();
    void fc;
  }

  /** 地面投影 + 走路尘土。 */
  private drawShadowAndDust(
    fc: FrameContext,
    playerX: number,
    bodyY: number,
    s: number,
    groundFeet: number,
    topY: number,
    walking: boolean,
    walkPhase: number,
  ): void {
    const g = this.shadowGfx;
    g.clear();

    const feetWorld = bodyY + s * FEET_OFFSET_R;
    const maxLift = Math.max(1, groundFeet - (topY + s * FEET_OFFSET_R));
    const hk = clamp((groundFeet - feetWorld) / maxLift, 0, 1);
    if (hk > 0.02) {
      const rx = s * (0.62 - 0.3 * hk);
      setFill(g, 'rgba(0,0,0,1)', 0.3 - 0.12 * hk);
      g.beginPath();
      g.ellipse(playerX, groundFeet, rx, rx * 0.24);
      g.fill();
    }

    // 走路时在身后扬起一点尘土，让「在地面上走」更明确。
    if (walking) {
      const footLine = bodyY + s * FEET_OFFSET_R;
      const cycle = (walkPhase / (Math.PI * 2)) % 1;
      for (let i = 0; i < 2; i++) {
        const age = (cycle + i * 0.5) % 1;
        const px = playerX - s * (0.3 + age * 1.0);
        const py = footLine + s * 0.02 - Math.sin(age * Math.PI) * s * 0.03;
        const r = s * (0.05 + age * 0.11);
        setFill(g, 'rgb(150,195,205)', (1 - age) * 0.14);
        g.beginPath();
        g.ellipse(px, py, r, r * 0.55);
        g.fill();
      }
    }
    void fc;
  }

  /** 双生落地的冲击环。 */
  private drawPairRing(x: number, y: number, s: number, pairP: number): void {
    const g = this.fxGfx;
    if (!(pairP > 0.72 && pairP < 1)) return;
    const k = clamp((pairP - 0.72) / 0.28, 0, 1);
    setStroke(g, 2.5, 'rgba(255,255,255,1)', (1 - k) * 0.55);
    g.beginPath();
    g.ellipse(x, y + s * 1.15, s * (0.5 + 1.7 * k), s * (0.12 + 0.4 * k));
    g.stroke();
  }

  /** 落地的尘环。 */
  private drawLandRing(x: number, groundFeet: number, s: number): void {
    if (this.landT <= 0) return;
    const g = this.fxGfx;
    const k = 1 - this.landT / LAND_DUR;
    setStroke(g, 1.5, 'rgb(200,230,220)', (1 - k) * 0.3);
    g.beginPath();
    g.ellipse(x, groundFeet, s * (0.7 + 1.2 * k), s * (0.16 + 0.24 * k));
    g.stroke();
  }

  /* ------------------------------------------------------------------ *
   * 身体（bodyRoot 局部坐标）
   * ------------------------------------------------------------------ */

  /** 双腿：走路时前后摆，跳起 / 悬浮时收腿。 */
  private drawLegs(s: number, walkAmp: number, step: number, tuck: number): void {
    const g = this.legsGfx;
    g.clear();
    const hipY = s * 0.24;
    const footY = s * FEET_OFFSET_R - tuck * s * 0.16;
    const swing = Math.sin(step) * 0.26 * walkAmp;
    const lift = tuck * s * 0.18;
    const legCol = this.female ? LEGGING_F : PANTS;
    const bootCol = this.female ? BOOT_F : SHOE;
    const legW = s * (this.female ? 0.17 : 0.21);

    for (const sgn of SIDES) {
      const phase = sgn * swing;
      const hipX = sgn * s * 0.15;
      const footX = sgn * s * 0.2 + phase * s + tuck * s * 0.18;
      const kneeX = (hipX + footX) / 2 + sgn * s * 0.02;
      const kneeY = (hipY + footY - lift) / 2;

      setStroke(g, legW, legCol, 1, 'round');
      g.beginPath();
      g.moveTo(hipX, hipY);
      g.quadraticCurveTo(kneeX, kneeY, footX, footY - lift);
      g.stroke();

      // 地面偏暗，给腿加一道轮廓光，避免和地面糊在一起。
      setStroke(
        g,
        s * 0.045,
        this.female ? 'rgba(205,170,240,.24)' : 'rgba(170,215,245,.2)',
        1,
        'round',
      );
      g.beginPath();
      g.moveTo(hipX - s * 0.055, hipY + s * 0.04);
      g.quadraticCurveTo(kneeX - s * 0.055, kneeY, footX - s * 0.055, footY - lift - s * 0.03);
      g.stroke();

      // 鞋。
      setFill(g, bootCol);
      this.shoePath.clear();
      roundRectInto(
        this.shoePath,
        footX - s * 0.16,
        footY - lift - s * 0.05,
        s * 0.34,
        s * 0.14,
        s * 0.06,
      );
      attachPath(g, this.shoePath);
      g.fill();
      setStroke(g, s * 0.035, this.female ? '#1b1226' : '#22303c');
      g.beginPath();
      g.moveTo(footX - s * 0.14, footY - lift + s * 0.07);
      g.lineTo(footX + s * 0.16, footY - lift + s * 0.07);
      g.stroke();
    }
  }

  /** 躯干：红色球衣 + 奶油色条纹。 */
  private drawTorso(s: number): void {
    if (this.female) {
      this.drawTorsoFemale(s);
      return;
    }
    const g = this.torsoGfx;
    g.clear();

    this.torsoPath.clear();
    this.torsoPath.moveTo(-s * 0.4, -s * 0.46);
    this.torsoPath.quadraticCurveTo(0, -s * 0.58, s * 0.4, -s * 0.46);
    this.torsoPath.lineTo(s * 0.3, s * 0.26);
    this.torsoPath.quadraticCurveTo(0, s * 0.36, -s * 0.3, s * 0.26);
    this.torsoPath.closePath();
    if (this.bodyGradient) {
      setFillGradient(g, this.bodyGradient, 1);
    } else {
      setFill(g, JERSEY);
    }
    attachPath(g, this.torsoPath);
    g.fill();
    setStroke(g, s * 0.045, 'rgba(40,16,20,.55)');
    attachPath(g, this.torsoPath);
    g.stroke();

    // 奶油色胸带。
    setStroke(g, s * 0.075, TRIM);
    g.beginPath();
    g.moveTo(-s * 0.33, -s * 0.06);
    g.quadraticCurveTo(0, s * 0.02, s * 0.33, -s * 0.06);
    g.stroke();

    // 领口。
    setStroke(g, s * 0.05, '#3a1519');
    g.beginPath();
    g.arc(0, -s * 0.46, s * 0.16, 0.15, Math.PI - 0.15);
    g.stroke();

    // 背号（一个简单的 7）。
    setStroke(g, s * 0.035, 'rgba(244,234,214,.85)', 1, 'round');
    g.beginPath();
    g.moveTo(-s * 0.11, s * 0.06);
    g.lineTo(s * 0.1, s * 0.02);
    g.lineTo(-s * 0.03, s * 0.2);
    g.stroke();
    g.beginPath();
    g.moveTo(-s * 0.13, s * 0.2);
    g.lineTo(s * 0.06, s * 0.24);
    g.stroke();
  }

  /** 凛的躯干：青绿短打 + 紫裙 + 粉色腰带。 */
  private drawTorsoFemale(s: number): void {
    const g = this.torsoGfx;
    g.clear();

    // 紫裙（先画，短打压住腰线）。
    this.skirtPath.clear();
    this.skirtPath.moveTo(-s * 0.27, s * 0.1);
    this.skirtPath.lineTo(-s * 0.47, s * 0.44);
    this.skirtPath.quadraticCurveTo(0, s * 0.55, s * 0.47, s * 0.44);
    this.skirtPath.lineTo(s * 0.27, s * 0.1);
    this.skirtPath.closePath();
    if (this.skirtGradient) {
      setFillGradient(g, this.skirtGradient, 1);
    } else {
      setFill(g, SKIRT_F);
    }
    attachPath(g, this.skirtPath);
    g.fill();
    setStroke(g, s * 0.04, 'rgba(24,10,38,.7)');
    attachPath(g, this.skirtPath);
    g.stroke();

    // 裙摆褶皱。
    setStroke(g, s * 0.026, 'rgba(196,150,232,.4)', 1, 'round');
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(s * i * 0.1, s * 0.14);
      g.quadraticCurveTo(s * i * 0.17, s * 0.32, s * i * 0.22, s * 0.46);
      g.stroke();
    }

    // 上衣：窄肩收腰。
    this.torsoPath.clear();
    this.torsoPath.moveTo(-s * 0.33, -s * 0.46);
    this.torsoPath.quadraticCurveTo(0, -s * 0.57, s * 0.33, -s * 0.46);
    this.torsoPath.lineTo(s * 0.25, s * 0.12);
    this.torsoPath.quadraticCurveTo(0, s * 0.2, -s * 0.25, s * 0.12);
    this.torsoPath.closePath();
    if (this.bodyGradientF) {
      setFillGradient(g, this.bodyGradientF, 1);
    } else {
      setFill(g, TOP_F);
    }
    attachPath(g, this.torsoPath);
    g.fill();
    setStroke(g, s * 0.04, 'rgba(8,34,34,.65)');
    attachPath(g, this.torsoPath);
    g.stroke();

    // 交领。
    setStroke(g, s * 0.055, '#d8f2e8', 1, 'round');
    g.beginPath();
    g.moveTo(-s * 0.17, -s * 0.44);
    g.lineTo(0, -s * 0.26);
    g.lineTo(s * 0.18, -s * 0.44);
    g.stroke();
    setStroke(g, s * 0.028, 'rgba(8,34,34,.5)');
    g.beginPath();
    g.moveTo(-s * 0.17, -s * 0.44);
    g.lineTo(0, -s * 0.26);
    g.lineTo(s * 0.18, -s * 0.44);
    g.stroke();

    // 腰带 + 侧边结。
    setFill(g, SASH_F);
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.28, s * 0.08, s * 0.56, s * 0.11, s * 0.04);
    attachPath(g, this.headPath);
    g.fill();
    setFill(g, '#ff7ba6');
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.3, s * 0.15, s * 0.12, s * 0.1, s * 0.035);
    attachPath(g, this.headPath);
    g.fill();
    setStroke(g, s * 0.025, 'rgba(90,20,45,.55)');
    g.beginPath();
    g.moveTo(-s * 0.28, s * 0.1);
    g.lineTo(-s * 0.28, s * 0.18);
    g.stroke();
  }

  /** 头：棒球帽 + 侧脸。 */
  private drawHead(fc: FrameContext, s: number): void {
    if (this.female) {
      this.drawHeadFemale(fc, s);
      return;
    }
    const g = this.torsoGfx;
    const hx = s * 0.04;
    const hy = -s * 0.78;
    const hr = s * 0.28;

    // 脖子。
    setFill(g, SKIN_DARK);
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.09, -s * 0.58, s * 0.2, s * 0.18, s * 0.05);
    attachPath(g, this.headPath);
    g.fill();

    // 脸。
    setFill(g, SKIN);
    g.beginPath();
    g.circle(hx, hy, hr);
    g.fill();
    setStroke(g, s * 0.035, 'rgba(90,50,30,.5)');
    g.beginPath();
    g.circle(hx, hy, hr);
    g.stroke();

    // 耳朵。
    setFill(g, SKIN);
    g.beginPath();
    g.circle(hx - hr * 0.92, hy + hr * 0.14, s * 0.075);
    g.fill();
    setStroke(g, s * 0.025, 'rgba(90,50,30,.35)');
    g.beginPath();
    g.circle(hx - hr * 0.92, hy + hr * 0.14, s * 0.075);
    g.stroke();

    // 帽顶。
    setFill(g, CAP);
    this.hatPath.clear();
    this.hatPath.moveTo(hx - hr * 1.02, hy - s * 0.04);
    this.hatPath.arc(hx, hy - s * 0.04, hr * 1.02, Math.PI, Math.PI * 2);
    this.hatPath.closePath();
    attachPath(g, this.hatPath);
    g.fill();
    setFill(g, CAP_BRIM);
    this.hatPath.clear();
    roundRectInto(this.hatPath, hx + s * 0.03, hy - s * 0.16, hr * 0.98, s * 0.1, s * 0.045);
    attachPath(g, this.hatPath);
    g.fill();
    setFill(g, '#2b3f52');
    this.hatPath.clear();
    roundRectInto(this.hatPath, hx - hr * 0.18, hy - s * 0.29, hr * 0.36, s * 0.08, s * 0.035);
    attachPath(g, this.hatPath);
    g.fill();

    // 眼睛：血量低时变红。
    const eyeCol = fc.maxHp > 0 && fc.hp / fc.maxHp <= 0.3 ? '#ff4d6d' : '#1a2836';
    setFill(g, eyeCol);
    g.beginPath();
    g.ellipse(hx + s * 0.12, hy + s * 0.03, s * 0.045, s * 0.065);
    g.fill();

    // 眉毛：出手时更凶。
    setStroke(g, s * 0.03, '#3a2a24', 1, 'round');
    g.beginPath();
    g.moveTo(hx + s * 0.03, hy - s * 0.06);
    g.lineTo(hx + s * 0.2, hy - s * 0.02);
    g.stroke();

    // 嘴。
    setStroke(g, s * 0.028, 'rgba(120,60,40,.7)');
    g.beginPath();
    g.moveTo(hx + s * 0.05, hy + s * 0.17);
    g.lineTo(hx + s * 0.19, hy + s * 0.15);
    g.stroke();
  }

  /** 凛的头：深紫长发 + 刘海 + 发带，无帽。 */
  private drawHeadFemale(fc: FrameContext, s: number): void {
    const g = this.torsoGfx;
    const hx = s * 0.04;
    const hy = -s * 0.78;
    const hr = s * 0.28;

    // 脖子。
    setFill(g, SKIN_F_DARK);
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.09, -s * 0.58, s * 0.2, s * 0.18, s * 0.05);
    attachPath(g, this.headPath);
    g.fill();

    // 脸。
    setFill(g, SKIN_F);
    g.beginPath();
    g.circle(hx, hy, hr);
    g.fill();
    setStroke(g, s * 0.03, 'rgba(120,70,60,.45)');
    g.beginPath();
    g.circle(hx, hy, hr);
    g.stroke();

    // 耳朵。
    setFill(g, SKIN_F);
    g.beginPath();
    g.circle(hx - hr * 0.92, hy + hr * 0.14, s * 0.07);
    g.fill();

    // 头顶长发（盖住上半个头）。
    setFill(g, HAIR_F);
    g.beginPath();
    g.arc(hx, hy - s * 0.015, hr * 1.06, Math.PI * 0.99, Math.PI * 2.01);
    g.closePath();
    g.fill();

    // 刘海：从头顶斜扫到右眉。
    this.hairPath.clear();
    this.hairPath.moveTo(hx - hr * 1.02, hy - s * 0.02);
    this.hairPath.quadraticCurveTo(hx - hr * 0.2, hy - s * 0.34, hx + hr * 0.92, hy - s * 0.16);
    this.hairPath.quadraticCurveTo(hx + hr * 0.4, hy - s * 0.14, hx + hr * 0.06, hy + s * 0.02);
    this.hairPath.quadraticCurveTo(hx - hr * 0.5, hy + s * 0.02, hx - hr * 1.02, hy - s * 0.02);
    this.hairPath.closePath();
    attachPath(g, this.hairPath);
    g.fill();

    // 左侧鬓发垂到肩。
    setFill(g, HAIR_F);
    this.hairPath.clear();
    this.hairPath.moveTo(hx - hr * 1.02, hy - s * 0.06);
    this.hairPath.quadraticCurveTo(hx - hr * 1.35, hy + s * 0.24, hx - hr * 1.15, hy + s * 0.52);
    this.hairPath.quadraticCurveTo(hx - hr * 1.0, hy + s * 0.3, hx - hr * 0.86, hy + s * 0.04);
    this.hairPath.closePath();
    attachPath(g, this.hairPath);
    g.fill();

    // 发丝高光。
    setStroke(g, s * 0.03, hexA(HAIR_F_LIGHT, 0.85), 1, 'round');
    g.beginPath();
    g.moveTo(hx - hr * 0.7, hy - s * 0.2);
    g.quadraticCurveTo(hx - hr * 0.2, hy - s * 0.29, hx + hr * 0.45, hy - s * 0.2);
    g.stroke();

    // 发带（右侧小蝴蝶结）。
    const bx = hx + hr * 0.82;
    const by = hy - s * 0.16;
    setFill(g, SASH_F);
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx + s * 0.12, by - s * 0.08);
    g.lineTo(bx + s * 0.12, by + s * 0.05);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx - s * 0.02, by + s * 0.12);
    g.lineTo(bx + s * 0.08, by + s * 0.08);
    g.closePath();
    g.fill();
    setFill(g, '#ff9ac0');
    g.beginPath();
    g.circle(bx, by, s * 0.035);
    g.fill();

    // 眼睛：血量低时变红；燃魂时品红。
    const eyeCol = fc.burning
      ? '#ff6ec7'
      : fc.maxHp > 0 && fc.hp / fc.maxHp <= 0.3
        ? '#ff4d6d'
        : '#3a1f45';
    setFill(g, eyeCol);
    g.beginPath();
    g.ellipse(hx + s * 0.13, hy + s * 0.04, s * 0.05, s * 0.07);
    g.fill();
    // 睫毛。
    setStroke(g, s * 0.028, '#2a1630', 1, 'round');
    g.beginPath();
    g.moveTo(hx + s * 0.07, hy - s * 0.02);
    g.lineTo(hx + s * 0.2, hy + s * 0.01);
    g.stroke();

    // 眉毛。
    setStroke(g, s * 0.024, '#3a2542', 1, 'round');
    g.beginPath();
    g.moveTo(hx + s * 0.06, hy - s * 0.08);
    g.lineTo(hx + s * 0.2, hy - s * 0.05);
    g.stroke();

    // 腮红 + 嘴。
    setFill(g, 'rgba(255,120,160,.22)');
    g.beginPath();
    g.ellipse(hx + s * 0.05, hy + s * 0.16, s * 0.09, s * 0.045);
    g.fill();
    setStroke(g, s * 0.026, 'rgba(150,60,80,.75)');
    g.beginPath();
    g.moveTo(hx + s * 0.1, hy + s * 0.2);
    g.lineTo(hx + s * 0.19, hy + s * 0.19);
    g.stroke();
  }

  /** 凛的马尾（在身体后面）。 */
  private drawHairBack(fc: FrameContext, s: number, airborne: boolean): void {
    const g = this.hairBackGfx;
    g.clear();
    if (!this.female) return;

    const sway = Math.sin(fc.vt * 3.1) * s * 0.06 + (airborne ? -s * 0.16 : 0);
    const lift = airborne ? -s * 0.3 : 0;
    const x0 = -s * 0.12;
    const y0 = -s * 0.74;
    const x1 = -s * 0.42 + sway * 0.6;
    const y1 = -s * 0.18 + lift;
    const x2 = -s * 0.52 + sway;
    const y2 = s * 0.34 + lift;

    // 主束。
    setStroke(g, s * 0.17, HAIR_F, 1, 'round');
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(x1, y1, x2, y2);
    g.stroke();
    // 亮面发丝。
    setStroke(g, s * 0.06, hexA(HAIR_F_LIGHT, 0.9), 1, 'round');
    g.beginPath();
    g.moveTo(x0 - s * 0.03, y0 + s * 0.05);
    g.quadraticCurveTo(x1 - s * 0.02, y1, x2 - s * 0.04, y2 - s * 0.06);
    g.stroke();
    // 发梢。
    setFill(g, HAIR_F);
    g.beginPath();
    g.ellipse(x2, y2, s * 0.09, s * 0.14);
    g.fill();

    // 发圈。
    setFill(g, SASH_F);
    g.beginPath();
    g.ellipse(x0 - s * 0.02, y0 + s * 0.06, s * 0.07, s * 0.05);
    g.fill();
  }

  /** 手臂：上臂球衣袖 + 前臂皮肤。 */
  private drawArm(
    g: Graphics,
    s: number,
    shoulderX: number,
    shoulderY: number,
    gripX: number,
    gripY: number,
    skin: string,
    sleeve: string,
  ): void {
    g.clear();
    const midX = lerp(shoulderX, gripX, 0.42);
    const midY = lerp(shoulderY, gripY, 0.42);

    setStroke(g, s * 0.2, sleeve, 1, 'round');
    g.beginPath();
    g.moveTo(shoulderX, shoulderY);
    g.lineTo(midX, midY);
    g.stroke();

    setStroke(g, s * 0.16, skin, 1, 'round');
    g.beginPath();
    g.moveTo(midX, midY);
    g.lineTo(gripX, gripY);
    g.stroke();

    // 手掌。
    setFill(g, skin);
    g.beginPath();
    g.arc(gripX, gripY, s * 0.1, 0, Math.PI * 2);
    g.fill();
  }

  /** 武器分派：哲用球棒，凛用镰刀（判定几何完全相同）。 */
  private drawWeapon(
    s: number,
    gripX: number,
    gripY: number,
    angle: number,
    swing: number,
    impact: number,
    laneColor: string,
  ): void {
    if (this.female) {
      this.drawScythe(s, gripX, gripY, angle, swing, impact);
    } else {
      this.drawBat(s, gripX, gripY, angle, swing, impact, laneColor);
    }
  }

  /** 棒子：木纹渐变 + 挥击时的光晕。 */
  private drawBat(
    s: number,
    gripX: number,
    gripY: number,
    angle: number,
    swing: number,
    impact: number,
    laneColor: string,
  ): void {
    const g = this.batGfx;
    g.clear();
    this.batRoot.position.set(gripX, gripY);
    this.batRoot.rotation = angle;

    const L = s * CLUB_LEN_R;

    // 挥击光晕。
    if (swing > 0.03) {
      setStroke(g, s * 0.34, hexA(laneColor, 0.24 * swing), 1, 'round');
      g.beginPath();
      g.moveTo(s * 0.02, 0);
      g.lineTo(L * 0.95, 0);
      g.stroke();
    }

    // 握把。
    setStroke(g, s * 0.12, BAT_GRIP, 1, 'round');
    g.beginPath();
    g.moveTo(-s * 0.02, 0);
    g.lineTo(s * 0.34, 0);
    g.stroke();

    // 握把防滑纹。
    setStroke(g, s * 0.02, 'rgba(220,190,150,.35)');
    for (let i = 1; i <= 3; i++) {
      const x = s * (0.05 + i * 0.07);
      g.beginPath();
      g.moveTo(x, -s * 0.045);
      g.lineTo(x, s * 0.045);
      g.stroke();
    }

    // 棒身（前端更粗）。
    this.batBodyPath.clear();
    this.batBodyPath.moveTo(s * 0.28, -s * 0.07);
    this.batBodyPath.quadraticCurveTo(L * 0.82, -s * 0.13, L * 0.94, -s * 0.06);
    this.batBodyPath.quadraticCurveTo(L, 0, L * 0.94, s * 0.06);
    this.batBodyPath.quadraticCurveTo(L * 0.82, s * 0.13, s * 0.28, s * 0.07);
    this.batBodyPath.closePath();
    if (this.batGradient) {
      setFillGradient(g, this.batGradient, 1);
    } else {
      setFill(g, BAT);
    }
    attachPath(g, this.batBodyPath);
    g.fill();
    setStroke(g, s * 0.025, 'rgba(70,40,20,.55)');
    attachPath(g, this.batBodyPath);
    g.stroke();

    // 高光。
    setStroke(g, s * 0.025, 'rgba(255,240,215,.5)');
    g.beginPath();
    g.moveTo(s * 0.42, -s * 0.035);
    g.quadraticCurveTo(L * 0.74, -s * 0.075, L * 0.87, -s * 0.035);
    g.stroke();

    // 尾端旋钮。
    setFill(g, '#2a1d16');
    g.beginPath();
    g.arc(-s * 0.02, 0, s * 0.075, 0, Math.PI * 2);
    g.fill();

    // 击打闪光（棒尖）。
    if (impact > 0.02) {
      setFill(g, hexA(laneColor, 0.35 * impact));
      this.starPath.clear();
      starInto(this.starPath, L * 0.97, 0, s * (0.2 + 0.2 * impact), s * (0.07 + 0.07 * impact));
      attachPath(g, this.starPath);
      g.fill();
      setFill(g, 'rgba(255,255,255,1)', 0.9 * impact);
      this.starPath.clear();
      starInto(this.starPath, L * 0.97, 0, s * (0.1 + 0.12 * impact), s * (0.04 + 0.04 * impact));
      attachPath(g, this.starPath);
      g.fill();
    }
  }

  /** 镰刀：长柄 + 紫红弯刃，长度与棒子一致。 */
  private drawScythe(
    s: number,
    gripX: number,
    gripY: number,
    angle: number,
    swing: number,
    impact: number,
  ): void {
    const g = this.batGfx;
    g.clear();
    this.batRoot.position.set(gripX, gripY);
    this.batRoot.rotation = angle;

    const L = s * CLUB_LEN_R;

    // 挥击光晕（紫红）。
    if (swing > 0.03) {
      setStroke(g, s * 0.3, hexA(RIN_TRAIL, 0.2 * swing), 1, 'round');
      g.beginPath();
      g.moveTo(s * 0.04, 0);
      g.lineTo(L * 0.92, 0);
      g.stroke();
    }

    // 握把缠布。
    setStroke(g, s * 0.12, '#2a1d33', 1, 'round');
    g.beginPath();
    g.moveTo(-s * 0.04, 0);
    g.lineTo(s * 0.3, 0);
    g.stroke();
    setStroke(g, s * 0.022, 'rgba(210,150,220,.35)');
    for (let i = 1; i <= 3; i++) {
      const x = s * (0.04 + i * 0.065);
      g.beginPath();
      g.moveTo(x, -s * 0.045);
      g.lineTo(x, s * 0.045);
      g.stroke();
    }

    // 长柄。
    this.batBodyPath.clear();
    this.batBodyPath.moveTo(-s * 0.03, -s * 0.045);
    this.batBodyPath.lineTo(L * 0.9, -s * 0.035);
    this.batBodyPath.lineTo(L * 0.9, s * 0.035);
    this.batBodyPath.lineTo(-s * 0.03, s * 0.045);
    this.batBodyPath.closePath();
    setFill(g, SCYTHE_SHAFT);
    attachPath(g, this.batBodyPath);
    g.fill();
    setStroke(g, s * 0.022, 'rgba(180,140,210,.4)');
    g.beginPath();
    g.moveTo(s * 0.1, -s * 0.018);
    g.lineTo(L * 0.88, -s * 0.014);
    g.stroke();

    // 柄尾配重。
    setFill(g, SCYTHE_METAL);
    g.beginPath();
    g.arc(-s * 0.04, 0, s * 0.065, 0, Math.PI * 2);
    g.fill();

    // 刃根金属箍。
    setFill(g, SCYTHE_METAL);
    this.headPath.clear();
    roundRectInto(this.headPath, L * 0.72, -s * 0.065, s * 0.14, s * 0.13, s * 0.035);
    attachPath(g, this.headPath);
    g.fill();
    setStroke(g, s * 0.02, '#6a5182');
    attachPath(g, this.headPath);
    g.stroke();

    // 弯刃：从柄前端向后上方弯出，刃尖落在与棒尖相同的水平位置。
    this.bladePath.clear();
    this.bladePath.moveTo(L * 0.78, s * 0.02);
    this.bladePath.quadraticCurveTo(L * 0.9, -s * 0.3, L * 1.0, -s * 0.13);
    this.bladePath.quadraticCurveTo(L * 0.93, -s * 0.02, L * 0.86, s * 0.03);
    this.bladePath.quadraticCurveTo(L * 0.82, s * 0.05, L * 0.78, s * 0.02);
    this.bladePath.closePath();
    if (this.scytheGradient) {
      setFillGradient(g, this.scytheGradient, 1);
    } else {
      setFill(g, RIN_IMPACT);
    }
    attachPath(g, this.bladePath);
    g.fill();
    setStroke(g, s * 0.03, 'rgba(70,20,90,.8)');
    attachPath(g, this.bladePath);
    g.stroke();

    // 刃口高光。
    setStroke(g, s * 0.028, 'rgba(255,190,235,.9)', 1, 'round');
    g.beginPath();
    g.moveTo(L * 0.79, s * 0.005);
    g.quadraticCurveTo(L * 0.9, -s * 0.27, L * 0.99, -s * 0.125);
    g.stroke();

    // 击打闪光（刃尖附近）。
    if (impact > 0.02) {
      setFill(g, hexA(RIN_IMPACT, 0.4 * impact));
      this.starPath.clear();
      starInto(
        this.starPath,
        L * 0.97,
        -s * 0.02,
        s * (0.2 + 0.2 * impact),
        s * (0.07 + 0.07 * impact),
      );
      attachPath(g, this.starPath);
      g.fill();
      setFill(g, 'rgba(255,240,255,1)', 0.9 * impact);
      this.starPath.clear();
      starInto(
        this.starPath,
        L * 0.97,
        -s * 0.02,
        s * (0.1 + 0.12 * impact),
        s * (0.04 + 0.04 * impact),
      );
      attachPath(g, this.starPath);
      g.fill();
    }
  }

  /** 挥棒残影：沿挥击弧线留几道半透明的棒影。 */
  private drawSwingGhosts(
    s: number,
    pivotX: number,
    pivotY: number,
    gripDist: number,
    from: number,
    to: number,
    color: string,
    strength: number,
  ): void {
    for (const gfx of this.ghostGfx) gfx.clear();
    this.swingGfx.clear();

    if (strength <= 0.04 || Math.abs(to - from) < 0.06) {
      for (const root of this.ghostRoots) root.visible = false;
      return;
    }

    // 棒端扫过的细弧线。
    const r = gripDist + s * CLUB_LEN_R;
    const trailCol = this.female ? RIN_TRAIL : color;
    this.swingArcPath.clear();
    this.swingArcPath.moveTo(pivotX + Math.cos(from) * r, pivotY + Math.sin(from) * r);
    this.swingArcPath.arc(pivotX, pivotY, r, from, to, to < from);
    setStroke(this.swingGfx, s * 0.055, hexA(trailCol, 0.32 * strength), 1, 'round');
    attachPath(this.swingGfx, this.swingArcPath);
    this.swingGfx.stroke();

    // 三道淡影，越接近当前角度越实。
    const L = s * CLUB_LEN_R;
    this.ghostBatPath.clear();
    if (this.female) {
      // 镰刀：细长柄 + 刃部的小弯钩。
      this.ghostBatPath.moveTo(0, -s * 0.03);
      this.ghostBatPath.lineTo(L * 0.86, -s * 0.022);
      this.ghostBatPath.quadraticCurveTo(L * 0.95, -s * 0.16, L, -s * 0.1);
      this.ghostBatPath.quadraticCurveTo(L * 0.9, -s * 0.02, L * 0.84, s * 0.02);
      this.ghostBatPath.lineTo(0, s * 0.03);
      this.ghostBatPath.closePath();
    } else {
      this.ghostBatPath.moveTo(0, -s * 0.05);
      this.ghostBatPath.quadraticCurveTo(L * 0.5, -s * 0.09, L * 0.94, -s * 0.055);
      this.ghostBatPath.quadraticCurveTo(L, 0, L * 0.94, s * 0.055);
      this.ghostBatPath.quadraticCurveTo(L * 0.5, s * 0.09, 0, s * 0.05);
      this.ghostBatPath.closePath();
    }

    for (let i = 0; i < GHOST_T.length; i++) {
      const root = this.ghostRoots[i];
      const gfx = this.ghostGfx[i];
      if (!root || !gfx) continue;
      const a = lerp(from, to, GHOST_T[i] ?? 0);
      root.visible = true;
      root.position.set(pivotX + Math.cos(a) * gripDist, pivotY + Math.sin(a) * gripDist);
      root.rotation = a;
      setFill(gfx, trailCol, (GHOST_ALPHA[i] ?? 0) * strength);
      attachPath(gfx, this.ghostBatPath);
      gfx.fill();
    }
  }

  /** 受击红闪。 */
  private drawFlash(flash: number, s: number): void {
    const g = this.flashGfx;
    g.clear();
    if (flash <= 0) return;
    setFill(g, 'rgb(255,60,90)', flash * 0.42);
    this.flashPath.clear();
    roundRectInto(this.flashPath, -s * 0.78, -s * 1.16, s * 1.62, s * 2.2, s * 0.4);
    attachPath(g, this.flashPath);
    g.fill();
  }

  /* ------------------------------------------------------------------ *
   * 世界坐标光效
   * ------------------------------------------------------------------ */

  /** FEVER 光环 / 燃魂光环。 */
  private drawFever(fc: FrameContext, x: number, y: number, s: number): void {
    const g = this.haloGfx;
    g.clear();
    if (!fc.frenzyActive && !fc.burning) return;

    if (fc.burning) {
      const pulse = 0.5 + 0.5 * Math.sin(fc.vt * 7);
      const gradient = this.burnGradient;
      if (gradient) {
        const alpha = (0.16 + pulse * 0.1) / BURN_REF_ALPHA;
        setFillGradient(g, gradient, alpha);
        g.beginPath();
        g.circle(x, y, s * (1.9 + pulse * 0.35));
        g.fill();
      }
      for (let i = 0; i < 3; i++) {
        const rr = s * (1.35 + i * 0.3 + pulse * 0.08);
        const a0 = -fc.vt * (1.8 + i * 0.6) + i * 2.4;
        this.haloArcPath.clear();
        arcInto(this.haloArcPath, x, y, rr, a0, a0 + Math.PI * 0.8);
        setStroke(g, 7, 'rgba(190,80,255,.14)');
        attachPath(g, this.haloArcPath);
        g.stroke();
        setStroke(g, 2, `rgba(255,110,199,${0.4 + pulse * 0.35})`);
        attachPath(g, this.haloArcPath);
        g.stroke();
      }
      // 向上飘的火舌。
      for (let i = 0; i < 4; i++) {
        const ph = (fc.vt * 1.3 + i * 0.25) % 1;
        const fx = x + Math.sin(i * 2.3 + fc.vt * 1.7) * s * 0.6;
        const fy = y - s * (0.7 + ph * 1.1);
        setStroke(
          g,
          2.2,
          `rgba(255,${120 + i * 20},210,${((1 - ph) * 0.5).toFixed(3)})`,
          1,
          'round',
        );
        g.beginPath();
        g.moveTo(fx, fy);
        g.quadraticCurveTo(fx + s * 0.08, fy - s * 0.12, fx - s * 0.02, fy - s * 0.22);
        g.stroke();
      }
    }

    if (fc.frenzyActive) {
      const pulse = 0.5 + 0.5 * Math.sin(fc.vt * 6);

      const gradient = this.haloGradient;
      if (gradient) {
        const alpha = (0.1 + pulse * 0.08) / HALO_REF_ALPHA;
        setFillGradient(g, gradient, alpha);
        g.beginPath();
        g.circle(x, y, s * (2.3 + pulse * 0.35));
        g.fill();
      }

      for (let i = 0; i < 3; i++) {
        const rr = s * (1.55 + i * 0.28 + pulse * 0.06);
        const a0 = fc.vt * (1.6 + i * 0.5) + i * 2.1;
        this.haloArcPath.clear();
        arcInto(this.haloArcPath, x, y, rr, a0, a0 + Math.PI * 1.05);
        setStroke(g, 9, 'rgba(255,190,60,.16)');
        attachPath(g, this.haloArcPath);
        g.stroke();
        setStroke(g, 2, `rgba(255,226,120,${0.35 + pulse * 0.35})`);
        attachPath(g, this.haloArcPath);
        g.stroke();
      }
    }
  }

  /** 生命环。 */
  private drawHpRing(fc: FrameContext, x: number, y: number, s: number): void {
    const g = this.hpGfx;
    g.clear();
    const frac = fc.maxHp > 0 ? clamp(fc.hp / fc.maxHp, 0, 1) : 0;

    setStroke(g, 2.5, 'rgba(255,255,255,.07)');
    this.hpPath.clear();
    arcInto(this.hpPath, x, y, s * 1.95, 0, Math.PI * 2);
    attachPath(g, this.hpPath);
    g.stroke();

    const hpCol = fc.burning
      ? 'rgba(255,77,141,.95)'
      : frac > 0.55
        ? 'rgba(67,224,140,.75)'
        : frac > 0.28
          ? 'rgba(255,182,72,.85)'
          : 'rgba(255,77,109,.95)';
    setStroke(g, 8, hpCol, 0.3);
    this.hpPath.clear();
    arcInto(this.hpPath, x, y, s * 1.95, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    attachPath(g, this.hpPath);
    g.stroke();
    setStroke(g, 2.5, hpCol, 1);
    attachPath(g, this.hpPath);
    g.stroke();
  }
}
