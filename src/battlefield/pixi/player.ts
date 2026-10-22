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
  MAX_HP,
  TOP_AIR_TIME,
} from '../../game/constants';
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
  private batGradient: FillGradient | null = null;
  private haloGradient: FillGradient | null = null;
  private glowGradient: FillGradient | null = null;

  // ── 动作状态（渲染层内部，只跟视觉有关） ───────────────────
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
  }

  draw(fc: FrameContext): void {
    const { playerR: s, playerX } = fc.layout;

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

    // 挥棒残影（在身体后面）。
    this.drawSwingGhosts(s, pivotX, pivotY, gripDist, trailFrom, clubA, laneColor, trail);

    // 后手（深色）。
    this.drawArm(this.backArmGfx, s, -s * 0.28, -s * 0.3, gripX, gripY, SKIN_DARK, JERSEY_DARK);

    // 躯干 + 头。
    this.drawTorso(s);
    this.drawHead(fc, s);

    // 前手 + 棒子。
    this.drawArm(this.frontArmGfx, s, s * 0.1, -s * 0.3, gripX, gripY, SKIN, JERSEY);
    this.drawBat(s, gripX, gripY, clubA, trail, impact, laneColor);

    // 受击红闪。
    this.drawFlash(fc.playerFlash, s);

    /* ---------- 双生落地的冲击环 / 落地的尘环 ---------- */
    this.fxGfx.clear();
    this.drawPairRing(playerX, y, s, pairP);
    this.drawLandRing(playerX, groundFeet, s);

    /* ---------- 生命环 ---------- */
    this.drawHpRing(fc, playerX, bodyY, s);
  }

  destroy(): void {
    destroyGradient(this.bodyGradient);
    destroyGradient(this.batGradient);
    destroyGradient(this.haloGradient);
    destroyGradient(this.glowGradient);
    this.bodyGradient = null;
    this.batGradient = null;
    this.haloGradient = null;
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

    for (const sgn of SIDES) {
      const phase = sgn * swing;
      const hipX = sgn * s * 0.15;
      const footX = sgn * s * 0.2 + phase * s + tuck * s * 0.18;
      const kneeX = (hipX + footX) / 2 + sgn * s * 0.02;
      const kneeY = (hipY + footY - lift) / 2;

      setStroke(g, s * 0.21, PANTS, 1, 'round');
      g.beginPath();
      g.moveTo(hipX, hipY);
      g.quadraticCurveTo(kneeX, kneeY, footX, footY - lift);
      g.stroke();

      // 地面偏暗，给腿加一道轮廓光，避免和地面糊在一起。
      setStroke(g, s * 0.045, 'rgba(170,215,245,.2)', 1, 'round');
      g.beginPath();
      g.moveTo(hipX - s * 0.055, hipY + s * 0.04);
      g.quadraticCurveTo(kneeX - s * 0.055, kneeY, footX - s * 0.055, footY - lift - s * 0.03);
      g.stroke();

      // 鞋。
      setFill(g, SHOE);
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
      setStroke(g, s * 0.035, '#22303c');
      g.beginPath();
      g.moveTo(footX - s * 0.14, footY - lift + s * 0.07);
      g.lineTo(footX + s * 0.16, footY - lift + s * 0.07);
      g.stroke();
    }
  }

  /** 躯干：红色球衣 + 奶油色条纹。 */
  private drawTorso(s: number): void {
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

  /** 头：棒球帽 + 侧脸。 */
  private drawHead(fc: FrameContext, s: number): void {
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
    const eyeCol = fc.hp / MAX_HP <= 0.3 ? '#ff4d6d' : '#1a2836';
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
    this.swingArcPath.clear();
    this.swingArcPath.moveTo(pivotX + Math.cos(from) * r, pivotY + Math.sin(from) * r);
    this.swingArcPath.arc(pivotX, pivotY, r, from, to, to < from);
    setStroke(this.swingGfx, s * 0.055, hexA(color, 0.32 * strength), 1, 'round');
    attachPath(this.swingGfx, this.swingArcPath);
    this.swingGfx.stroke();

    // 三道淡棒影，越接近当前角度越实。
    const L = s * CLUB_LEN_R;
    this.ghostBatPath.clear();
    this.ghostBatPath.moveTo(0, -s * 0.05);
    this.ghostBatPath.quadraticCurveTo(L * 0.5, -s * 0.09, L * 0.94, -s * 0.055);
    this.ghostBatPath.quadraticCurveTo(L, 0, L * 0.94, s * 0.055);
    this.ghostBatPath.quadraticCurveTo(L * 0.5, s * 0.09, 0, s * 0.05);
    this.ghostBatPath.closePath();

    for (let i = 0; i < GHOST_T.length; i++) {
      const root = this.ghostRoots[i];
      const gfx = this.ghostGfx[i];
      if (!root || !gfx) continue;
      const a = lerp(from, to, GHOST_T[i] ?? 0);
      root.visible = true;
      root.position.set(pivotX + Math.cos(a) * gripDist, pivotY + Math.sin(a) * gripDist);
      root.rotation = a;
      setFill(gfx, color, (GHOST_ALPHA[i] ?? 0) * strength);
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

  /** FEVER 光环。 */
  private drawFever(fc: FrameContext, x: number, y: number, s: number): void {
    const g = this.haloGfx;
    g.clear();
    if (!fc.frenzyActive) return;
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

  /** 生命环。 */
  private drawHpRing(fc: FrameContext, x: number, y: number, s: number): void {
    const g = this.hpGfx;
    g.clear();
    const frac = fc.hp / MAX_HP;

    setStroke(g, 2.5, 'rgba(255,255,255,.07)');
    this.hpPath.clear();
    arcInto(this.hpPath, x, y, s * 1.95, 0, Math.PI * 2);
    attachPath(g, this.hpPath);
    g.stroke();

    const hpCol =
      frac > 0.55
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
