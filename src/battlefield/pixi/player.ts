/**
 * 角色 —— 哲是程序化棒球少年，凛是参考动画逐帧抠像的 2D 立绘。
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
 * - **凛**：程序化身体整体换成 2D 立绘（见 `rin-sprites.ts`）——
 *   待机 5 帧呼吸、跑动 9 帧「站在镰刀上飞行」、出招 12 帧；
 *   长按、双生、灵魂分身共用待机 / 出招帧；判定与镰刀长度都不变。
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
 * │   ├── spriteRoot    凛的 2D 立绘（与程序化身体互斥）
 * │   └── flashGfx
 * ├── fxGfx        双生冲击环 / 落地尘环（世界坐标，画在身体之后）
 * └── hpGfx        生命环（世界坐标）
 *
 * haloGfx / platformGfx 不挂在 container 下 —— 渲染器把它们放进 `glow` 层，
 * 让 FEVER 光环与脚下地面光参与 bloom。
 * ```
 */

import { Container, Graphics, GraphicsPath, Sprite, Texture } from 'pixi.js';
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
  setStrokeGradient,
  starInto,
} from './gfx';
import { clamp, easeInOutCubic, easeOutCubic, lerp } from './math';
import { hexA } from './palette';
import { loadRinTextureSet } from './rin-sprites';

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
const JERSEY_LIGHT = '#ff7a6e';
const TRIM = '#f4ead6';
const PANTS = '#2a3f55';
const PANTS_LIGHT = '#4d6c8c';
const SHOE = '#ece4d2';
const CAP = '#14232f';
const CAP_LIGHT = '#33506a';
const CAP_BRIM = '#c9433f';
const BAT = '#e0a25e';
const BAT_DARK = '#a86b32';
const BAT_LIGHT = '#ffd9a6';
const BAT_GRIP = '#3a2a20';
/** 哲的墨线 / 冷色轮廓光。 */
const INK_ZHE = '#160f14';
const RIM_ZHE = '#9fe8ff';

/* 凛的配色：青绿短打 + 紫裙 + 深紫长发。 */
const SKIN_F = '#f6e9ec';
const SKIN_F_DARK = '#dcc2c9';
const SKIN_F_SHADE = '#c79ba8';
const TOP_F = '#191320';
const TOP_F_DARK = '#08050c';
const TOP_F_LIGHT = '#4a3a56';
const SASH_F = '#8c1028';
const SASH_F_LIGHT = '#ff3b5c';
const SKIRT_F = '#211626';
const SKIRT_F_DARK = '#0a0610';
const SKIRT_F_LIGHT = '#4a3552';
const HAIR_F = '#c9cddf';
const HAIR_F_LIGHT = '#f4f5ff';
const HAIR_F_GLOSS = '#ffffff';
const LEGGING_F = '#100b15';
const LEGGING_F_LIGHT = '#3e3348';
const BOOT_F = '#171019';
const BOOT_F_LIGHT = '#ff3b5c';
const SCYTHE_SHAFT = '#191019';
const SCYTHE_SHAFT_LIGHT = '#8a769c';
const SCYTHE_DARK = '#140810';
/** 凛的墨线 / 冷色轮廓光。 */
const INK_RIN = '#0a060c';
const RIM_RIN = '#bcc8ff';

/** 凛的刀光 / 残影：偏紫红。 */
const RIN_TRAIL = '#ff2d5e';
const RIN_IMPACT = '#ff6a8a';

/** 燃魂光环的参考脉冲 alpha。 */
const BURN_REF_ALPHA = 0.22;

const SIDES = [-1, 1] as const;

/** 镰刀视觉长度（比球棒略长，命中判定不变）。 */
const SCYTHE_LEN_R = CLUB_LEN_R * 1.18;

/* ------------------------------------------------------------------ *
 * 凛的 2D 立绘（参考动画逐帧抠像，见 rin-sprites.ts）
 * ------------------------------------------------------------------ */

/** 纹理里「发顶 → 脚底」的像素高度（0.5 倍裁切后的尺寸）。 */
const RIN_SPRITE_BODY_PX = 281;
/** 脚底在纹理里的锚点。 */
const RIN_SPRITE_ANCHOR_X = 0.559;
const RIN_SPRITE_ANCHOR_Y = 0.994;
/** 立绘身体高度（发顶 → 脚底）折算成 playerR，与程序化角色一致。 */
const RIN_SPRITE_BODY_R = 2.06;
/** 待机呼吸帧率。 */
const RIN_IDLE_FPS = 4;
/** 长按连击时循环的帧：举镰 → 劈下 → 收势。 */
const RIN_HOLD_FRAMES = [4, 5, 6, 7] as const;

/* 骑镰飞行帧（第二段参考动画，见 rin-sprites.ts）。 */
/** 骑乘帧里「发顶 → 靴底」的像素高度。 */
const RIN_RIDE_BODY_PX = 195;
/** 镰刀最低点所在的锚点（裁切窗口按眼睛对齐）。 */
const RIN_RIDE_ANCHOR_X = 0.5488;
const RIN_RIDE_ANCHOR_Y = 0.975;
/** 镰刀离地悬浮的高度（playerR）—— 让刀刃贴着地面飞。 */
const RIN_RIDE_HOVER_R = 0.08;
/** 骑乘帧率（9 帧 ≈ 0.9 秒一个起伏循环）。 */
const RIN_RIDE_FPS = 10;

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
 * **同一套画法**（哲是程序化身体，凛是立绘），只是整体半透明、
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
  /** 凛的 2D 立绘（程序化身体整体隐藏时使用）。 */
  private readonly spriteRoot = new Container();
  private readonly sprite = new Sprite();
  private readonly flashGfx = new Graphics();
  private readonly fxGfx = new Graphics();
  private readonly hpGfx = new Graphics();

  // ── 复用路径 ─────────────────────────────────────────────
  private readonly torsoPath = new GraphicsPath();
  private readonly torsoShadePath = new GraphicsPath();
  private readonly headPath = new GraphicsPath();
  private readonly facePath = new GraphicsPath();
  private readonly hatPath = new GraphicsPath();
  private readonly hairPath = new GraphicsPath();
  private readonly hairMassPath = new GraphicsPath();
  private readonly skirtPath = new GraphicsPath();
  private readonly skirtBackPath = new GraphicsPath();
  private readonly bladeBackPath = new GraphicsPath();
  private readonly bladePath = new GraphicsPath();
  private readonly bladeBevelPath = new GraphicsPath();
  private readonly bladeEdgePath = new GraphicsPath();
  private readonly bladeRunePath = new GraphicsPath();
  private readonly ribbonPath = new GraphicsPath();
  private readonly legPath = new GraphicsPath();
  private readonly armPath = new GraphicsPath();
  private readonly flashPath = new GraphicsPath();
  private readonly hpPath = new GraphicsPath();
  private readonly haloArcPath = new GraphicsPath();
  private readonly swingArcPath = new GraphicsPath();
  private readonly swingRibbonPath = new GraphicsPath();
  private readonly batBodyPath = new GraphicsPath();
  private readonly ghostBatPath = new GraphicsPath();
  private readonly starPath = new GraphicsPath();
  private readonly shoePath = new GraphicsPath();
  private readonly eyePath = new GraphicsPath();

  // ── 渐变（复用，不每帧重建） ──────────────────────────────
  private bodyGradient: FillGradient | null = null;
  private bodyGradientF: FillGradient | null = null;
  private skinGradient: FillGradient | null = null;
  private skinGradientF: FillGradient | null = null;
  private hairGradient: FillGradient | null = null;
  private capGradient: FillGradient | null = null;
  private skirtGradient: FillGradient | null = null;
  private batGradient: FillGradient | null = null;
  private scytheGradient: FillGradient | null = null;
  private bladeGlowGradient: FillGradient | null = null;
  private shaftGradient: FillGradient | null = null;
  private irisGradient: FillGradient | null = null;
  private haloGradient: FillGradient | null = null;
  private burnGradient: FillGradient | null = null;
  private glowGradient: FillGradient | null = null;

  // ── 动作状态（渲染层内部，只跟视觉有关） ───────────────────
  /** 本帧是否画凛（女性外观 + 镰刀）。 */
  private female = false;
  /** 凛的立绘纹理（`prepare()` 里一次性建好，之后只换 `texture`）。 */
  private rinIdleTextures: readonly Texture[] = [];
  private rinAttackTextures: readonly Texture[] = [];
  private rinRideTextures: readonly Texture[] = [];
  private rinSpritesReady = false;
  private rinLoadStarted = false;
  /** 本帧视觉时钟（给头发 / 裙摆 / 飘带做次级运动）。 */
  private visT = 0;
  /** 本帧步态强度（0..1）与步频相位。 */
  private motionWalk = 0;
  private motionPhase = 0;
  /** 本帧是否腾空（马尾 / 裙摆上扬）。 */
  private motionAir = false;
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
    this.spriteRoot.addChild(this.sprite);
    this.spriteRoot.visible = false;
    this.bodyRoot.addChild(this.spriteRoot);
    this.bodyRoot.addChild(this.flashGfx);
  }

  prepare(): void {
    if (this.bodyGradient) return;
    // 凛的 2D 立绘：数据 URL 解码是异步的，加载完成前先退回程序化身体。
    this.sprite.anchor.set(RIN_SPRITE_ANCHOR_X, RIN_SPRITE_ANCHOR_Y);
    this.loadRinSpriteTextures();
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
        { offset: 0, color: '#3a2d44' },
        { offset: 0.55, color: TOP_F },
        { offset: 1, color: TOP_F_DARK },
      ],
      0,
      0,
      1,
      1,
    );
    // 皮肤：左上受光 → 右下阴影（赛璐珞式两段过渡）。
    this.skinGradient = linearGradient(
      [
        { offset: 0, color: '#ffe4bd' },
        { offset: 0.5, color: SKIN },
        { offset: 1, color: SKIN_DARK },
      ],
      0,
      0,
      1,
      1,
    );
    this.skinGradientF = linearGradient(
      [
        { offset: 0, color: '#fff4f6' },
        { offset: 0.5, color: SKIN_F },
        { offset: 1, color: SKIN_F_DARK },
      ],
      0,
      0,
      1,
      1,
    );
    // 长发：顶部受光、发梢沉入暗紫。
    this.hairGradient = linearGradient(
      [
        { offset: 0, color: '#fdfdff' },
        { offset: 0.45, color: '#c9cddf' },
        { offset: 1, color: '#5c5f75' },
      ],
      0,
      0,
      1,
      1,
    );
    // 帽顶：斜向高光。
    this.capGradient = linearGradient(
      [
        { offset: 0, color: CAP_LIGHT },
        { offset: 0.55, color: CAP },
        { offset: 1, color: '#0a121a' },
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
    // 镰刀刃：黑铁刃身，暗红血光。
    this.scytheGradient = linearGradient(
      [
        { offset: 0, color: '#3a0a16' },
        { offset: 0.38, color: '#1a050a' },
        { offset: 0.75, color: '#0c0205' },
        { offset: 1, color: '#050103' },
      ],
      0,
      0,
      1,
      1,
    );
    // 刃口外发光：从刃尖亮到根部暗。
    this.bladeGlowGradient = linearGradient(
      [
        { offset: 0, color: 'rgba(255,226,232,0.95)' },
        { offset: 0.45, color: 'rgba(255,45,90,0.9)' },
        { offset: 1, color: 'rgba(140,8,34,0.2)' },
      ],
      0,
      0,
      1,
      0,
    );
    // 柄：横向金属圆柱（上亮下暗）。
    this.shaftGradient = linearGradient(
      [
        { offset: 0, color: SCYTHE_SHAFT_LIGHT },
        { offset: 0.35, color: SCYTHE_SHAFT },
        { offset: 1, color: '#150c1d' },
      ],
      0,
      0,
      0,
      1,
    );
    // 虹膜：中心品红、边缘深紫（局部径向）。
    this.irisGradient = radialGradient(
      [
        { offset: 0, color: '#ff98a8' },
        { offset: 0.55, color: '#e01f3d' },
        { offset: 1, color: '#4a0614' },
      ],
      0.5,
      0.5,
      0,
      0.5,
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
    this.visT = fc.vt;

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
    // 凛的立绘已就绪时，地面跑动改为「站在镰刀上飞」。
    const useSprite = this.female && this.rinSpritesReady;
    const riding = useSprite && walking;
    const laneWalk = clamp(Math.abs(targetY - y) / (s * 0.8), 0, 1);
    const walkAmp = jumping || falling || hold ? 0 : Math.max(laneWalk, walking ? 1 : 0);
    const walkPhase = fc.now * WALK_RATE;
    this.motionWalk = walkAmp;
    this.motionPhase = walkPhase;
    this.motionAir = jumping || falling;

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

    // 跑步时上身向前压一点，让「冲出去」更有重量感。
    if (walkAmp > 0 && !hold) bodyRot += 0.05 * walkAmp;

    // 落地压缩：身体略微压扁、重心下沉。
    if (this.landT > 0) squash = Math.max(squash, (this.landT / LAND_DUR) * 0.45);
    lift += squash * s * 0.1;
    const bob =
      jumping || falling
        ? 0
        : riding
          ? Math.sin(fc.vt * 2.6) * s * 0.035
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
    this.drawShadowAndDust(fc, playerX, bodyY, s, groundFeet, topY, walking, riding, walkPhase);

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

    // 凛：整只角色换成动画抠像立绘；程序化身体整体隐藏。
    this.setSpriteBodyMode(useSprite);

    if (useSprite) {
      this.drawRinSprite(
        fc,
        s,
        pairP,
        hold !== null,
        hold?.holding ?? false,
        walking,
        attackActive,
      );
      // 立绘自带镰刀与刀光；这里只负责清掉程序化残影，避免出现第二把镰刀。
      this.drawSwingGhosts(s, pivotX, pivotY, gripDist, trailFrom, clubA, laneColor, trail);
    } else {
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
    }

    // 受击红闪：立绘模式直接给贴图染色，避免程序化矩形盖在立绘上。
    if (useSprite) this.drawSpriteFlash(fc.playerFlash);
    else this.drawFlash(fc.playerFlash, s);

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
    this.visT = fc.vt;
    this.motionWalk = 0;
    this.motionPhase = 0;
    this.motionAir = pose.legTuck > 0.3;

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

    // 凛的分身同样用立绘（半透明由 container.alpha 控制）。
    const useSprite = this.female && this.rinSpritesReady;
    this.setSpriteBodyMode(useSprite);

    if (useSprite) {
      this.drawRinSpritePose(s, pose);
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
    } else {
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
  }

  /* ------------------------------------------------------------------ *
   * 凛的 2D 立绘
   * ------------------------------------------------------------------ */

  /** 异步解码 26 张立绘；失败时保持程序化身体，并在下次 prepare 重试。 */
  private loadRinSpriteTextures(): void {
    if (this.rinLoadStarted) return;
    this.rinLoadStarted = true;
    loadRinTextureSet().then(
      (set) => {
        this.rinIdleTextures = set.idle;
        this.rinAttackTextures = set.attack;
        this.rinRideTextures = set.ride;
        this.rinSpritesReady = true;
      },
      () => {
        this.rinLoadStarted = false;
      },
    );
  }

  /** 打开立绘模式时隐藏整套程序化身体；关闭时恢复（哲仍走程序化）。 */
  private setSpriteBodyMode(on: boolean): void {
    this.spriteRoot.visible = on;
    this.legsGfx.visible = !on;
    this.hairBackGfx.visible = !on;
    this.backArmGfx.visible = !on;
    this.torsoGfx.visible = !on;
    this.frontArmGfx.visible = !on;
    this.batRoot.visible = !on;
    // swingGfx 不隐藏，但立绘模式下每帧都会清空；残影节点则统一关掉。
    if (on) {
      for (const root of this.ghostRoots) root.visible = false;
    }
  }

  /**
   * 立绘的脚底锚点 + 缩放。
   *
   * 待机 / 骑乘两套原画朝向右侧；只有出招帧是朝左侧挥镰的，
   * 需要水平翻转（`mirrored`）才能让刀刃落向右侧的怪。
   */
  private positionRinSprite(s: number, mirrored: boolean): void {
    const scale = (RIN_SPRITE_BODY_R * s) / RIN_SPRITE_BODY_PX;
    this.sprite.anchor.set(RIN_SPRITE_ANCHOR_X, RIN_SPRITE_ANCHOR_Y);
    this.sprite.position.set(0, s * FEET_OFFSET_R);
    this.sprite.scale.set(mirrored ? -scale : scale, scale);
  }

  /** 骑镰姿态：锚点落在刀刃最低点，整体抬起一点，刀刃贴着地面悬浮（保持原画朝右）。 */
  private positionRideSprite(s: number): void {
    const scale = (RIN_SPRITE_BODY_R * s) / RIN_RIDE_BODY_PX;
    this.sprite.anchor.set(RIN_RIDE_ANCHOR_X, RIN_RIDE_ANCHOR_Y);
    this.sprite.position.set(0, s * (FEET_OFFSET_R - RIN_RIDE_HOVER_R));
    this.sprite.scale.set(scale, scale);
  }

  private idleTexture(index: number): Texture {
    return this.rinIdleTextures[index] ?? this.rinIdleTextures[0] ?? Texture.EMPTY;
  }

  private attackTexture(index: number): Texture {
    return this.rinAttackTextures[index] ?? this.rinAttackTextures[0] ?? Texture.EMPTY;
  }

  private rideTexture(index: number): Texture {
    return this.rinRideTextures[index] ?? this.rinRideTextures[0] ?? Texture.EMPTY;
  }

  /**
   * 本体立绘的帧选择：
   * - 出招：`ATTACK_DUR` 均分 12 帧，第 6 帧（举镰过顶 → 下劈命中）落在动作中段；
   * - 长按：0.24 秒一循环的「举镰 → 劈下 → 收势」；
   * - 双生：蓄力举镰 → 下劈 → 收势；
   * - 跑动：9 帧骑镰飞行循环（刀刃高度起伏）；
   * - 待机：5 帧呼吸循环。
   */
  private drawRinSprite(
    fc: FrameContext,
    s: number,
    pairP: number,
    holdActive: boolean,
    holding: boolean,
    walking: boolean,
    attackActive: boolean,
  ): void {
    let frame: Texture;
    // 出招帧原画朝左，需要镜像；待机 / 骑乘不镜像。
    let mirrored = false;
    const ride = walking && this.rinRideTextures.length > 0;
    if (attackActive) {
      const t = clamp(1 - fc.attackT / ATTACK_DUR, 0, 1);
      const n = this.rinAttackTextures.length;
      frame = this.attackTexture(Math.min(n - 1, Math.floor(t * n)));
      mirrored = true;
    } else if (holdActive) {
      mirrored = true;
      if (holding) {
        const h = ((fc.vt + 0.13) % HOLD_PERIOD) / HOLD_PERIOD;
        const k = Math.min(RIN_HOLD_FRAMES.length - 1, Math.floor(h * RIN_HOLD_FRAMES.length));
        frame = this.attackTexture(RIN_HOLD_FRAMES[k] ?? 4);
      } else {
        // 暂停 / 续按宽限：举镰等待。
        frame = this.attackTexture(2);
      }
    } else if (pairP > 0) {
      mirrored = true;
      if (pairP < 0.16) frame = this.attackTexture(1);
      else if (pairP < 0.58) frame = this.attackTexture(2);
      else if (pairP < 0.8) frame = this.attackTexture(pairP < 0.7 ? 5 : 6);
      else frame = this.attackTexture(7);
    } else if (ride) {
      const n = this.rinRideTextures.length;
      frame = this.rideTexture(Math.floor(fc.vt * RIN_RIDE_FPS) % n);
    } else {
      const n = this.rinIdleTextures.length;
      frame = this.idleTexture(n > 0 ? Math.floor(fc.vt * RIN_IDLE_FPS) % n : 0);
    }

    if (ride) this.positionRideSprite(s);
    else this.positionRinSprite(s, mirrored);
    if (this.sprite.texture !== frame) this.sprite.texture = frame;
  }

  /** 灵魂分身：飞行时举镰、挥击时取对应的出招帧。 */
  private drawRinSpritePose(s: number, pose: SoulPose): void {
    const a = pose.batA;
    const attacking = pose.trail > 0.04 || a < -1.4;
    const frame = attacking
      ? this.attackTexture(a < -1.2 ? 2 : a < 0.4 ? 5 : a < 1.0 ? 6 : 7)
      : this.idleTexture(0);
    this.positionRinSprite(s, attacking);
    if (this.sprite.texture !== frame) this.sprite.texture = frame;
  }

  destroy(): void {
    destroyGradient(this.bodyGradient);
    destroyGradient(this.bodyGradientF);
    destroyGradient(this.skinGradient);
    destroyGradient(this.skinGradientF);
    destroyGradient(this.hairGradient);
    destroyGradient(this.capGradient);
    destroyGradient(this.skirtGradient);
    destroyGradient(this.batGradient);
    destroyGradient(this.scytheGradient);
    destroyGradient(this.bladeGlowGradient);
    destroyGradient(this.shaftGradient);
    destroyGradient(this.irisGradient);
    destroyGradient(this.haloGradient);
    destroyGradient(this.burnGradient);
    destroyGradient(this.glowGradient);
    this.bodyGradient = null;
    this.bodyGradientF = null;
    this.skinGradient = null;
    this.skinGradientF = null;
    this.hairGradient = null;
    this.capGradient = null;
    this.skirtGradient = null;
    this.batGradient = null;
    this.scytheGradient = null;
    this.bladeGlowGradient = null;
    this.shaftGradient = null;
    this.irisGradient = null;
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
    riding: boolean,
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
    // 骑镰飞行时脚不沾地，改由画面里的刀刃起伏表现速度，不再扬尘。
    if (walking && !riding) {
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
    const legShade = this.female ? '#0d0814' : '#17232f';
    const legLight = this.female ? LEGGING_F_LIGHT : PANTS_LIGHT;
    const ink = this.female ? INK_RIN : INK_ZHE;
    const rim = this.female ? RIM_RIN : RIM_ZHE;
    const bootCol = this.female ? BOOT_F : SHOE;
    const bootLight = this.female ? BOOT_F_LIGHT : '#ffffff';
    const legW = s * (this.female ? 0.165 : 0.2);

    for (const sgn of SIDES) {
      const phase = sgn * swing;
      const hipX = sgn * s * 0.15;
      const footX = sgn * s * 0.2 + phase * s + tuck * s * 0.18;
      const kneeX = (hipX + footX) / 2 + sgn * s * 0.02;
      const kneeY = (hipY + footY - lift) / 2;
      const toeY = footY - lift;

      this.legPath.clear();
      this.legPath.moveTo(hipX, hipY);
      this.legPath.quadraticCurveTo(kneeX, kneeY, footX, toeY);

      // 墨线（比腿略粗一圈）→ 底色 → 暗面 → 轮廓光，四层把腿做成圆柱。
      setStroke(g, legW + s * 0.045, ink, 0.9, 'round');
      attachPath(g, this.legPath);
      g.stroke();
      setStroke(g, legW, legCol, 1, 'round');
      attachPath(g, this.legPath);
      g.stroke();

      setStroke(g, legW * 0.36, legShade, 0.55, 'round');
      g.beginPath();
      g.moveTo(hipX + s * 0.035, hipY + s * 0.02);
      g.quadraticCurveTo(kneeX + s * 0.035, kneeY, footX + s * 0.03, toeY - s * 0.02);
      g.stroke();

      setStroke(g, s * 0.028, legLight, 0.5, 'round');
      g.beginPath();
      g.moveTo(hipX - s * 0.045, hipY + s * 0.03);
      g.quadraticCurveTo(kneeX - s * 0.045, kneeY, footX - s * 0.045, toeY - s * 0.03);
      g.stroke();

      setStroke(g, s * 0.02, rim, 0.55, 'round');
      g.beginPath();
      g.moveTo(hipX - s * 0.065, hipY + s * 0.05);
      g.quadraticCurveTo(kneeX - s * 0.065, kneeY, footX - s * 0.065, toeY - s * 0.05);
      g.stroke();

      // 凛的过膝袜口：一道血红边。
      if (this.female) {
        setStroke(g, s * 0.035, SASH_F, 0.85, 'round');
        g.beginPath();
        g.moveTo(hipX - legW * 0.55, hipY + s * 0.11);
        g.lineTo(hipX + legW * 0.55, hipY + s * 0.11);
        g.stroke();
      }

      // 鞋：鞋头朝右，带鞋底厚度。
      const bootX = footX - s * 0.13;
      const bootW = s * (this.female ? 0.34 : 0.36);
      const bootH = s * 0.14;
      this.shoePath.clear();
      roundRectInto(this.shoePath, bootX, toeY - bootH * 0.62, bootW, bootH, s * 0.055);
      setFill(g, bootCol);
      attachPath(g, this.shoePath);
      g.fill();
      setStroke(g, s * 0.032, ink, 0.9);
      attachPath(g, this.shoePath);
      g.stroke();

      // 鞋面高光 / 鞋底。
      setFill(g, bootLight, this.female ? 0.45 : 0.85);
      this.shoePath.clear();
      roundRectInto(
        this.shoePath,
        bootX + s * 0.03,
        toeY - bootH * 0.5,
        bootW * 0.42,
        s * 0.035,
        s * 0.018,
      );
      attachPath(g, this.shoePath);
      g.fill();
      setFill(g, this.female ? '#0a060d' : '#b9aa93');
      this.shoePath.clear();
      roundRectInto(
        this.shoePath,
        bootX + s * 0.01,
        toeY + bootH * 0.22,
        bootW - s * 0.02,
        s * 0.045,
        s * 0.02,
      );
      attachPath(g, this.shoePath);
      g.fill();

      // 哲的球鞋红线 / 凛的靴口紫边。
      if (this.female) {
        setStroke(g, s * 0.03, BOOT_F_LIGHT, 0.9, 'round');
        g.beginPath();
        g.moveTo(bootX + s * 0.04, toeY - bootH * 0.6);
        g.lineTo(bootX + bootW - s * 0.04, toeY - bootH * 0.6);
        g.stroke();
      } else {
        setStroke(g, s * 0.025, CAP_BRIM, 0.9, 'round');
        g.beginPath();
        g.moveTo(bootX + s * 0.04, toeY - s * 0.015);
        g.lineTo(bootX + bootW - s * 0.06, toeY - s * 0.015);
        g.stroke();
      }
    }
  }

  /** 躯干：红色球衣 + 奶油色条纹（赛璐珞暗面 + 冷色轮廓光）。 */
  private drawTorso(s: number): void {
    if (this.female) {
      this.drawTorsoFemale(s);
      return;
    }
    const g = this.torsoGfx;
    g.clear();

    // 后肩：先铺一层暗色，让肩膀比胸腔退后半步。
    setFill(g, JERSEY_DARK, 0.9);
    g.beginPath();
    g.ellipse(0, -s * 0.42, s * 0.42, s * 0.18);
    g.fill();

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
    setStroke(g, s * 0.045, INK_ZHE, 0.9);
    attachPath(g, this.torsoPath);
    g.stroke();

    // 右半侧暗面：硬边，像动画上色的一层阴影。
    this.torsoShadePath.clear();
    this.torsoShadePath.moveTo(-s * 0.02, -s * 0.53);
    this.torsoShadePath.quadraticCurveTo(s * 0.24, -s * 0.5, s * 0.38, -s * 0.4);
    this.torsoShadePath.lineTo(s * 0.28, s * 0.2);
    this.torsoShadePath.quadraticCurveTo(s * 0.08, s * 0.3, -s * 0.02, s * 0.26);
    this.torsoShadePath.closePath();
    setFill(g, '#5c1a24', 0.34);
    attachPath(g, this.torsoShadePath);
    g.fill();

    // 左肩轮廓光 + 袖口高光。
    setStroke(g, s * 0.03, RIM_ZHE, 0.6, 'round');
    g.beginPath();
    g.moveTo(-s * 0.36, -s * 0.4);
    g.quadraticCurveTo(-s * 0.27, s * 0.02, -s * 0.24, s * 0.16);
    g.stroke();
    setStroke(g, s * 0.045, JERSEY_LIGHT, 0.5, 'round');
    g.beginPath();
    g.moveTo(-s * 0.3, -s * 0.42);
    g.quadraticCurveTo(-s * 0.16, -s * 0.5, -s * 0.02, -s * 0.49);
    g.stroke();

    // 奶油色胸带（下缘带一道暗边，做出布料的厚度）。
    setStroke(g, s * 0.09, '#8f2530', 0.75);
    g.beginPath();
    g.moveTo(-s * 0.33, -s * 0.04);
    g.quadraticCurveTo(0, s * 0.045, s * 0.33, -s * 0.04);
    g.stroke();
    setStroke(g, s * 0.075, TRIM);
    g.beginPath();
    g.moveTo(-s * 0.33, -s * 0.06);
    g.quadraticCurveTo(0, s * 0.02, s * 0.33, -s * 0.06);
    g.stroke();

    // 领口 + 锁骨阴影。
    setFill(g, 'rgba(30,8,12,.45)');
    g.beginPath();
    g.ellipse(0, -s * 0.47, s * 0.15, s * 0.045);
    g.fill();
    setStroke(g, s * 0.05, '#3a1519');
    g.beginPath();
    g.arc(0, -s * 0.46, s * 0.16, 0.15, Math.PI - 0.15);
    g.stroke();

    // 背号（一个简单的 7）。
    setStroke(g, s * 0.04, 'rgba(244,234,214,.9)', 1, 'round');
    g.beginPath();
    g.moveTo(-s * 0.11, s * 0.06);
    g.lineTo(s * 0.1, s * 0.02);
    g.lineTo(-s * 0.03, s * 0.2);
    g.stroke();
    g.beginPath();
    g.moveTo(-s * 0.13, s * 0.2);
    g.lineTo(s * 0.06, s * 0.24);
    g.stroke();

    // 下摆束口。
    setStroke(g, s * 0.045, '#53161d', 0.9);
    g.beginPath();
    g.moveTo(-s * 0.28, s * 0.27);
    g.quadraticCurveTo(0, s * 0.37, s * 0.28, s * 0.27);
    g.stroke();
  }

  /** 凛的躯干：青绿短打 + 紫裙 + 粉色腰带（分层裙摆 + 赛璐珞明暗）。 */
  private drawTorsoFemale(s: number): void {
    const g = this.torsoGfx;
    g.clear();

    // 次级运动：走路 / 腾空时裙摆左右摆、整体上扬。
    const sway =
      Math.sin(this.visT * 3.3) * s * 0.018 * (0.4 + this.motionWalk) +
      Math.cos(this.visT * 5.1) * s * 0.006;
    const hemLift = this.motionAir ? s * 0.05 : 0;

    // 裙后片：更暗、更宽，先铺出体积。
    this.skirtBackPath.clear();
    this.skirtBackPath.moveTo(-s * 0.28, s * 0.06);
    this.skirtBackPath.lineTo(-s * 0.52 + sway * 0.6, s * 0.46 - hemLift);
    this.skirtBackPath.quadraticCurveTo(
      sway * 0.6,
      s * 0.6 - hemLift,
      s * 0.52 + sway * 0.6,
      s * 0.46 - hemLift,
    );
    this.skirtBackPath.lineTo(s * 0.28, s * 0.06);
    this.skirtBackPath.closePath();
    setFill(g, SKIRT_F_DARK);
    attachPath(g, this.skirtBackPath);
    g.fill();

    // 裙前片。
    this.skirtPath.clear();
    this.skirtPath.moveTo(-s * 0.27, s * 0.1);
    this.skirtPath.lineTo(-s * 0.47 + sway, s * 0.44 - hemLift);
    this.skirtPath.quadraticCurveTo(sway, s * 0.55 - hemLift, s * 0.47 + sway, s * 0.44 - hemLift);
    this.skirtPath.lineTo(s * 0.27, s * 0.1);
    this.skirtPath.closePath();
    if (this.skirtGradient) {
      setFillGradient(g, this.skirtGradient, 1);
    } else {
      setFill(g, SKIRT_F);
    }
    attachPath(g, this.skirtPath);
    g.fill();
    setStroke(g, s * 0.04, INK_RIN, 0.9);
    attachPath(g, this.skirtPath);
    g.stroke();

    // 右半侧暗面 + 裙摆内侧阴影。
    this.torsoShadePath.clear();
    this.torsoShadePath.moveTo(s * 0.05, s * 0.1);
    this.torsoShadePath.lineTo(s * 0.3, s * 0.1);
    this.torsoShadePath.lineTo(s * 0.48 + sway, s * 0.45 - hemLift);
    this.torsoShadePath.quadraticCurveTo(
      s * 0.2 + sway,
      s * 0.52 - hemLift,
      s * 0.08 + sway * 0.5,
      s * 0.45 - hemLift,
    );
    this.torsoShadePath.closePath();
    setFill(g, '#050308', 0.32);
    attachPath(g, this.torsoShadePath);
    g.fill();

    // 褶皱：亮暗交替，让裙摆有立体的折面。
    for (let i = -1; i <= 1; i++) {
      setStroke(g, s * 0.035, i === 0 ? SKIRT_F_LIGHT : '#0d0712', i === 0 ? 0.55 : 0.5, 'round');
      g.beginPath();
      g.moveTo(s * i * 0.1, s * 0.14);
      g.quadraticCurveTo(
        s * i * 0.16 + sway * 0.5,
        s * 0.32,
        s * i * 0.22 + sway,
        s * 0.45 - hemLift,
      );
      g.stroke();
    }

    // 裙摆下缘：血红发光的滚边。
    setStroke(g, s * 0.055, SASH_F, 0.28, 'round');
    g.beginPath();
    g.moveTo(-s * 0.45 + sway, s * 0.45 - hemLift);
    g.quadraticCurveTo(sway, s * 0.56 - hemLift, s * 0.45 + sway, s * 0.45 - hemLift);
    g.stroke();
    setStroke(g, s * 0.022, SASH_F_LIGHT, 0.9, 'round');
    g.beginPath();
    g.moveTo(-s * 0.45 + sway, s * 0.45 - hemLift);
    g.quadraticCurveTo(sway, s * 0.56 - hemLift, s * 0.45 + sway, s * 0.45 - hemLift);
    g.stroke();

    // 上衣：窄肩收腰，胸前留一点厚度。
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
    setStroke(g, s * 0.04, INK_RIN, 0.9);
    attachPath(g, this.torsoPath);
    g.stroke();

    // 上衣右侧暗面。
    this.torsoShadePath.clear();
    this.torsoShadePath.moveTo(s * 0.02, -s * 0.52);
    this.torsoShadePath.quadraticCurveTo(s * 0.2, -s * 0.48, s * 0.31, -s * 0.42);
    this.torsoShadePath.lineTo(s * 0.23, s * 0.1);
    this.torsoShadePath.quadraticCurveTo(s * 0.1, s * 0.16, s * 0.02, s * 0.14);
    this.torsoShadePath.closePath();
    setFill(g, '#030205', 0.45);
    attachPath(g, this.torsoShadePath);
    g.fill();

    // 下颌投在上胸的硬边阴影。
    setFill(g, '#030205', 0.38);
    this.torsoShadePath.clear();
    this.torsoShadePath.moveTo(-s * 0.22, -s * 0.47);
    this.torsoShadePath.quadraticCurveTo(0, -s * 0.31, s * 0.22, -s * 0.47);
    this.torsoShadePath.quadraticCurveTo(0, -s * 0.39, -s * 0.22, -s * 0.47);
    this.torsoShadePath.closePath();
    attachPath(g, this.torsoShadePath);
    g.fill();

    // 哥特露肩：肩头露出一截苍白皮肤，黑色臂环落在上臂。
    setFill(g, SKIN_F);
    g.beginPath();
    g.ellipse(-s * 0.295, -s * 0.425, s * 0.085, s * 0.068);
    g.fill();
    g.beginPath();
    g.ellipse(s * 0.295, -s * 0.425, s * 0.085, s * 0.068);
    g.fill();
    setFill(g, SKIN_F_SHADE, 0.4);
    g.beginPath();
    g.ellipse(s * 0.31, -s * 0.42, s * 0.055, s * 0.05);
    g.fill();

    // 左肩轮廓光 + 胸口高光。
    setStroke(g, s * 0.03, RIM_RIN, 0.6, 'round');
    g.beginPath();
    g.moveTo(-s * 0.3, -s * 0.42);
    g.quadraticCurveTo(-s * 0.24, -s * 0.05, -s * 0.2, s * 0.1);
    g.stroke();
    setStroke(g, s * 0.05, TOP_F_LIGHT, 0.45, 'round');
    g.beginPath();
    g.moveTo(-s * 0.26, -s * 0.4);
    g.quadraticCurveTo(-s * 0.1, -s * 0.48, s * 0.04, -s * 0.46);
    g.stroke();

    // 深 V 领口：苍白胸口 + 黑缎包边 + 血红内线。
    setFill(g, SKIN_F);
    this.headPath.clear();
    this.headPath.moveTo(-s * 0.155, -s * 0.44);
    this.headPath.lineTo(0, -s * 0.19);
    this.headPath.lineTo(s * 0.16, -s * 0.44);
    this.headPath.quadraticCurveTo(0, -s * 0.47, -s * 0.155, -s * 0.44);
    this.headPath.closePath();
    attachPath(g, this.headPath);
    g.fill();
    setFill(g, SKIN_F_SHADE, 0.34);
    this.headPath.clear();
    this.headPath.moveTo(0, -s * 0.2);
    this.headPath.lineTo(s * 0.16, -s * 0.44);
    this.headPath.quadraticCurveTo(s * 0.02, -s * 0.465, -s * 0.01, -s * 0.455);
    this.headPath.closePath();
    attachPath(g, this.headPath);
    g.fill();
    setStroke(g, s * 0.055, '#0b0710', 0.95, 'round');
    g.beginPath();
    g.moveTo(-s * 0.165, -s * 0.445);
    g.lineTo(0, -s * 0.19);
    g.lineTo(s * 0.165, -s * 0.445);
    g.stroke();
    setStroke(g, s * 0.017, SASH_F_LIGHT, 0.85, 'round');
    g.beginPath();
    g.moveTo(-s * 0.128, -s * 0.44);
    g.lineTo(0, -s * 0.24);
    g.lineTo(s * 0.128, -s * 0.44);
    g.stroke();

    // 胸口血红宝石 + 光晕。
    setFill(g, SASH_F, 0.3);
    g.beginPath();
    g.circle(0, -s * 0.245, s * 0.078);
    g.fill();
    setFill(g, SASH_F_LIGHT);
    g.beginPath();
    g.moveTo(0, -s * 0.31);
    g.lineTo(s * 0.042, -s * 0.245);
    g.lineTo(0, -s * 0.18);
    g.lineTo(-s * 0.042, -s * 0.245);
    g.closePath();
    g.fill();
    setFill(g, '#ffe4e9', 0.95);
    g.beginPath();
    g.moveTo(0, -s * 0.295);
    g.lineTo(s * 0.016, -s * 0.245);
    g.lineTo(0, -s * 0.205);
    g.closePath();
    g.fill();

    // 胸衣红饰纹：两侧藤蔓卷草 + 珠点。
    setStroke(g, s * 0.013, SASH_F_LIGHT, 0.72, 'round');
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(side * s * 0.245, -s * 0.38);
      g.quadraticCurveTo(side * s * 0.12, -s * 0.31, side * s * 0.18, -s * 0.17);
      g.quadraticCurveTo(side * s * 0.225, -s * 0.07, side * s * 0.155, s * 0.005);
      g.stroke();
      setFill(g, SASH_F_LIGHT, 0.85);
      g.beginPath();
      g.circle(side * s * 0.215, -s * 0.275, s * 0.014);
      g.fill();
    }

    // 哥特高立领：黑缎面 + 血红滚边，压住领口上沿。
    this.headPath.clear();
    this.headPath.moveTo(-s * 0.19, -s * 0.43);
    this.headPath.quadraticCurveTo(-s * 0.2, -s * 0.58, -s * 0.1, -s * 0.6);
    this.headPath.lineTo(s * 0.1, -s * 0.6);
    this.headPath.quadraticCurveTo(s * 0.2, -s * 0.58, s * 0.19, -s * 0.43);
    this.headPath.quadraticCurveTo(0, -s * 0.385, -s * 0.19, -s * 0.43);
    this.headPath.closePath();
    setFill(g, '#0a060d');
    attachPath(g, this.headPath);
    g.fill();
    setStroke(g, s * 0.022, INK_RIN, 0.95);
    attachPath(g, this.headPath);
    g.stroke();
    setStroke(g, s * 0.014, SASH_F_LIGHT, 0.75, 'round');
    g.beginPath();
    g.moveTo(-s * 0.175, -s * 0.435);
    g.quadraticCurveTo(0, -s * 0.39, s * 0.175, -s * 0.435);
    g.stroke();

    // 束腰：黑皮 + 血红滚边 + 交叉系带。
    setFill(g, '#0b0710');
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.285, s * 0.055, s * 0.57, s * 0.16, s * 0.045);
    attachPath(g, this.headPath);
    g.fill();
    setStroke(g, s * 0.022, INK_RIN, 0.95);
    attachPath(g, this.headPath);
    g.stroke();
    setStroke(g, s * 0.015, SASH_F, 0.85, 'round');
    g.beginPath();
    g.moveTo(-s * 0.255, s * 0.078);
    g.quadraticCurveTo(0, s * 0.098, s * 0.255, s * 0.078);
    g.stroke();
    setStroke(g, s * 0.012, SASH_F_LIGHT, 0.7, 'round');
    g.beginPath();
    g.moveTo(-s * 0.245, s * 0.195);
    g.quadraticCurveTo(0, s * 0.212, s * 0.245, s * 0.195);
    g.stroke();
    setStroke(g, s * 0.016, SASH_F_LIGHT, 0.85, 'round');
    for (let i = 0; i < 3; i++) {
      const y0 = s * (0.085 + i * 0.04);
      const y1 = y0 + s * 0.036;
      g.beginPath();
      g.moveTo(-s * 0.055, y0);
      g.lineTo(s * 0.055, y1);
      g.moveTo(s * 0.055, y0);
      g.lineTo(-s * 0.055, y1);
      g.stroke();
    }

    const knotX = -s * 0.26;
    const knotY = s * 0.135;
    setFill(g, SASH_F);
    g.beginPath();
    g.ellipse(knotX, knotY, s * 0.075, s * 0.06);
    g.fill();
    setStroke(g, s * 0.025, '#3a0710', 0.9);
    g.beginPath();
    g.ellipse(knotX, knotY, s * 0.075, s * 0.06);
    g.stroke();
    setFill(g, SASH_F_LIGHT, 0.8);
    g.beginPath();
    g.ellipse(knotX - s * 0.02, knotY - s * 0.018, s * 0.03, s * 0.022);
    g.fill();

    const tailSway = Math.sin(this.visT * 4.2) * s * 0.025 + this.motionWalk * s * 0.02;
    setFill(g, SASH_F, 0.95);
    this.ribbonPath.clear();
    this.ribbonPath.moveTo(knotX, knotY);
    this.ribbonPath.quadraticCurveTo(
      knotX - s * 0.1,
      knotY + s * (0.12 + tailSway / s),
      knotX - s * 0.06 + tailSway,
      knotY + s * 0.26,
    );
    this.ribbonPath.lineTo(knotX + s * 0.02 + tailSway, knotY + s * 0.24);
    this.ribbonPath.quadraticCurveTo(knotX + s * 0.02, knotY + s * 0.14, knotX, knotY);
    this.ribbonPath.closePath();
    attachPath(g, this.ribbonPath);
    g.fill();
    setStroke(g, s * 0.018, SASH_F_LIGHT, 0.8);
    attachPath(g, this.ribbonPath);
    g.stroke();
  }

  /** 头：棒球帽 + 侧脸（下颌线 + 帽檐阴影 + 大眼）。 */
  private drawHead(fc: FrameContext, s: number): void {
    if (this.female) {
      this.drawHeadFemale(fc, s);
      return;
    }
    const g = this.torsoGfx;
    const hx = s * 0.04;
    const hy = -s * 0.8;
    const hr = s * 0.3;
    const lowHp = fc.maxHp > 0 && fc.hp / fc.maxHp <= 0.3;

    // 脖子 + 下颌投影。
    setFill(g, SKIN_DARK);
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.09, -s * 0.58, s * 0.2, s * 0.2, s * 0.05);
    attachPath(g, this.headPath);
    g.fill();
    setFill(g, 'rgba(110,55,30,.3)');
    g.beginPath();
    g.ellipse(hx - s * 0.02, hy + hr * 0.82, hr * 0.48, hr * 0.16);
    g.fill();

    // 侧脸：额头 → 鼻梁 → 下巴，比正圆更有二次元的尖下颌。
    this.facePath.clear();
    this.facePath.moveTo(hx - hr * 0.95, hy - hr * 0.45);
    this.facePath.quadraticCurveTo(hx, hy - hr * 1.04, hx + hr * 0.92, hy - hr * 0.5);
    this.facePath.quadraticCurveTo(hx + hr * 1.02, hy, hx + hr * 0.64, hy + hr * 0.52);
    this.facePath.quadraticCurveTo(hx + hr * 0.46, hy + hr * 0.9, hx + hr * 0.12, hy + hr * 0.93);
    this.facePath.quadraticCurveTo(hx - hr * 0.5, hy + hr * 0.78, hx - hr * 0.78, hy + hr * 0.25);
    this.facePath.closePath();
    if (this.skinGradient) {
      setFillGradient(g, this.skinGradient, 1);
    } else {
      setFill(g, SKIN);
    }
    attachPath(g, this.facePath);
    g.fill();
    setStroke(g, s * 0.03, INK_ZHE, 0.7);
    attachPath(g, this.facePath);
    g.stroke();

    // 耳朵。
    setFill(g, SKIN_DARK);
    g.beginPath();
    g.ellipse(hx - hr * 0.86, hy + hr * 0.12, s * 0.075, s * 0.09);
    g.fill();
    setStroke(g, s * 0.02, 'rgba(90,50,30,.55)');
    g.beginPath();
    g.arc(hx - hr * 0.86, hy + hr * 0.12, s * 0.04, -0.5, Math.PI * 0.9);
    g.stroke();

    // 鬓角 + 后脑短发。
    setFill(g, '#3a2a24');
    this.hairPath.clear();
    this.hairPath.moveTo(hx - hr * 1.02, hy - hr * 0.35);
    this.hairPath.lineTo(hx - hr * 1.12, hy + hr * 0.45);
    this.hairPath.lineTo(hx - hr * 0.88, hy + hr * 0.54);
    this.hairPath.lineTo(hx - hr * 0.82, hy + hr * 0.02);
    this.hairPath.closePath();
    attachPath(g, this.hairPath);
    g.fill();

    // 帽檐下的额发。
    setFill(g, '#2c1f1b');
    this.hairPath.clear();
    this.hairPath.moveTo(hx - hr * 0.92, hy - hr * 0.36);
    this.hairPath.quadraticCurveTo(hx - hr * 0.2, hy - hr * 0.02, hx + hr * 0.72, hy - hr * 0.24);
    this.hairPath.quadraticCurveTo(hx + hr * 0.3, hy - hr * 0.32, hx - hr * 0.1, hy - hr * 0.24);
    this.hairPath.quadraticCurveTo(hx - hr * 0.5, hy - hr * 0.18, hx - hr * 0.92, hy - hr * 0.36);
    this.hairPath.closePath();
    attachPath(g, this.hairPath);
    g.fill();

    // 帽子：有厚度的帽檐 + 受光的帽顶。
    this.hatPath.clear();
    this.hatPath.moveTo(hx - hr * 1.06, hy - hr * 0.2);
    this.hatPath.arc(hx, hy - hr * 0.2, hr * 1.06, Math.PI, Math.PI * 2);
    this.hatPath.closePath();
    if (this.capGradient) {
      setFillGradient(g, this.capGradient, 1);
    } else {
      setFill(g, CAP);
    }
    attachPath(g, this.hatPath);
    g.fill();
    setStroke(g, s * 0.028, INK_ZHE, 0.8);
    attachPath(g, this.hatPath);
    g.stroke();

    // 帽顶高光与拼缝。
    setStroke(g, s * 0.03, CAP_LIGHT, 0.75, 'round');
    g.beginPath();
    g.moveTo(hx - hr * 0.72, hy - hr * 0.5);
    g.quadraticCurveTo(hx - hr * 0.28, hy - hr * 0.96, hx + hr * 0.18, hy - hr * 0.9);
    g.stroke();
    setStroke(g, s * 0.016, 'rgba(8,16,24,.6)');
    g.beginPath();
    g.moveTo(hx - hr * 0.1, hy - hr * 1.24);
    g.lineTo(hx - hr * 0.05, hy - hr * 0.55);
    g.stroke();

    // 帽檐：先暗面再亮面。
    setFill(g, '#6d1e26');
    this.hatPath.clear();
    roundRectInto(this.hatPath, hx + hr * 0.02, hy - hr * 0.32, hr * 1.18, s * 0.055, s * 0.026);
    attachPath(g, this.hatPath);
    g.fill();
    setFill(g, CAP_BRIM);
    this.hatPath.clear();
    roundRectInto(this.hatPath, hx + hr * 0.02, hy - hr * 0.38, hr * 1.12, s * 0.05, s * 0.024);
    attachPath(g, this.hatPath);
    g.fill();
    setStroke(g, s * 0.022, INK_ZHE, 0.85);
    attachPath(g, this.hatPath);
    g.stroke();
    setStroke(g, s * 0.018, '#ff8a76', 0.8);
    g.beginPath();
    g.moveTo(hx + hr * 0.14, hy - hr * 0.36);
    g.lineTo(hx + hr * 1.0, hy - hr * 0.36);
    g.stroke();

    // 帽扣。
    setFill(g, '#2b3f52');
    g.beginPath();
    g.circle(hx, hy - hr * 1.24, s * 0.035);
    g.fill();

    // 眼睛：白眼球 + 深色虹膜 + 高光，低血量转红。
    const eyeX = hx + hr * 0.42;
    const eyeY = hy + hr * 0.06;
    setFill(g, '#fff8ee', 0.95);
    g.beginPath();
    g.ellipse(eyeX, eyeY, hr * 0.19, hr * 0.2);
    g.fill();
    setFill(g, lowHp ? '#ff3d5e' : '#1a2836');
    g.beginPath();
    g.ellipse(eyeX + hr * 0.025, eyeY + hr * 0.02, hr * 0.11, hr * 0.15);
    g.fill();
    setFill(g, '#ffffff', 0.95);
    g.beginPath();
    g.circle(eyeX - hr * 0.02, eyeY - hr * 0.05, hr * 0.035);
    g.fill();

    // 上眼睑 / 眉毛：出手时更凶。
    setStroke(g, s * 0.028, INK_ZHE, 1, 'round');
    g.beginPath();
    g.moveTo(eyeX - hr * 0.2, eyeY - hr * 0.14);
    g.quadraticCurveTo(eyeX, eyeY - hr * 0.28, eyeX + hr * 0.24, eyeY - hr * 0.12);
    g.stroke();
    setStroke(g, s * 0.03, '#3a2a24', 1, 'round');
    g.beginPath();
    g.moveTo(eyeX - hr * 0.18, eyeY - hr * 0.32);
    g.lineTo(eyeX + hr * 0.24, eyeY - hr * 0.22);
    g.stroke();

    // 鼻梁 / 嘴。
    setStroke(g, s * 0.02, 'rgba(130,70,45,.7)', 1, 'round');
    g.beginPath();
    g.moveTo(hx + hr * 0.72, hy + hr * 0.1);
    g.lineTo(hx + hr * 0.8, hy + hr * 0.3);
    g.stroke();
    setStroke(g, s * 0.024, 'rgba(120,60,40,.8)');
    g.beginPath();
    g.moveTo(hx + hr * 0.36, hy + hr * 0.66);
    g.lineTo(hx + hr * 0.66, hy + hr * 0.63);
    g.stroke();

    // 帽檐投影：压在额头上的一层暗色。
    setFill(g, 'rgba(70,30,25,.25)');
    g.beginPath();
    g.ellipse(hx + hr * 0.1, hy - hr * 0.28, hr * 0.7, hr * 0.07);
    g.fill();
  }

  /** 凛的头：银白长发 + 刘海 + 哥特冠饰 + 二次元大眼（无帽）。 */
  private drawHeadFemale(fc: FrameContext, s: number): void {
    const g = this.torsoGfx;
    const hx = s * 0.04;
    const hy = -s * 0.81;
    const hr = s * 0.31;
    const lowHp = fc.maxHp > 0 && fc.hp / fc.maxHp <= 0.3;
    const eyeTint = fc.burning ? '#ff2d4a' : lowHp ? '#ff4d6d' : null;

    // 脖子 + 下颌投影。
    setFill(g, SKIN_F_DARK);
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.09, -s * 0.59, s * 0.2, s * 0.21, s * 0.05);
    attachPath(g, this.headPath);
    g.fill();
    setFill(g, SKIN_F_SHADE, 0.55);
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.09, -s * 0.59, s * 0.08, s * 0.18, s * 0.04);
    attachPath(g, this.headPath);
    g.fill();

    // 脸：尖下颌 + 柔和轮廓。
    this.facePath.clear();
    this.facePath.moveTo(hx - hr * 0.96, hy - hr * 0.42);
    this.facePath.quadraticCurveTo(hx, hy - hr * 1.02, hx + hr * 0.9, hy - hr * 0.48);
    this.facePath.quadraticCurveTo(hx + hr * 1.02, hy + hr * 0.02, hx + hr * 0.62, hy + hr * 0.55);
    this.facePath.quadraticCurveTo(hx + hr * 0.44, hy + hr * 0.92, hx + hr * 0.12, hy + hr * 0.95);
    this.facePath.quadraticCurveTo(hx - hr * 0.5, hy + hr * 0.8, hx - hr * 0.8, hy + hr * 0.26);
    this.facePath.closePath();
    if (this.skinGradientF) {
      setFillGradient(g, this.skinGradientF, 1);
    } else {
      setFill(g, SKIN_F);
    }
    attachPath(g, this.facePath);
    g.fill();
    setStroke(g, s * 0.028, INK_RIN, 0.72);
    attachPath(g, this.facePath);
    g.stroke();

    // 刘海下的额头阴影。
    setFill(g, SKIN_F_SHADE, 0.38);
    this.hairPath.clear();
    this.hairPath.moveTo(hx - hr * 0.9, hy - hr * 0.3);
    this.hairPath.quadraticCurveTo(hx, hy - hr * 0.62, hx + hr * 0.86, hy - hr * 0.3);
    this.hairPath.quadraticCurveTo(hx + hr * 0.3, hy - hr * 0.1, hx - hr * 0.9, hy - hr * 0.3);
    this.hairPath.closePath();
    attachPath(g, this.hairPath);
    g.fill();

    // 耳朵。
    setFill(g, SKIN_F_DARK);
    g.beginPath();
    g.ellipse(hx - hr * 0.88, hy + hr * 0.12, s * 0.07, s * 0.095);
    g.fill();

    // 远侧眼睛（稍小、稍暗）与近侧大眼。
    for (let i = 0; i < 2; i++) {
      const far = i === 0;
      const sc = far ? 0.8 : 1;
      const ex = hx + hr * (far ? 0.03 : 0.56);
      const ey = hy + hr * (far ? 0.1 : 0.08);

      // 红瞳的淡淡光晕（燃魂时更亮）。
      setFill(g, '#ff2a4a', fc.burning ? 0.24 : 0.1);
      g.beginPath();
      g.ellipse(ex, ey, hr * 0.32 * sc, hr * 0.38 * sc);
      g.fill();

      // 眼白。
      setFill(g, '#fff5f7', far ? 0.92 : 0.98);
      g.beginPath();
      g.ellipse(ex, ey, hr * 0.2 * sc, hr * 0.27 * sc);
      g.fill();

      // 虹膜：血红径向渐变 / 低血量与燃魂时的纯色。
      const irx = hr * 0.135 * sc;
      const iry = hr * 0.2 * sc;
      if (eyeTint) {
        setFill(g, eyeTint);
      } else if (this.irisGradient) {
        setFillGradient(g, this.irisGradient, far ? 0.95 : 1);
      } else {
        setFill(g, '#e01f3d');
      }
      g.beginPath();
      g.ellipse(ex + hr * 0.015, ey + hr * 0.02, irx, iry);
      g.fill();

      // 瞳孔。
      setFill(g, '#2a050c', 0.92);
      g.beginPath();
      g.ellipse(ex + hr * 0.02, ey + hr * 0.03, irx * 0.48, iry * 0.62);
      g.fill();

      // 双高光：左上大、右下小。
      setFill(g, '#ffffff', 0.95);
      g.beginPath();
      g.circle(ex - hr * 0.05 * sc, ey - hr * 0.08 * sc, hr * 0.052 * sc);
      g.fill();
      g.beginPath();
      g.circle(ex + hr * 0.07 * sc, ey + hr * 0.09 * sc, hr * 0.025 * sc);
      g.fill();

      // 上睫毛：粗、外眼角上挑。
      setStroke(g, s * 0.032, '#1b0a26', 1, 'round');
      g.beginPath();
      g.moveTo(ex - hr * 0.21 * sc, ey - hr * 0.15 * sc);
      g.quadraticCurveTo(ex, ey - hr * 0.32 * sc, ex + hr * 0.24 * sc, ey - hr * 0.14 * sc);
      g.stroke();
      setStroke(g, s * 0.024, '#1b0a26', 1, 'round');
      g.beginPath();
      g.moveTo(ex + hr * 0.18 * sc, ey - hr * 0.2 * sc);
      g.lineTo(ex + hr * 0.3 * sc, ey - hr * 0.3 * sc);
      g.stroke();

      // 下眼睑。
      setStroke(g, s * 0.012, 'rgba(110,40,80,.55)', 1, 'round');
      g.beginPath();
      g.moveTo(ex - hr * 0.14 * sc, ey + hr * 0.2 * sc);
      g.quadraticCurveTo(ex, ey + hr * 0.3 * sc, ex + hr * 0.18 * sc, ey + hr * 0.18 * sc);
      g.stroke();

      // 眉毛：细、带一点凌厉的弧度。
      setStroke(g, s * 0.022, '#5a5268', 0.95, 'round');
      g.beginPath();
      g.moveTo(ex - hr * 0.17 * sc, ey - hr * 0.38 * sc);
      g.quadraticCurveTo(ex, ey - hr * 0.44 * sc, ex + hr * 0.15 * sc, ey - hr * 0.36 * sc);
      g.stroke();
    }

    // 鼻尖 / 嘴 / 腮红。
    setStroke(g, s * 0.016, 'rgba(150,80,90,.7)', 1, 'round');
    g.beginPath();
    g.moveTo(hx + hr * 0.72, hy + hr * 0.28);
    g.lineTo(hx + hr * 0.8, hy + hr * 0.34);
    g.stroke();

    setFill(g, '#a51c36');
    this.eyePath.clear();
    this.eyePath.moveTo(hx + hr * 0.3, hy + hr * 0.62);
    this.eyePath.quadraticCurveTo(hx + hr * 0.46, hy + hr * 0.72, hx + hr * 0.62, hy + hr * 0.6);
    this.eyePath.quadraticCurveTo(hx + hr * 0.46, hy + hr * 0.64, hx + hr * 0.3, hy + hr * 0.62);
    this.eyePath.closePath();
    attachPath(g, this.eyePath);
    g.fill();

    setFill(g, '#e07a8c', 0.22);
    g.beginPath();
    g.ellipse(hx + hr * 0.44, hy + hr * 0.44, hr * 0.2, hr * 0.1);
    g.fill();
    g.beginPath();
    g.ellipse(hx - hr * 0.32, hy + hr * 0.44, hr * 0.14, hr * 0.08);
    g.fill();

    // 头顶发盖。
    this.hairMassPath.clear();
    this.hairMassPath.moveTo(hx - hr * 1.08, hy - hr * 0.08);
    this.hairMassPath.quadraticCurveTo(
      hx - hr * 1.02,
      hy - hr * 1.18,
      hx + hr * 0.18,
      hy - hr * 1.16,
    );
    this.hairMassPath.quadraticCurveTo(
      hx + hr * 1.14,
      hy - hr * 1.04,
      hx + hr * 1.08,
      hy - hr * 0.1,
    );
    this.hairMassPath.quadraticCurveTo(hx + hr * 0.7, hy - hr * 0.5, hx + hr * 0.2, hy - hr * 0.62);
    this.hairMassPath.quadraticCurveTo(
      hx - hr * 0.5,
      hy - hr * 0.6,
      hx - hr * 0.96,
      hy - hr * 0.16,
    );
    this.hairMassPath.closePath();
    if (this.hairGradient) {
      setFillGradient(g, this.hairGradient, 1);
    } else {
      setFill(g, HAIR_F);
    }
    attachPath(g, this.hairMassPath);
    g.fill();
    setStroke(g, s * 0.025, INK_RIN, 0.85);
    attachPath(g, this.hairMassPath);
    g.stroke();

    // 刘海：三缕带尖的发束，向右扫；发梢抬高，露出双眼。
    this.hairPath.clear();
    this.hairPath.moveTo(hx - hr * 1.06, hy - hr * 0.2);
    this.hairPath.quadraticCurveTo(hx - hr * 0.75, hy - hr * 0.92, hx + hr * 0.05, hy - hr * 1.04);
    this.hairPath.quadraticCurveTo(hx + hr * 0.9, hy - hr * 0.96, hx + hr * 1.08, hy - hr * 0.26);
    this.hairPath.quadraticCurveTo(hx + hr * 0.92, hy - hr * 0.56, hx + hr * 0.7, hy - hr * 0.42);
    this.hairPath.lineTo(hx + hr * 0.6, hy - hr * 0.24);
    this.hairPath.quadraticCurveTo(hx + hr * 0.5, hy - hr * 0.54, hx + hr * 0.38, hy - hr * 0.58);
    this.hairPath.lineTo(hx + hr * 0.24, hy - hr * 0.34);
    this.hairPath.quadraticCurveTo(hx + hr * 0.12, hy - hr * 0.64, hx - hr * 0.02, hy - hr * 0.6);
    this.hairPath.lineTo(hx - hr * 0.2, hy - hr * 0.3);
    this.hairPath.quadraticCurveTo(hx - hr * 0.38, hy - hr * 0.56, hx - hr * 0.52, hy - hr * 0.38);
    this.hairPath.lineTo(hx - hr * 0.66, hy - hr * 0.16);
    this.hairPath.quadraticCurveTo(hx - hr * 0.86, hy - hr * 0.3, hx - hr * 1.06, hy - hr * 0.2);
    this.hairPath.closePath();
    attachPath(g, this.hairPath);
    g.fill();
    setStroke(g, s * 0.02, INK_RIN, 0.7);
    attachPath(g, this.hairPath);
    g.stroke();

    // 刘海发梢的亮丝，勾出每一缕的厚度。
    setStroke(g, s * 0.016, HAIR_F_LIGHT, 0.5, 'round');
    g.beginPath();
    g.moveTo(hx - hr * 0.62, hy - hr * 0.2);
    g.quadraticCurveTo(hx - hr * 0.42, hy - hr * 0.44, hx - hr * 0.26, hy - hr * 0.34);
    g.stroke();
    setStroke(g, s * 0.014, HAIR_F_GLOSS, 0.45, 'round');
    g.beginPath();
    g.moveTo(hx + hr * 0.46, hy - hr * 0.42);
    g.quadraticCurveTo(hx + hr * 0.56, hy - hr * 0.5, hx + hr * 0.64, hy - hr * 0.32);
    g.stroke();

    // 发丝高光带 + 两缕亮丝。
    setStroke(g, s * 0.045, HAIR_F_GLOSS, 0.65, 'round');
    g.beginPath();
    g.moveTo(hx - hr * 0.78, hy - hr * 0.72);
    g.quadraticCurveTo(hx - hr * 0.2, hy - hr * 1.02, hx + hr * 0.52, hy - hr * 0.84);
    g.stroke();
    setStroke(g, s * 0.02, HAIR_F_LIGHT, 0.9, 'round');
    g.beginPath();
    g.moveTo(hx - hr * 0.55, hy - hr * 0.62);
    g.quadraticCurveTo(hx - hr * 0.1, hy - hr * 0.8, hx + hr * 0.4, hy - hr * 0.68);
    g.stroke();

    // 左侧鬓发：垂到肩，随走路 / 风摆动。
    const lockSway =
      Math.sin(this.visT * 3.1) * s * 0.02 * (0.5 + this.motionWalk) +
      (this.motionAir ? -s * 0.05 : 0);
    setFill(g, HAIR_F);
    this.hairPath.clear();
    this.hairPath.moveTo(hx - hr * 1.02, hy - hr * 0.12);
    this.hairPath.quadraticCurveTo(
      hx - hr * 1.3 + lockSway,
      hy + hr * 0.7,
      hx - hr * 1.08 + lockSway,
      hy + hr * 1.55,
    );
    this.hairPath.quadraticCurveTo(
      hx - hr * 0.92 + lockSway,
      hy + hr * 0.9,
      hx - hr * 0.82,
      hy + hr * 0.2,
    );
    this.hairPath.closePath();
    attachPath(g, this.hairPath);
    g.fill();
    setStroke(g, s * 0.018, HAIR_F_LIGHT, 0.7, 'round');
    g.beginPath();
    g.moveTo(hx - hr * 1.0, hy + hr * 0.05);
    g.quadraticCurveTo(
      hx - hr * 1.12 + lockSway,
      hy + hr * 0.7,
      hx - hr * 1.03 + lockSway,
      hy + hr * 1.3,
    );
    g.stroke();

    // 呆毛：一根有弹性的细发。
    const ahogeSway = Math.sin(this.visT * 3.7) * s * 0.03;
    setStroke(g, s * 0.022, HAIR_F, 1, 'round');
    g.beginPath();
    g.moveTo(hx - hr * 0.12, hy - hr * 1.14);
    g.quadraticCurveTo(
      hx + hr * 0.1 + ahogeSway,
      hy - hr * 1.55,
      hx + hr * 0.36 + ahogeSway,
      hy - hr * 1.32,
    );
    g.stroke();

    // 暗红王冠发饰：黑铁双角 + 红宝石，替代原来的粉色蝴蝶结。
    const bx = hx + hr * 0.9;
    const by = hy - hr * 0.56;
    const crestSway = Math.sin(this.visT * 4.4) * s * 0.012;
    setFill(g, '#0b0710');
    this.headPath.clear();
    this.headPath.moveTo(bx - s * 0.1, by + s * 0.1);
    this.headPath.quadraticCurveTo(bx - s * 0.11, by - s * 0.05, bx - s * 0.07, by - s * 0.19);
    this.headPath.quadraticCurveTo(bx - s * 0.04, by - s * 0.08, bx - s * 0.01, by - s * 0.05);
    this.headPath.quadraticCurveTo(bx + s * 0.02, by - s * 0.16, bx + s * 0.04, by - s * 0.25);
    this.headPath.quadraticCurveTo(bx + s * 0.08, by - s * 0.12, bx + s * 0.1, by - s * 0.04);
    this.headPath.quadraticCurveTo(bx + s * 0.16, by - s * 0.12, bx + s * 0.2, by - s * 0.16);
    this.headPath.quadraticCurveTo(bx + s * 0.18, by - s * 0.02, bx + s * 0.14, by + s * 0.12);
    this.headPath.closePath();
    attachPath(g, this.headPath);
    g.fill();
    setStroke(g, s * 0.016, '#7a1028', 0.95);
    attachPath(g, this.headPath);
    g.stroke();

    // 王冠内侧的红色脉络。
    setStroke(g, s * 0.012, RIN_IMPACT, 0.75, 'round');
    g.beginPath();
    g.moveTo(bx - s * 0.06, by + s * 0.05);
    g.quadraticCurveTo(bx - s * 0.065, by - s * 0.05, bx - s * 0.065, by - s * 0.15);
    g.stroke();
    g.beginPath();
    g.moveTo(bx + s * 0.09, by + s * 0.07);
    g.quadraticCurveTo(bx + s * 0.12, by + s * 0.0, bx + s * 0.17, by - s * 0.12);
    g.stroke();
    g.beginPath();
    g.moveTo(bx + s * 0.02, by + s * 0.04);
    g.lineTo(bx + s * 0.04, by - s * 0.2);
    g.stroke();

    // 中央红宝石。
    setFill(g, '#ff2a4a');
    g.beginPath();
    g.circle(bx + s * 0.01, by + s * 0.04, s * 0.036);
    g.fill();
    setFill(g, '#ffe0e6', 0.9);
    g.beginPath();
    g.circle(bx + s * 0.0, by + s * 0.03, s * 0.014);
    g.fill();

    // 垂下的细链与红坠。
    setStroke(g, s * 0.012, '#0b0710', 0.9, 'round');
    g.beginPath();
    g.moveTo(bx + s * 0.03, by + s * 0.12);
    g.quadraticCurveTo(
      bx + s * 0.05 + crestSway,
      by + s * 0.2,
      bx + s * 0.04 + crestSway,
      by + s * 0.28,
    );
    g.stroke();
    setFill(g, '#ff3b5c');
    g.beginPath();
    g.moveTo(bx + s * 0.04 + crestSway, by + s * 0.27);
    g.lineTo(bx + s * 0.06 + crestSway, by + s * 0.31);
    g.lineTo(bx + s * 0.04 + crestSway, by + s * 0.35);
    g.lineTo(bx + s * 0.02 + crestSway, by + s * 0.31);
    g.closePath();
    g.fill();

    // 左耳的红宝石耳坠。
    const earX = hx - hr * 0.9;
    const earY = hy + hr * 0.34;
    setStroke(g, s * 0.01, '#0b0710', 0.9);
    g.beginPath();
    g.moveTo(earX, earY - s * 0.05);
    g.lineTo(earX, earY);
    g.stroke();
    setFill(g, '#ff2a4a');
    g.beginPath();
    g.moveTo(earX, earY);
    g.lineTo(earX + s * 0.02, earY + s * 0.03);
    g.lineTo(earX, earY + s * 0.065);
    g.lineTo(earX - s * 0.02, earY + s * 0.03);
    g.closePath();
    g.fill();
  }

  /** 凛的后发：整片长发 + 会甩动的马尾（在身体后面）。 */
  private drawHairBack(fc: FrameContext, s: number, airborne: boolean): void {
    const g = this.hairBackGfx;
    g.clear();
    if (!this.female) return;

    const sway =
      Math.sin(this.visT * 3.1) * s * 0.025 * (0.45 + this.motionWalk) + (airborne ? -s * 0.09 : 0);
    const bounce =
      (airborne ? -s * 0.12 : 0) -
      Math.abs(Math.sin(this.motionPhase)) * s * 0.02 * this.motionWalk;

    // 后脑整片长发：左侧压暗、右侧留出肩线。
    this.hairMassPath.clear();
    this.hairMassPath.moveTo(-s * 0.08, -s * 0.98);
    this.hairMassPath.quadraticCurveTo(-s * 0.55, -s * 0.95, -s * 0.64, -s * 0.5);
    this.hairMassPath.lineTo(-s * 0.6 + sway * 0.4, s * 0.24 + bounce * 0.3);
    this.hairMassPath.quadraticCurveTo(-s * 0.5 + sway * 0.4, s * 0.02, -s * 0.4, -s * 0.24);
    this.hairMassPath.quadraticCurveTo(-s * 0.4, s * 0.22, -s * 0.3 + sway * 0.5, s * 0.48);
    this.hairMassPath.quadraticCurveTo(-s * 0.2, s * 0.12, -s * 0.16, -s * 0.16);
    this.hairMassPath.lineTo(-s * 0.1, -s * 0.62);
    this.hairMassPath.closePath();
    if (this.hairGradient) {
      setFillGradient(g, this.hairGradient, 1);
    } else {
      setFill(g, HAIR_F);
    }
    attachPath(g, this.hairMassPath);
    g.fill();
    setStroke(g, s * 0.03, INK_RIN, 0.85);
    attachPath(g, this.hairMassPath);
    g.stroke();

    // 发束高光。
    setStroke(g, s * 0.045, HAIR_F_LIGHT, 0.55, 'round');
    g.beginPath();
    g.moveTo(-s * 0.16, -s * 0.9);
    g.quadraticCurveTo(-s * 0.46, -s * 0.72, -s * 0.5, -s * 0.24);
    g.stroke();
    setStroke(g, s * 0.018, HAIR_F_GLOSS, 0.55, 'round');
    g.beginPath();
    g.moveTo(-s * 0.18, -s * 0.82);
    g.quadraticCurveTo(-s * 0.4, -s * 0.62, -s * 0.44, -s * 0.3);
    g.stroke();

    // 马尾：从发圈位置甩到左下方。
    this.hairPath.clear();
    this.hairPath.moveTo(-s * 0.18, -s * 0.7);
    this.hairPath.quadraticCurveTo(
      -s * 0.52 + sway,
      -s * 0.42 + bounce,
      -s * 0.5 + sway * 1.2,
      s * 0.06 + bounce,
    );
    this.hairPath.quadraticCurveTo(
      -s * 0.48 + sway * 1.4,
      s * 0.48 + bounce,
      -s * 0.63 + sway * 1.6,
      s * 0.76 + bounce,
    );
    this.hairPath.quadraticCurveTo(
      -s * 0.7 + sway * 1.5,
      s * 0.42 + bounce,
      -s * 0.64 + sway * 1.2,
      s * 0.04 + bounce,
    );
    this.hairPath.quadraticCurveTo(-s * 0.6 + sway, -s * 0.36 + bounce, -s * 0.34, -s * 0.62);
    this.hairPath.closePath();
    if (this.hairGradient) {
      setFillGradient(g, this.hairGradient, 1);
    } else {
      setFill(g, HAIR_F);
    }
    attachPath(g, this.hairPath);
    g.fill();
    setStroke(g, s * 0.028, INK_RIN, 0.85);
    attachPath(g, this.hairPath);
    g.stroke();

    // 马尾的亮面与分叉发梢。
    setStroke(g, s * 0.035, HAIR_F_LIGHT, 0.8, 'round');
    g.beginPath();
    g.moveTo(-s * 0.24, -s * 0.58);
    g.quadraticCurveTo(-s * 0.5 + sway, -s * 0.2, -s * 0.54 + sway * 1.3, s * 0.4 + bounce);
    g.stroke();
    setStroke(g, s * 0.018, HAIR_F_GLOSS, 0.6, 'round');
    g.beginPath();
    g.moveTo(-s * 0.28, -s * 0.5);
    g.quadraticCurveTo(-s * 0.44 + sway, -s * 0.12, -s * 0.48 + sway * 1.3, s * 0.3 + bounce);
    g.stroke();
    setFill(g, HAIR_F);
    g.beginPath();
    g.moveTo(-s * 0.63 + sway * 1.6, s * 0.76 + bounce);
    g.lineTo(-s * 0.56 + sway * 1.7, s * 0.58 + bounce);
    g.lineTo(-s * 0.5 + sway * 1.5, s * 0.7 + bounce);
    g.closePath();
    g.fill();

    // 燃魂时发梢透出红光。
    if (fc.burning) {
      setStroke(g, s * 0.03, RIN_IMPACT, 0.55, 'round');
      g.beginPath();
      g.moveTo(-s * 0.6 + sway * 1.5, s * 0.5 + bounce);
      g.quadraticCurveTo(
        -s * 0.62 + sway * 1.6,
        s * 0.62 + bounce,
        -s * 0.63 + sway * 1.6,
        s * 0.76 + bounce,
      );
      g.stroke();
    }

    // 发圈 + 小飘带。
    setFill(g, SASH_F);
    g.beginPath();
    g.ellipse(-s * 0.2, -s * 0.66, s * 0.075, s * 0.055);
    g.fill();
    setStroke(g, s * 0.02, '#3a0710', 0.9);
    g.beginPath();
    g.ellipse(-s * 0.2, -s * 0.66, s * 0.075, s * 0.055);
    g.stroke();

    const tieSway = Math.sin(this.visT * 4.6) * s * 0.03 + this.motionWalk * s * 0.02;
    setFill(g, SASH_F, 0.9);
    this.ribbonPath.clear();
    this.ribbonPath.moveTo(-s * 0.2, -s * 0.64);
    this.ribbonPath.quadraticCurveTo(
      -s * 0.34 + tieSway,
      -s * 0.54,
      -s * 0.36 + tieSway,
      -s * 0.38,
    );
    this.ribbonPath.lineTo(-s * 0.29 + tieSway, -s * 0.4);
    this.ribbonPath.quadraticCurveTo(-s * 0.28, -s * 0.54, -s * 0.18, -s * 0.64);
    this.ribbonPath.closePath();
    attachPath(g, this.ribbonPath);
    g.fill();
  }

  /** 手臂：上臂球衣袖 + 前臂皮肤（墨线 + 暗面 + 轮廓光）。 */
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
    const ink = this.female ? INK_RIN : INK_ZHE;
    const rim = this.female ? RIM_RIN : RIM_ZHE;
    const sleeveLight = this.female ? TOP_F_LIGHT : JERSEY_LIGHT;

    // 墨线底：两条线段一起铺。
    this.armPath.clear();
    this.armPath.moveTo(shoulderX, shoulderY);
    this.armPath.lineTo(midX, midY);
    this.armPath.moveTo(midX, midY);
    this.armPath.lineTo(gripX, gripY);
    setStroke(g, s * 0.235, ink, 0.85, 'round');
    attachPath(g, this.armPath);
    g.stroke();

    if (this.female) {
      // 上臂：露出的苍白手臂 + 黑臂环 + 血红刺青。
      setStroke(g, s * 0.2, skin, 1, 'round');
      g.beginPath();
      g.moveTo(shoulderX, shoulderY);
      g.lineTo(midX, midY);
      g.stroke();
      setStroke(g, s * 0.045, RIM_RIN, 0.45, 'round');
      g.beginPath();
      g.moveTo(shoulderX - s * 0.035, shoulderY - s * 0.02);
      g.lineTo(midX - s * 0.035, midY - s * 0.02);
      g.stroke();

      const ax = midX - shoulderX;
      const ay = midY - shoulderY;
      const al = Math.hypot(ax, ay) || 1;
      const nux = -ay / al;
      const nuy = ax / al;

      // 肩头黑臂环。
      const bandX = lerp(shoulderX, midX, 0.2);
      const bandY = lerp(shoulderY, midY, 0.2);
      setStroke(g, s * 0.06, '#0b0710', 0.95, 'round');
      g.beginPath();
      g.moveTo(bandX - nux * s * 0.1, bandY - nuy * s * 0.1);
      g.lineTo(bandX + nux * s * 0.1, bandY + nuy * s * 0.1);
      g.stroke();
      setStroke(g, s * 0.013, SASH_F_LIGHT, 0.8, 'round');
      g.beginPath();
      g.moveTo(bandX - nux * s * 0.095 - ax * 0.02, bandY - nuy * s * 0.095 - ay * 0.02);
      g.lineTo(bandX + nux * s * 0.095 - ax * 0.02, bandY + nuy * s * 0.095 - ay * 0.02);
      g.stroke();

      // 上臂外侧的血红刺青。
      const tx = lerp(shoulderX, midX, 0.58);
      const ty = lerp(shoulderY, midY, 0.58);
      setStroke(g, s * 0.012, SASH_F_LIGHT, 0.85, 'round');
      g.beginPath();
      g.moveTo(tx - nux * s * 0.055, ty - nuy * s * 0.055);
      g.quadraticCurveTo(
        tx + ax * 0.22 - nux * s * 0.03,
        ty + ay * 0.22 - nuy * s * 0.03,
        tx + ax * 0.42 - nux * s * 0.045,
        ty + ay * 0.42 - nuy * s * 0.045,
      );
      g.stroke();
      setFill(g, SASH_F_LIGHT, 0.9);
      g.beginPath();
      g.circle(tx + ax * 0.16 - nux * s * 0.052, ty + ay * 0.16 - nuy * s * 0.052, s * 0.013);
      g.fill();

      // 前臂：黑色长手套 + 冷光 + 手套口红线。
      setStroke(g, s * 0.165, '#0b0710', 1, 'round');
      g.beginPath();
      g.moveTo(midX, midY);
      g.lineTo(gripX, gripY);
      g.stroke();
      setStroke(g, s * 0.04, TOP_F_LIGHT, 0.5, 'round');
      g.beginPath();
      g.moveTo(midX - s * 0.04, midY - s * 0.01);
      g.lineTo(gripX - s * 0.04, gripY - s * 0.01);
      g.stroke();
      setStroke(g, s * 0.016, RIM_RIN, 0.55, 'round');
      g.beginPath();
      g.moveTo(midX - s * 0.068, midY + s * 0.005);
      g.lineTo(gripX - s * 0.068, gripY + s * 0.005);
      g.stroke();

      const fdx = gripX - midX;
      const fdy = gripY - midY;
      const fl = Math.hypot(fdx, fdy) || 1;
      const fnx = -fdy / fl;
      const fny = fdx / fl;
      setStroke(g, s * 0.026, SASH_F, 0.9, 'round');
      g.beginPath();
      g.moveTo(midX - fnx * s * 0.075, midY - fny * s * 0.075);
      g.lineTo(midX + fnx * s * 0.075, midY + fny * s * 0.075);
      g.stroke();

      // 凛的腕带。
      setStroke(g, s * 0.05, SASH_F, 0.9, 'round');
      const wx = lerp(midX, gripX, 0.82);
      const wy = lerp(midY, gripY, 0.82);
      const dx = (gripX - midX) * 0.04;
      const dy = (gripY - midY) * 0.04;
      g.beginPath();
      g.moveTo(wx - dy, wy + dx);
      g.lineTo(wx + dy, wy - dx);
      g.stroke();
      setStroke(g, s * 0.014, SASH_F_LIGHT, 0.9, 'round');
      g.beginPath();
      g.moveTo(wx - dy - gripX * 0.005, wy + dx - gripY * 0.005);
      g.lineTo(wx + dy - gripX * 0.005, wy - dx - gripY * 0.005);
      g.stroke();

      // 手掌：黑手套。
      setFill(g, ink, 0.85);
      g.beginPath();
      g.circle(gripX, gripY, s * 0.115);
      g.fill();
      setFill(g, '#0b0710');
      g.beginPath();
      g.circle(gripX, gripY, s * 0.095);
      g.fill();
      setFill(g, TOP_F_LIGHT, 0.55);
      g.beginPath();
      g.circle(gripX - s * 0.025, gripY - s * 0.03, s * 0.03);
      g.fill();
      setStroke(g, s * 0.01, SASH_F_LIGHT, 0.75, 'round');
      g.beginPath();
      g.arc(gripX + s * 0.01, gripY - s * 0.012, s * 0.045, Math.PI * 1.05, Math.PI * 1.55);
      g.stroke();
    } else {
      // 上臂袖子。
      setStroke(g, s * 0.2, sleeve, 1, 'round');
      g.beginPath();
      g.moveTo(shoulderX, shoulderY);
      g.lineTo(midX, midY);
      g.stroke();

      // 袖口 / 肩头高光。
      setStroke(g, s * 0.04, sleeveLight, 0.55, 'round');
      g.beginPath();
      g.moveTo(shoulderX - s * 0.03, shoulderY - s * 0.02);
      g.lineTo(midX - s * 0.02, midY - s * 0.02);
      g.stroke();

      // 前臂：皮肤 + 下侧暗面 + 上侧轮廓光。
      setStroke(g, s * 0.16, skin, 1, 'round');
      g.beginPath();
      g.moveTo(midX, midY);
      g.lineTo(gripX, gripY);
      g.stroke();
      setStroke(g, s * 0.045, 'rgba(95,45,55,.28)', 1, 'round');
      g.beginPath();
      g.moveTo(midX + s * 0.02, midY + s * 0.04);
      g.lineTo(gripX + s * 0.02, gripY + s * 0.04);
      g.stroke();
      setStroke(g, s * 0.022, rim, 0.45, 'round');
      g.beginPath();
      g.moveTo(midX - s * 0.04, midY - s * 0.01);
      g.lineTo(gripX - s * 0.04, gripY - s * 0.01);
      g.stroke();

      // 手掌：先墨线再肤色，最后一点高光。
      setFill(g, ink, 0.85);
      g.beginPath();
      g.circle(gripX, gripY, s * 0.115);
      g.fill();
      setFill(g, skin);
      g.beginPath();
      g.circle(gripX, gripY, s * 0.095);
      g.fill();
      setFill(g, '#ffffff', 0.22);
      g.beginPath();
      g.circle(gripX - s * 0.025, gripY - s * 0.03, s * 0.03);
      g.fill();
    }
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
    setStroke(g, s * 0.13, INK_ZHE, 0.85, 'round');
    g.beginPath();
    g.moveTo(-s * 0.02, 0);
    g.lineTo(s * 0.34, 0);
    g.stroke();
    setStroke(g, s * 0.12, BAT_GRIP, 1, 'round');
    g.beginPath();
    g.moveTo(-s * 0.02, 0);
    g.lineTo(s * 0.34, 0);
    g.stroke();

    // 握把防滑纹。
    setStroke(g, s * 0.02, 'rgba(220,190,150,.45)');
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
    setStroke(g, s * 0.03, INK_ZHE, 0.8);
    attachPath(g, this.batBodyPath);
    g.stroke();

    // 底侧暗面 + 上侧高光，做成一根圆柱。
    setStroke(g, s * 0.035, BAT_DARK, 0.55, 'round');
    g.beginPath();
    g.moveTo(s * 0.34, s * 0.045);
    g.quadraticCurveTo(L * 0.72, s * 0.085, L * 0.92, s * 0.03);
    g.stroke();
    setStroke(g, s * 0.03, BAT_LIGHT, 0.75);
    g.beginPath();
    g.moveTo(s * 0.42, -s * 0.05);
    g.quadraticCurveTo(L * 0.74, -s * 0.095, L * 0.87, -s * 0.045);
    g.stroke();

    // 尾端旋钮。
    setFill(g, '#2a1d16');
    g.beginPath();
    g.circle(-s * 0.02, 0, s * 0.075);
    g.fill();
    setStroke(g, s * 0.02, INK_ZHE, 0.9);
    g.beginPath();
    g.circle(-s * 0.02, 0, s * 0.075);
    g.stroke();

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

  /** 镰刀刃形（前后面共用，`ox/oy` 用来做厚度偏移）。 */
  private buildScytheBlade(path: GraphicsPath, s: number, L: number, ox: number, oy: number): void {
    const mx = L * 0.985 + ox;
    const my = oy;
    path.clear();
    // 刃跟：接在长柄末端。
    path.moveTo(mx - s * 0.07, my + s * 0.04);
    // 外弧（凸边即为切割刃）：先向上立起，再沿长弧扫向后方。
    path.quadraticCurveTo(mx + s * 0.02, my - s * 0.3, mx - s * 0.12, my - s * 0.6);
    path.quadraticCurveTo(mx - s * 0.3, my - s * 0.94, mx - s * 0.64, my - s * 1.06);
    path.quadraticCurveTo(mx - s * 1.04, my - s * 1.16, mx - s * 1.36, my - s * 0.96);
    // 刃尖：细长回勾。
    path.lineTo(mx - s * 1.5, my - s * 0.84);
    // 内凹刃背：绕回刃跟，形成新月刀身。
    path.quadraticCurveTo(mx - s * 1.38, my - s * 0.78, mx - s * 1.3, my - s * 0.8);
    path.quadraticCurveTo(mx - s * 1.0, my - s * 0.84, mx - s * 0.68, my - s * 0.64);
    path.quadraticCurveTo(mx - s * 0.4, my - s * 0.38, mx - s * 0.18, my - s * 0.18);
    path.quadraticCurveTo(mx - s * 0.16, my - s * 0.16, mx - s * 0.07, my + s * 0.04);
    path.closePath();
  }

  /** 镰刀：长柄 + 巨型新月刃 + 倒钩 + 紫红刃光，长度与棒子一致。 */
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

    const L = s * SCYTHE_LEN_R;
    const mountX = L * 0.985;
    const tipX = mountX - s * 1.49;
    const tipY = -s * 0.83;

    // ── 飘带：系在刃根，随挥击与视觉时钟摆动（画在最后面） ──
    const wob = Math.sin(this.visT * 4.5) * s * 0.035 + swing * s * 0.12;
    setFill(g, '#7d0d1e', 0.85);
    this.ribbonPath.clear();
    this.ribbonPath.moveTo(mountX - s * 0.04, s * 0.05);
    this.ribbonPath.quadraticCurveTo(
      mountX - s * 0.18,
      s * (0.26 + wob / s),
      mountX - s * 0.4,
      s * (0.5 + wob / s),
    );
    this.ribbonPath.lineTo(mountX - s * 0.33, s * (0.6 + wob / s));
    this.ribbonPath.quadraticCurveTo(
      mountX - s * 0.08,
      s * (0.34 + wob / s),
      mountX + s * 0.03,
      s * 0.1,
    );
    this.ribbonPath.closePath();
    attachPath(g, this.ribbonPath);
    g.fill();
    setStroke(g, s * 0.018, '#ff4d68', 0.8);
    attachPath(g, this.ribbonPath);
    g.stroke();

    const wob2 = Math.sin(this.visT * 4.5 + 1.4) * s * 0.035 + swing * s * 0.09;
    setFill(g, '#1a0910', 0.85);
    this.ribbonPath.clear();
    this.ribbonPath.moveTo(mountX - s * 0.04, s * 0.03);
    this.ribbonPath.quadraticCurveTo(
      mountX - s * 0.22,
      s * (0.14 + wob2 / s),
      mountX - s * 0.48,
      s * (0.34 + wob2 / s),
    );
    this.ribbonPath.lineTo(mountX - s * 0.42, s * (0.43 + wob2 / s));
    this.ribbonPath.quadraticCurveTo(mountX - s * 0.16, s * (0.24 + wob2 / s), mountX, s * 0.06);
    this.ribbonPath.closePath();
    attachPath(g, this.ribbonPath);
    g.fill();

    // ── 挥击时的刃部辉光（垫在刃身后面） ─────────────────
    this.buildScytheBlade(this.bladePath, s, L, 0, 0);
    if (swing > 0.03) {
      setStroke(g, s * 0.4, hexA(RIN_TRAIL, 0.14 * swing), 1, 'round');
      attachPath(g, this.bladePath);
      g.stroke();
      setStroke(g, s * 0.2, hexA(RIN_IMPACT, 0.24 * swing), 1, 'round');
      attachPath(g, this.bladePath);
      g.stroke();
    }

    // ── 长柄：从配重一直延伸到刃根 ───────────────────────
    this.batBodyPath.clear();
    this.batBodyPath.moveTo(-s * 0.2, -s * 0.05);
    this.batBodyPath.lineTo(mountX - s * 0.1, -s * 0.058);
    this.batBodyPath.lineTo(mountX + s * 0.01, -s * 0.042);
    this.batBodyPath.lineTo(mountX + s * 0.01, s * 0.042);
    this.batBodyPath.lineTo(mountX - s * 0.1, s * 0.058);
    this.batBodyPath.lineTo(-s * 0.2, s * 0.05);
    this.batBodyPath.closePath();
    setStroke(g, s * 0.14, hexA(RIN_TRAIL, 0.1), 1, 'round');
    attachPath(g, this.batBodyPath);
    g.stroke();
    if (this.shaftGradient) {
      setFillGradient(g, this.shaftGradient, 1);
    } else {
      setFill(g, SCYTHE_SHAFT);
    }
    attachPath(g, this.batBodyPath);
    g.fill();
    setStroke(g, s * 0.032, INK_RIN, 1);
    attachPath(g, this.batBodyPath);
    g.stroke();

    // 圆柱高光 / 暗面。
    setStroke(g, s * 0.018, '#8a769c', 1);
    g.beginPath();
    g.moveTo(-s * 0.12, -s * 0.036);
    g.lineTo(mountX - s * 0.12, -s * 0.044);
    g.stroke();
    setStroke(g, s * 0.012, '#0b0611', 0.8);
    g.beginPath();
    g.moveTo(-s * 0.1, s * 0.036);
    g.lineTo(mountX - s * 0.12, s * 0.044);
    g.stroke();

    // 柄上的金属箍。
    setStroke(g, s * 0.024, '#8a769c', 0.55);
    for (let i = 0; i < 3; i++) {
      const bx = mountX - s * (0.26 + i * 0.55);
      g.beginPath();
      g.moveTo(bx, -s * 0.054);
      g.lineTo(bx, s * 0.054);
      g.stroke();
    }

    // 握把缠布：底布 + 斜向交叉绑带。
    setFill(g, '#0d0710', 0.95);
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.08, -s * 0.062, s * 0.54, s * 0.124, s * 0.03);
    attachPath(g, this.headPath);
    g.fill();
    setStroke(g, s * 0.018, '#6b5a78', 0.6, 'round');
    for (let i = 0; i < 4; i++) {
      const x = s * (0.015 + i * 0.09);
      g.beginPath();
      g.moveTo(x, -s * 0.055);
      g.lineTo(x + s * 0.045, s * 0.055);
      g.stroke();
    }
    setStroke(g, s * 0.02, SASH_F_LIGHT, 0.85, 'round');
    g.beginPath();
    g.moveTo(s * 0.47, -s * 0.07);
    g.lineTo(s * 0.47, s * 0.07);
    g.stroke();

    // 柄尾：菱形配重 + 尖刺。
    setFill(g, SCYTHE_DARK);
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.3, -s * 0.075, s * 0.14, s * 0.15, s * 0.03);
    attachPath(g, this.headPath);
    g.fill();
    setStroke(g, s * 0.02, '#5a4a66', 0.95);
    attachPath(g, this.headPath);
    g.stroke();
    setFill(g, '#2a1f33');
    g.beginPath();
    g.moveTo(-s * 0.3, -s * 0.075);
    g.lineTo(-s * 0.42, 0);
    g.lineTo(-s * 0.3, s * 0.075);
    g.closePath();
    g.fill();
    setStroke(g, s * 0.016, INK_RIN, 0.9);
    g.beginPath();
    g.moveTo(-s * 0.3, -s * 0.075);
    g.lineTo(-s * 0.42, 0);
    g.lineTo(-s * 0.3, s * 0.075);
    g.stroke();
    setStroke(g, s * 0.012, '#8a769c', 0.75, 'round');
    g.beginPath();
    g.moveTo(-s * 0.31, -s * 0.055);
    g.lineTo(-s * 0.4, 0);
    g.stroke();
    setFill(g, '#ff2d4a');
    g.beginPath();
    g.circle(-s * 0.25, 0, s * 0.028);
    g.fill();

    // ── 刃根：菱形护手 + 倒钩 + 宝石 ─────────────────────
    setFill(g, SCYTHE_DARK);
    this.headPath.clear();
    this.headPath.moveTo(mountX - s * 0.16, 0);
    this.headPath.lineTo(mountX - s * 0.02, -s * 0.17);
    this.headPath.lineTo(mountX + s * 0.09, 0);
    this.headPath.lineTo(mountX - s * 0.02, s * 0.17);
    this.headPath.closePath();
    attachPath(g, this.headPath);
    g.fill();
    setStroke(g, s * 0.026, '#6a5878', 0.95);
    attachPath(g, this.headPath);
    g.stroke();
    setStroke(g, s * 0.012, '#ff2d4a', 0.55);
    attachPath(g, this.headPath);
    g.stroke();

    // 倒钩：向柄尾方向勾出的暗钢刺。
    setFill(g, '#1a0a12');
    this.headPath.clear();
    this.headPath.moveTo(mountX - s * 0.06, s * 0.07);
    this.headPath.quadraticCurveTo(mountX - s * 0.16, s * 0.28, mountX - s * 0.08, s * 0.44);
    this.headPath.quadraticCurveTo(mountX - s * 0.01, s * 0.24, mountX + s * 0.05, s * 0.09);
    this.headPath.closePath();
    attachPath(g, this.headPath);
    g.fill();
    setStroke(g, s * 0.018, '#8a769c', 0.85);
    attachPath(g, this.headPath);
    g.stroke();

    // 刃根宝石与光晕。
    setFill(g, RIN_IMPACT, 0.16);
    g.beginPath();
    g.circle(mountX - s * 0.015, 0, s * 0.16);
    g.fill();
    setFill(g, '#ff2d4a');
    g.beginPath();
    g.moveTo(mountX - s * 0.015, -s * 0.065);
    g.lineTo(mountX + s * 0.035, 0);
    g.lineTo(mountX - s * 0.015, s * 0.065);
    g.lineTo(mountX - s * 0.065, 0);
    g.closePath();
    g.fill();
    setFill(g, '#ffe4e9', 0.95);
    g.beginPath();
    g.circle(mountX - s * 0.03, -s * 0.015, s * 0.018);
    g.fill();

    // ── 刃身：先画后层（厚度），再压前层 ─────────────────
    this.buildScytheBlade(this.bladeBackPath, s, L, s * 0.045, s * 0.06);
    setFill(g, '#080204');
    attachPath(g, this.bladeBackPath);
    g.fill();

    this.buildScytheBlade(this.bladePath, s, L, 0, 0);
    if (this.scytheGradient) {
      setFillGradient(g, this.scytheGradient, 1);
    } else {
      setFill(g, '#2a0814');
    }
    attachPath(g, this.bladePath);
    g.fill();
    setStroke(g, s * 0.028, INK_RIN, 0.95);
    attachPath(g, this.bladePath);
    g.stroke();

    // 刃背暗带：沿内凹边压一条厚重的金属脊。
    setStroke(g, s * 0.085, 'rgba(3,1,3,.7)', 1, 'round');
    g.beginPath();
    g.moveTo(mountX - s * 0.14, -s * 0.16);
    g.quadraticCurveTo(mountX - s * 0.4, -s * 0.38, mountX - s * 0.68, -s * 0.62);
    g.quadraticCurveTo(mountX - s * 0.99, -s * 0.8, mountX - s * 1.2, -s * 0.82);
    g.stroke();
    setStroke(g, s * 0.016, 'rgba(160,150,175,.45)', 0.6, 'round');
    g.beginPath();
    g.moveTo(mountX - s * 0.16, -s * 0.22);
    g.quadraticCurveTo(mountX - s * 0.42, -s * 0.44, mountX - s * 0.7, -s * 0.68);
    g.quadraticCurveTo(mountX - s * 1.0, -s * 0.85, mountX - s * 1.18, -s * 0.84);
    g.stroke();

    // 刃口斜面：沿切割缘压出一条更亮的窄带，让刃身有折面。
    this.bladeBevelPath.clear();
    this.bladeBevelPath.moveTo(mountX - s * 0.19, -s * 0.04);
    this.bladeBevelPath.quadraticCurveTo(
      mountX - s * 0.08,
      -s * 0.32,
      mountX - s * 0.24,
      -s * 0.58,
    );
    this.bladeBevelPath.quadraticCurveTo(mountX - s * 0.43, -s * 0.94, mountX - s * 0.72, -s * 1.0);
    this.bladeBevelPath.quadraticCurveTo(mountX - s * 1.06, -s * 1.09, mountX - s * 1.36, -s * 0.9);
    this.bladeBevelPath.lineTo(mountX - s * 1.34, -s * 0.84);
    this.bladeBevelPath.quadraticCurveTo(mountX - s * 1.3, -s * 0.87, mountX - s * 1.06, -s * 0.93);
    this.bladeBevelPath.quadraticCurveTo(mountX - s * 0.72, -s * 0.85, mountX - s * 0.5, -s * 0.62);
    this.bladeBevelPath.quadraticCurveTo(mountX - s * 0.3, -s * 0.4, mountX - s * 0.19, -s * 0.04);
    this.bladeBevelPath.closePath();
    setFill(g, '#3a0d1a', 0.55);
    attachPath(g, this.bladeBevelPath);
    g.fill();
    setStroke(g, s * 0.012, '#ff4d68', 0.3);
    attachPath(g, this.bladeBevelPath);
    g.stroke();

    // 刃口：内凹的血红切割缘 + 渐层辉光。
    this.bladeEdgePath.clear();
    this.bladeEdgePath.moveTo(mountX - s * 0.07, s * 0.03);
    this.bladeEdgePath.quadraticCurveTo(mountX - s * 0.17, -s * 0.17, mountX - s * 0.2, -s * 0.2);
    this.bladeEdgePath.quadraticCurveTo(mountX - s * 0.42, -s * 0.4, mountX - s * 0.68, -s * 0.64);
    this.bladeEdgePath.quadraticCurveTo(mountX - s * 1.0, -s * 0.84, mountX - s * 1.3, -s * 0.8);
    this.bladeEdgePath.lineTo(tipX, tipY);
    setStroke(g, s * 0.075, hexA(RIN_TRAIL, 0.14 + 0.12 * swing), 1, 'round');
    attachPath(g, this.bladeEdgePath);
    g.stroke();
    if (this.bladeGlowGradient) {
      setStrokeGradient(g, s * 0.045, this.bladeGlowGradient, 0.9, 'round');
      attachPath(g, this.bladeEdgePath);
      g.stroke();
    }
    setStroke(g, s * 0.024, '#ff2d4a', 0.9, 'round');
    attachPath(g, this.bladeEdgePath);
    g.stroke();
    setStroke(g, s * 0.01, '#ffd9de', 0.95, 'round');
    attachPath(g, this.bladeEdgePath);
    g.stroke();

    // 刃面符文：两道弧线 + 光点。
    this.bladeRunePath.clear();
    this.bladeRunePath.moveTo(mountX - s * 0.42, -s * 0.5);
    this.bladeRunePath.quadraticCurveTo(mountX - s * 0.62, -s * 0.66, mountX - s * 0.86, -s * 0.7);
    this.bladeRunePath.moveTo(mountX - s * 0.56, -s * 0.74);
    this.bladeRunePath.quadraticCurveTo(mountX - s * 0.8, -s * 0.88, mountX - s * 1.04, -s * 0.88);
    setStroke(g, s * 0.018, 'rgba(255,70,100,.75)', 0.9, 'round');
    attachPath(g, this.bladeRunePath);
    g.stroke();
    setFill(g, '#ff8095', 0.9);
    g.beginPath();
    g.circle(mountX - s * 0.72, -s * 0.78, s * 0.022);
    g.fill();
    g.beginPath();
    g.circle(mountX - s * 0.98, -s * 0.86, s * 0.016);
    g.fill();

    // 刃尖冷光：贴住刃口的一点高光。
    setStroke(g, s * 0.02, '#ffe8ec', 0.9, 'round');
    g.beginPath();
    g.moveTo(tipX + s * 0.03, tipY + s * 0.02);
    g.lineTo(tipX + s * 0.14, tipY - s * 0.05);
    g.stroke();

    // ── 击打闪光（刃尖） ─────────────────────────────────
    if (impact > 0.02) {
      setFill(g, hexA(RIN_IMPACT, 0.4 * impact));
      this.starPath.clear();
      starInto(this.starPath, tipX, tipY, s * (0.26 + 0.24 * impact), s * (0.08 + 0.08 * impact));
      attachPath(g, this.starPath);
      g.fill();
      setFill(g, 'rgba(255,240,242,1)', 0.9 * impact);
      this.starPath.clear();
      starInto(this.starPath, tipX, tipY, s * (0.12 + 0.14 * impact), s * (0.045 + 0.045 * impact));
      attachPath(g, this.starPath);
      g.fill();
    }
  }

  /** 挥棒残影：彩色扇形拖尾 + 三道淡影，越接近当前角度越实。 */
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

    const L = s * (this.female ? SCYTHE_LEN_R : CLUB_LEN_R);
    const r = gripDist + L;
    const trailCol = this.female ? RIN_TRAIL : color;

    // 立绘模式：镰刀与刀光都已经画在立绘里，这里不再叠程序化残影。
    if (this.spriteRoot.visible) {
      for (const root of this.ghostRoots) root.visible = false;
      return;
    }

    const outerSweep = to < from;

    // 扇形光带：外弧 → 内弧围成的实心拖尾（动画里的速度残像）。
    const band = this.female ? s * 0.72 : s * 0.34;
    const rIn = r - band;
    this.swingRibbonPath.clear();
    this.swingRibbonPath.moveTo(pivotX + Math.cos(from) * r, pivotY + Math.sin(from) * r);
    this.swingRibbonPath.arc(pivotX, pivotY, r, from, to, outerSweep);
    this.swingRibbonPath.lineTo(pivotX + Math.cos(to) * rIn, pivotY + Math.sin(to) * rIn);
    this.swingRibbonPath.arc(pivotX, pivotY, rIn, to, from, !outerSweep);
    this.swingRibbonPath.closePath();
    setFill(this.swingGfx, trailCol, (this.female ? 0.1 : 0.055) * strength);
    attachPath(this.swingGfx, this.swingRibbonPath);
    this.swingGfx.fill();

    // 内侧更亮的窄带。
    const rIn2 = r - band * 0.45;
    this.swingRibbonPath.clear();
    this.swingRibbonPath.moveTo(pivotX + Math.cos(from) * r, pivotY + Math.sin(from) * r);
    this.swingRibbonPath.arc(pivotX, pivotY, r, from, to, outerSweep);
    this.swingRibbonPath.lineTo(pivotX + Math.cos(to) * rIn2, pivotY + Math.sin(to) * rIn2);
    this.swingRibbonPath.arc(pivotX, pivotY, rIn2, to, from, !outerSweep);
    this.swingRibbonPath.closePath();
    setFill(this.swingGfx, this.female ? RIN_IMPACT : color, 0.08 * strength);
    attachPath(this.swingGfx, this.swingRibbonPath);
    this.swingGfx.fill();

    // 外缘亮线。
    setStroke(this.swingGfx, s * 0.05, hexA(trailCol, 0.42 * strength), 1, 'round');
    this.swingArcPath.clear();
    this.swingArcPath.moveTo(pivotX + Math.cos(from) * r, pivotY + Math.sin(from) * r);
    this.swingArcPath.arc(pivotX, pivotY, r, from, to, outerSweep);
    attachPath(this.swingGfx, this.swingArcPath);
    this.swingGfx.stroke();

    // 3 条向外甩的速度线。
    setStroke(this.swingGfx, s * 0.022, hexA(trailCol, 0.3 * strength), 1, 'round');
    for (let i = 1; i <= 3; i++) {
      const a = lerp(from, to, i / 4);
      this.swingGfx.beginPath();
      this.swingGfx.moveTo(pivotX + Math.cos(a) * rIn2, pivotY + Math.sin(a) * rIn2);
      this.swingGfx.lineTo(
        pivotX + Math.cos(a) * (r + s * 0.16),
        pivotY + Math.sin(a) * (r + s * 0.16),
      );
      this.swingGfx.stroke();
    }

    // 三道淡影，越接近当前角度越实。
    this.ghostBatPath.clear();
    if (this.female) {
      this.buildScytheBlade(this.ghostBatPath, s, L, 0, 0);
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
      if (this.female) {
        // 镰刀柄在淡影里也补一笔，让剪影能读出「长柄 + 弯刃」。
        setStroke(gfx, s * 0.045, trailCol, (GHOST_ALPHA[i] ?? 0) * strength);
        gfx.beginPath();
        gfx.moveTo(-s * 0.1, 0);
        gfx.lineTo(s * SCYTHE_LEN_R * 0.98, 0);
        gfx.stroke();
      }
    }
  }

  /** 受击红闪（立绘）：给贴图叠一层红色调，不画程序化色块。 */
  private drawSpriteFlash(flash: number): void {
    this.flashGfx.clear();
    this.sprite.tint = flash > 0.02 ? 0xff8f9f : 0xffffff;
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
