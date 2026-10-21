/**
 * 角色 —— `drawPlayer` / `drawLegs` / `drawTorso` / `drawHead` / `drawSwordArm`。
 *
 * 逐字搬自 `source.html:1654-1959`。
 *
 * 出招时间线（蓄力 → 挥击 → 收招）、FEVER 光环、脚下平台光、生命环、
 * 能量刃的渐变与枪尖闪光全部照抄，数值一个都没改。
 *
 * 唯一的适配：旧代码读全局 `hp` / `vt` / `frenzyActive` / `playerFlash`，
 * 这里改成读 `FrameContext`（渲染层不持有状态，只读快照）。
 *
 * **Canvas 2D 的 `ctx.save/translate/rotate/scale` 在 Pixi 版映射为容器变换**：
 *
 * ```
 * container
 * ├── haloGfx      FEVER 光环（世界坐标，原点在 playerX,y）
 * ├── platformGfx  脚下平台光（世界坐标）
 * ├── legsGfx      双腿（世界坐标）
 * ├── bodyRoot     躯干变换（translate + rotate + scale）
 * │   ├── torsoGfx
 * │   ├── flashGfx
 * │   └── armRoot   持剑臂原点（translate）
 * │       ├── swingGfx      挥击光幕（在旋转之前 —— 与旧代码同序）
 * │       ├── bladeRoot0/1  两道残刃（各自旋转）
 * │       └── armPivot      手臂旋转（rotate(armA)）
 * │           └── armGfx
 * └── hpGfx        生命环（世界坐标，原点在 playerX,y）
 * ```
 *
 * **路径复用**：所有「同一形状要描边多次」的场合都把形状存进一个**可复用的**
 * `GraphicsPath`（`clear()` 后重建），避免每帧新建路径对象。
 */

import { Container, Graphics, GraphicsPath } from 'pixi.js';
import type { FillGradient } from 'pixi.js';
import { ATTACK_DUR, FRENZY_LANE, LANE, MAX_HP } from '../../game/constants';
import type { FrameContext } from './context';
import { destroyGradient, linearGradient, radialGradient } from './gradient';
import {
  arcInto,
  circleInto,
  roundRectInto,
  sectorInto,
  setFill,
  setFillGradient,
  setStroke,
  setStrokeGradient,
  starInto,
  attachPath,
} from './gfx';
import { clamp, easeInOutCubic, easeOutCubic, lerp } from './math';
import { hexA } from './palette';

/** 残刃的采样位置（旧 `source.html:1882` 的 `[0.35, 0.7]`）。 */
const BLADE_T0 = 0.35;
const BLADE_T1 = 0.7;

/** FEVER 光环渐变的参考脉冲值。 */
const HALO_REF_PULSE = 0.5;

/** FEVER 光环渐变在参考脉冲下的 alpha（`0.1 + pulse*0.08`）。 */
const HALO_REF_ALPHA = 0.1 + HALO_REF_PULSE * 0.08;

/** 能量刃渐变的参考 alpha（`0.55 + 0.18*sin + 0.4*swing` 的中位）。 */
const BLADE_REF_ALPHA = 0.68;

export class PlayerView {
  /** 容器（挂到 `entities` 层）。 */
  readonly container = new Container();

  // ── 世界坐标部分 ─────────────────────────────────────────
  /**
   * FEVER 光环（票 07：挂到 `glow` 层，参与 bloom）。
   *
   * **不**挂在 `container` 下 —— 渲染器把它单独放进 `glow` 层，
   * 这样它能被 bloom 提亮，而角色的实体部分仍留在 `entities` 层的原位。
   */
  readonly haloGfx = new Graphics();
  /**
   * 脚下平台光（票 07：挂到 `glow` 层，参与 bloom）—— 同上。
   */
  readonly platformGfx = new Graphics();
  private readonly legsGfx = new Graphics();
  private readonly hpGfx = new Graphics();

  // ── 躯干变换 ─────────────────────────────────────────────
  private readonly bodyRoot = new Container();
  private readonly torsoGfx = new Graphics();
  private readonly flashGfx = new Graphics();
  private readonly armRoot = new Container();
  private readonly swingGfx = new Graphics();
  private readonly bladeRoot0 = new Container();
  private readonly bladeRoot1 = new Container();
  private readonly bladeGfx0 = new Graphics();
  private readonly bladeGfx1 = new Graphics();
  private readonly armPivot = new Container();
  private readonly armGfx = new Graphics();

  // ── 复用路径 ─────────────────────────────────────────────
  private readonly torsoPath = new GraphicsPath();
  private readonly shoulderPath = new GraphicsPath();
  private readonly headPath = new GraphicsPath();
  private readonly flashPath = new GraphicsPath();
  private readonly hpPath = new GraphicsPath();
  private readonly haloArcPath = new GraphicsPath();
  private readonly swingPath = new GraphicsPath();
  private readonly guardPath = new GraphicsPath();
  private readonly sparkPath = new GraphicsPath();

  // ── 渐变（复用，不每帧重建） ──────────────────────────────
  private bodyGradient: FillGradient | null = null;
  private haloGradient: FillGradient | null = null;
  private platformGradient: FillGradient | null = null;
  private bladeGradient: FillGradient | null = null;
  /** 挥击光幕渐变（按轨道色缓存，最多 4 种）。 */
  private readonly swingGradients = new Map<string, FillGradient>();

  constructor() {
    // `haloGfx` / `platformGfx` **不**进 `container` ——
    // 渲染器把它们放进 `glow` 层（票 07 的 bloom 层）。
    this.container.addChild(this.legsGfx);
    this.container.addChild(this.bodyRoot);
    this.bodyRoot.addChild(this.torsoGfx);
    this.bodyRoot.addChild(this.flashGfx);
    this.bodyRoot.addChild(this.armRoot);
    this.armRoot.addChild(this.swingGfx);
    this.armRoot.addChild(this.bladeRoot0);
    this.armRoot.addChild(this.bladeRoot1);
    this.bladeRoot0.addChild(this.bladeGfx0);
    this.bladeRoot1.addChild(this.bladeGfx1);
    this.armRoot.addChild(this.armPivot);
    this.armPivot.addChild(this.armGfx);
    this.container.addChild(this.hpGfx);
  }

  prepare(): void {
    if (this.bodyGradient) return;
    // 躯干渐变：斜向（左上 → 右下），旧 `source.html:1821-1824`。
    // 归一化坐标按躯干圆角矩形的包围盒换算（`-0.62s..0.62s` × `-0.52s..0.43s`）。
    this.bodyGradient = linearGradient(
      [
        { offset: 0, color: '#2b5a7a' },
        { offset: 0.5, color: '#16313f' },
        { offset: 1, color: '#0d1e2b' },
      ],
      0.0161,
      0.0211,
      0.9839,
      1.0737,
    );
    // FEVER 光环：内圈透明 → 0.55 处最亮 → 外圈透明（旧 `source.html:2077-2080`）。
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
    // 脚下平台光（旧 `source.html:2102-2104`）。
    this.platformGradient = radialGradient(
      [
        { offset: 0, color: 'rgba(96,200,255,.22)' },
        { offset: 1, color: 'rgba(96,200,255,0)' },
      ],
      0.5,
      0.5,
      0,
      0.5,
    );
    // 能量刃（旧 `source.html:2369-2372`）。
    this.bladeGradient = linearGradient(
      [
        { offset: 0, color: `rgba(235,253,255,${BLADE_REF_ALPHA})` },
        { offset: 0.55, color: `rgba(150,238,255,${BLADE_REF_ALPHA * 0.75})` },
        { offset: 1, color: 'rgba(120,230,255,0)' },
      ],
      0,
      0.5,
      1,
      0.5,
    );
  }

  draw(fc: FrameContext): void {
    const { height, playerR, playerX } = fc.layout;
    const y = height / 2;
    const s = playerR;
    const flash = fc.playerFlash;

    /* ---------- 出招时间线：蓄力 → 挥击 → 收招 ---------- */
    const active = fc.attackT > 0 && !!fc.attackLane;
    const T = active ? clamp(1 - fc.attackT / ATTACK_DUR, 0, 1) : 0;
    const dir = fc.attackLane === 'top' ? -1 : 1; // -1 上轨 / +1 下轨

    const idleA = 0.18;
    const windA = -dir * 0.85; // 蓄力：向反方向抬
    const hitA = dir * 1.05; // 挥出：斜指对应轨道

    let armA = idleA;
    let swing = 0;
    if (active) {
      if (T < 0.2) {
        armA = lerp(idleA, windA, easeOutCubic(T / 0.2));
      } else if (T < 0.44) {
        const k = easeOutCubic((T - 0.2) / 0.24);
        armA = lerp(windA, hitA, k);
        swing = k;
      } else {
        const k = easeInOutCubic((T - 0.44) / 0.56);
        armA = lerp(hitA, idleA, k);
        swing = 1 - k;
      }
    }

    const lunge = dir * s * 0.42 * swing; // 上半身整体冲向轨道
    const bodyRot = dir * 0.2 * swing; // 躯干前倾
    const laneColor = fc.frenzyActive
      ? FRENZY_LANE[dir < 0 ? 'top' : 'bottom']
      : dir < 0
        ? LANE.top.color
        : LANE.bottom.color;
    const bob = Math.sin(fc.vt * 2.2) * s * 0.03;

    /* ---------- FEVER 光环 ---------- */
    this.drawFeverHalo(fc, playerX, y, s);

    /* ---------- 脚下平台光 ---------- */
    this.drawPlatformGlow(playerX, y, s);

    /* ---------- 双腿（脚掌钉在原地，随冲刺屈伸） ---------- */
    this.drawLegs(fc, s, y, lunge, dir);

    /* ---------- 上半身 ---------- */
    this.bodyRoot.position.set(playerX, y + bob + lunge);
    this.bodyRoot.rotation = bodyRot;
    this.bodyRoot.scale.set(1, 1 - 0.06 * swing);
    this.drawTorso(fc, s, swing);
    this.drawHead(fc, s);
    this.drawSwordArm(fc, s, armA, swing, laneColor, windA);
    this.drawFlash(flash, s);

    /* ---------- 生命环 ---------- */
    this.drawHpRing(fc, playerX, y, s);
  }

  destroy(): void {
    destroyGradient(this.bodyGradient);
    destroyGradient(this.haloGradient);
    destroyGradient(this.platformGradient);
    destroyGradient(this.bladeGradient);
    this.bodyGradient = null;
    this.haloGradient = null;
    this.platformGradient = null;
    this.bladeGradient = null;
    for (const gradient of this.swingGradients.values()) destroyGradient(gradient);
    this.swingGradients.clear();
  }

  // ── 内部 ──────────────────────────────────────────────────

  /** FEVER 光环 —— `source.html:2072-2098`。 */
  private drawFeverHalo(fc: FrameContext, playerX: number, y: number, s: number): void {
    const g = this.haloGfx;
    g.clear();
    if (!fc.frenzyActive) return;
    const pulse = 0.5 + 0.5 * Math.sin(fc.vt * 6);

    // 外层金色呼吸光环。
    const gradient = this.haloGradient;
    if (gradient) {
      setFillGradient(g, gradient, (0.1 + pulse * 0.08) / HALO_REF_ALPHA);
      g.beginPath();
      g.circle(playerX, y, s * (2.3 + pulse * 0.35));
      g.fill();
    }

    // 金色电弧环：宽底描边代替 shadowBlur。
    for (let i = 0; i < 3; i++) {
      const rr = s * (1.55 + i * 0.28 + pulse * 0.06);
      const a0 = fc.vt * (1.6 + i * 0.5) + i * 2.1;
      this.haloArcPath.clear();
      arcInto(this.haloArcPath, playerX, y, rr, a0, a0 + Math.PI * 1.05);
      setStroke(g, 9, 'rgba(255,190,60,.16)');
      attachPath(g, this.haloArcPath);
      g.stroke();
      setStroke(g, 2, `rgba(255,226,120,${0.35 + pulse * 0.35})`);
      attachPath(g, this.haloArcPath);
      g.stroke();
    }
  }

  /** 脚下平台光 —— `source.html:2102-2108`。 */
  private drawPlatformGlow(playerX: number, y: number, s: number): void {
    const g = this.platformGfx;
    g.clear();
    const gradient = this.platformGradient;
    if (!gradient) return;
    setFillGradient(g, gradient);
    g.beginPath();
    g.ellipse(playerX, y + s * 1.35, s * 1.95, s * 0.42);
    g.fill();
  }

  /** 双腿 —— `source.html:1768-1800`。 */
  private drawLegs(fc: FrameContext, s: number, y: number, lunge: number, dir: number): void {
    const g = this.legsGfx;
    g.clear();
    const { playerX } = fc.layout;
    const hipY = y + lunge * 0.5;
    const footY = y + s * 0.96;
    const kneeY = (hipY + footY) * 0.5;
    const spread = s * 0.26;
    const lean = (dir * s * 0.06 * Math.abs(lunge)) / (s * 0.26);

    setStroke(g, s * 0.24, '#17364d', 1, 'round');
    g.beginPath();
    this.legPath(g, -1, playerX, spread, lean, hipY, kneeY, footY);
    this.legPath(g, 1, playerX, spread, lean, hipY, kneeY, footY);
    g.stroke();

    // 脚掌。
    setStroke(g, s * 0.1, 'rgba(120,238,255,.55)', 1, 'round');
    g.beginPath();
    this.footPath(g, -1, playerX, s, spread, lean, footY);
    this.footPath(g, 1, playerX, s, spread, lean, footY);
    g.stroke();
  }

  /** 一条腿 —— 旧 `source.html:1780-1786`。 */
  private legPath(
    g: Graphics,
    side: number,
    playerX: number,
    spread: number,
    lean: number,
    hipY: number,
    kneeY: number,
    footY: number,
  ): void {
    const front = side > 0;
    const footX = playerX + side * spread + (front ? lean : lean * 0.5);
    const kneeX = playerX + side * spread * 0.85 + (front ? lean * 0.7 : lean * 0.3);
    g.moveTo(playerX + side * spread * 0.7, hipY);
    g.quadraticCurveTo(kneeX, kneeY, footX, footY);
  }

  /** 一只脚掌 —— 旧 `source.html:1792-1797`。 */
  private footPath(
    g: Graphics,
    side: number,
    playerX: number,
    s: number,
    spread: number,
    lean: number,
    footY: number,
  ): void {
    const front = side > 0;
    const footX = playerX + side * spread + (front ? lean : lean * 0.5);
    g.moveTo(footX - s * 0.1, footY);
    g.lineTo(footX + s * 0.14, footY);
  }

  /** 躯干 —— `source.html:1802-1840`。 */
  private drawTorso(fc: FrameContext, s: number, swing: number): void {
    const g = this.torsoGfx;
    g.clear();

    // 躯干主体（圆角矩形 + 渐变填充 + 两道描边）。
    const gradient = this.bodyGradient;
    if (gradient) {
      this.torsoPath.clear();
      roundRectInto(this.torsoPath, -s * 0.62, -s * 0.52, s * 1.24, s * 0.95, s * 0.24);
      setFillGradient(g, gradient);
      attachPath(g, this.torsoPath);
      g.fill();
      setStroke(g, 7, 'rgba(90,210,255,.18)');
      g.stroke();
      setStroke(g, 2, 'rgba(110,225,255,.75)');
      attachPath(g, this.torsoPath);
      g.stroke();
    }

    // 胸口横线。
    setStroke(g, 1.6, 'rgba(120,230,255,.35)');
    g.beginPath();
    g.moveTo(-s * 0.34, s * 0.16);
    g.lineTo(s * 0.3, s * 0.16);
    g.stroke();

    // 核心。
    const core = clamp(0.45 + 0.35 * Math.sin(fc.vt * 3.4) + 0.3 * swing, 0, 1);
    setFill(g, `rgba(95,225,255,${core * 0.22})`);
    g.beginPath();
    g.circle(-s * 0.08, -s * 0.12, s * 0.22);
    g.fill();
    setFill(g, `rgba(95,225,255,${core})`);
    g.beginPath();
    g.circle(-s * 0.08, -s * 0.12, s * 0.14);
    g.fill();

    // 双肩。
    setFill(g, '#1d435c');
    setStroke(g, 1.8, 'rgba(110,225,255,.6)');
    this.shoulderPath.clear();
    roundRectInto(this.shoulderPath, -s * 0.82, -s * 0.58, s * 0.34, s * 0.36, s * 0.1);
    attachPath(g, this.shoulderPath);
    g.fill();
    g.stroke();
    this.shoulderPath.clear();
    roundRectInto(this.shoulderPath, s * 0.48, -s * 0.58, s * 0.34, s * 0.36, s * 0.1);
    attachPath(g, this.shoulderPath);
    g.fill();
    g.stroke();
  }

  /** 头部 —— `source.html:1842-1857`。 */
  private drawHead(fc: FrameContext, s: number): void {
    const g = this.torsoGfx;
    setFill(g, '#102232');
    setStroke(g, 2, 'rgba(130,235,255,.8)');
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.3, -s * 1.1, s * 0.62, s * 0.56, s * 0.16);
    attachPath(g, this.headPath);
    g.fill();
    g.stroke();

    const eyeA = 0.75 + 0.25 * Math.sin(fc.vt * 4.2);
    const eyeColor =
      fc.hp / MAX_HP <= 0.3 ? `rgba(255,77,109,${eyeA})` : `rgba(120,240,255,${eyeA})`;
    setFill(g, eyeColor, 0.3);
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.2, -s * 0.98, s * 0.48, s * 0.24, s * 0.09);
    attachPath(g, this.headPath);
    g.fill();
    setFill(g, eyeColor, 1);
    this.headPath.clear();
    roundRectInto(this.headPath, -s * 0.16, -s * 0.94, s * 0.4, s * 0.16, s * 0.06);
    attachPath(g, this.headPath);
    g.fill();
  }

  /** 角色受击红闪 —— `source.html:2121-2125`。 */
  private drawFlash(flash: number, s: number): void {
    const g = this.flashGfx;
    g.clear();
    if (flash <= 0) return;
    setFill(g, `rgba(255,60,90,${flash * 0.42})`);
    this.flashPath.clear();
    roundRectInto(this.flashPath, -s * 0.9, -s * 1.2, s * 2.1, s * 2.3, s * 0.4);
    attachPath(g, this.flashPath);
    g.fill();
  }

  /** 生命环 —— `source.html:2129-2153`。 */
  private drawHpRing(fc: FrameContext, playerX: number, y: number, s: number): void {
    const g = this.hpGfx;
    g.clear();
    const frac = fc.hp / MAX_HP;

    setStroke(g, 2.5, 'rgba(255,255,255,.07)');
    this.hpPath.clear();
    arcInto(this.hpPath, playerX, y, s * 1.95, 0, Math.PI * 2);
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
    arcInto(this.hpPath, playerX, y, s * 1.95, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    attachPath(g, this.hpPath);
    g.stroke();
    setStroke(g, 2.5, hpCol, 1);
    attachPath(g, this.hpPath);
    g.stroke();
  }

  /** 持剑臂 —— `source.html:1859-1959`。 */
  private drawSwordArm(
    fc: FrameContext,
    s: number,
    armA: number,
    swing: number,
    laneColor: string,
    windA: number,
  ): void {
    const g = this.armGfx;
    g.clear();
    this.armRoot.position.set(s * 0.38, -s * 0.2);

    /* 挥击扇形：柔和光幕 + 亮边（在 `rotate(armA)` 之前 —— 与旧代码同序）。 */
    const swingGfx = this.swingGfx;
    swingGfx.clear();
    if (swing > 0.04) {
      const a0 = Math.min(windA, armA);
      const a1 = Math.max(windA, armA);
      if (a1 - a0 > 0.02) {
        const gradient = this.swingGradientFor(laneColor);
        if (gradient) {
          this.swingPath.clear();
          sectorInto(this.swingPath, 0, 0, s * 2.15, a0, a1);
          setFillGradient(swingGfx, gradient, swing);
          attachPath(swingGfx, this.swingPath);
          swingGfx.fill();
        }

        // 两道残刃（各自旋转 `ga`）。
        this.drawResidualBlade(this.bladeRoot0, this.bladeGfx0, lerp(a0, a1, BLADE_T0), s, swing);
        this.drawResidualBlade(this.bladeRoot1, this.bladeGfx1, lerp(a0, a1, BLADE_T1), s, swing);

        // 弧形亮边。
        this.swingPath.clear();
        arcInto(this.swingPath, 0, 0, s * 1.98, a0, a1);
        setStroke(swingGfx, 2.5, hexA(laneColor, 0.55 * swing), 1, 'round');
        attachPath(swingGfx, this.swingPath);
        swingGfx.stroke();
      }
    }

    this.armPivot.rotation = armA;

    /* 上臂。 */
    setStroke(g, s * 0.24, '#1b3c52', 1, 'round');
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(s * 0.5, 0);
    g.stroke();

    /* 护手。 */
    setFill(g, '#2b6c8c');
    setStroke(g, 1.4, 'rgba(120,235,255,.7)');
    this.guardPath.clear();
    circleInto(this.guardPath, s * 0.54, 0, s * 0.16);
    attachPath(g, this.guardPath);
    g.fill();
    g.stroke();

    /* 能量刃（前半段实、后半段渐隐）。 */
    const bladeA = clamp(0.55 + 0.18 * Math.sin(fc.vt * 3) + 0.4 * swing, 0, 1);
    const bx = s * 0.58;
    const bx1 = s * (1.3 + 0.62 * swing);
    setStroke(g, s * (0.3 + 0.12 * swing), 'rgba(120,230,255,.18)', 1, 'round');
    g.beginPath();
    g.moveTo(bx, 0);
    g.lineTo(bx1, 0);
    g.stroke();
    const gradient = this.bladeGradient;
    if (gradient) {
      const w = s * (0.12 + 0.08 * swing);
      setStrokeGradient(g, w, gradient, bladeA / BLADE_REF_ALPHA, 'round');
      g.beginPath();
      g.rect(bx, -w / 2, bx1 - bx, w);
      g.stroke();
    }

    /* 枪尖闪光。 */
    if (swing > 0.55) {
      const f = clamp((swing - 0.55) / 0.45, 0, 1);
      setFill(g, hexA(laneColor, 0.35), f);
      this.sparkPath.clear();
      starInto(this.sparkPath, bx1 - s * 0.05, 0, s * (0.22 + 0.2 * f), s * (0.08 + 0.07 * f));
      attachPath(g, this.sparkPath);
      g.fill();
      setFill(g, '#ffffff', f);
      this.sparkPath.clear();
      starInto(this.sparkPath, bx1 - s * 0.05, 0, s * (0.12 + 0.13 * f), s * (0.04 + 0.04 * f));
      attachPath(g, this.sparkPath);
      g.fill();
    }
  }

  /** 一道残刃。 */
  private drawResidualBlade(
    root: Container,
    gfx: Graphics,
    angle: number,
    s: number,
    swing: number,
  ): void {
    root.rotation = angle;
    gfx.clear();
    setStroke(gfx, 2, '#dffaff', 0.22 * swing, 'round');
    gfx.beginPath();
    gfx.moveTo(s * 0.55, 0);
    gfx.lineTo(s * 1.55, 0);
    gfx.stroke();
  }

  /** 挥击光幕渐变（按轨道色缓存）。 */
  private swingGradientFor(color: string): FillGradient {
    const cached = this.swingGradients.get(color);
    if (cached) return cached;
    const gradient = radialGradient(
      [
        { offset: 0, color: hexA(color, 0) },
        { offset: 0.55, color: hexA(color, 0.16) },
        { offset: 1, color: hexA(color, 0) },
      ],
      0.5,
      0.5,
      0,
      0.5,
    );
    this.swingGradients.set(color, gradient);
    return gradient;
  }
}
