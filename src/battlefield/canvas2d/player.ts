/**
 * 角色 —— 一个会走路的棒子人。
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
 */

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
import { FEET_OFFSET_R, laneGroundY } from './ground';
import { clamp, easeInOutCubic, easeOutCubic, lerp } from './math';
import { hexA, roundRectPath, starPath } from './paths';

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

export class PlayerView {
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

  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
    const { playerR: s, playerX } = fc.layout;

    const dt = this.frameDt(fc);

    // 新一局：游戏时间归零，清掉上一局残留的滞空 / 下落状态
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
      // 从下轨起跳：0.5 秒到最高点（脚底贴上轨），1 秒落回下轨
      const p = 1 - airT / TOP_AIR_TIME;
      y = bottomY - (bottomY - topY) * 4 * p * (1 - p);
      this.displayY = y;
      this.fallV = 0;
    } else if (lane === 'bottom' && this.displayY > bottomY + 0.5) {
      // airT 被下轨出招打断 / 长按结束：还在空中，受重力落回地面
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

    // 只有踩在下轨地面上时才算「在走」；空中 / 悬浮 / 出招都暂停步态
    const onGround = lane === 'bottom' && !jumping && !falling && Math.abs(y - bottomY) < 1.5;
    const walking =
      fc.phase === 'running' && !attackActive && !hold && pairP === 0 && onGround;
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
      // 双生击破：蓄力 → 大幅跳起 → 落下时把棒子砸到底
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
      // 长按：悬浮在轨道上方，按固定周期连续向下敲击
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
        // 暂停 / 续按宽限：举棒等待
        clubA = -1.35 + Math.sin(fc.vt * 3) * 0.05;
      }
    } else if (attackActive) {
      const T = clamp(1 - fc.attackT / ATTACK_DUR, 0, 1);
      if (fc.attackLane === 'top') {
        // 上轨：高度由滞空抛物线控制，这里只负责向上挥棒
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
        // 下轨：抡到头顶 → 向下砸
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

    // 滞空姿态：收腿、身体随上升 / 下落微微前倾
    if (jumping) {
      const p = 1 - airT / TOP_AIR_TIME;
      legTuck = Math.max(legTuck, p < 0.55 ? 0.9 : 0.55);
      bodyRot += p < 0.5 ? -0.06 : 0.06;
    } else if (falling) {
      legTuck = Math.max(legTuck, 0.35);
      bodyRot += 0.05;
    }

    // 落地压缩：身体略微压扁、重心下沉
    if (this.landT > 0) squash = Math.max(squash, (this.landT / LAND_DUR) * 0.45);
    lift += squash * s * 0.1;
    const bob =
      jumping || falling
        ? 0
        : Math.sin(fc.vt * 2.2) * s * 0.03 + Math.abs(Math.sin(walkPhase)) * s * 0.035 * walkAmp;

    const actionLane = pairP > 0
      ? (fc.playerLane ?? 'bottom')
      : hold
        ? hold.lane
        : attackActive
          ? (fc.attackLane ?? lane)
          : lane;
    const laneColor = fc.frenzyActive ? FRENZY_LANE[actionLane] : LANE[actionLane].color;

    /* ---------- 脚下地面光 ---------- */
    if (lane === 'bottom' && !jumping && !falling) {
      const g = ctx.createRadialGradient(playerX, groundFeet, 2, playerX, groundFeet, s * 1.7);
      g.addColorStop(0, 'rgba(96,200,255,.16)');
      g.addColorStop(1, 'rgba(96,200,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(playerX, groundFeet, s * 1.65, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ---------- 身体 ---------- */
    const bodyY = y + hover + lift + bob;

    // 地面投影：越高越淡越小，给跳跃一个落脚参照
    const feetWorld = bodyY + s * FEET_OFFSET_R;
    const maxLift = Math.max(1, groundFeet - (topY + s * FEET_OFFSET_R));
    const hk = clamp((groundFeet - feetWorld) / maxLift, 0, 1);
    if (hk > 0.02) {
      const rx = s * (0.62 - 0.3 * hk);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.3 - 0.12 * hk) + ')';
      ctx.beginPath();
      ctx.ellipse(playerX, groundFeet, rx, rx * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 走路时在身后扬起一点尘土，让「在地面上走」更明确
    if (walking) {
      const footLine = bodyY + s * FEET_OFFSET_R;
      const cycle = (walkPhase / (Math.PI * 2)) % 1;
      for (let i = 0; i < 2; i++) {
        const age = (cycle + i * 0.5) % 1;
        const px = playerX - s * (0.3 + age * 1.0);
        const py = footLine + s * 0.02 - Math.sin(age * Math.PI) * s * 0.03;
        const r = s * (0.05 + age * 0.11);
        ctx.fillStyle = 'rgba(150,195,205,' + (1 - age) * 0.14 + ')';
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const pivotX = s * CLUB_PIVOT_X_R;
    const pivotY = -s * 0.26;
    const gripDist = s * CLUB_GRIP_R;
    const gripX = pivotX + Math.cos(clubA) * gripDist;
    const gripY = pivotY + Math.sin(clubA) * gripDist;

    /* ---------- FEVER 光环 ---------- */
    if (fc.frenzyActive) this.drawFever(fc, playerX, bodyY, s);

    ctx.save();
    ctx.translate(playerX, bodyY);
    ctx.rotate(bodyRot);
    const stretch = 1 + squash * 0.05;
    ctx.scale(1 / stretch, stretch);

    // 腿（在躯干后面）
    this.drawLegs(ctx, s, walkAmp, walkPhase, legTuck);

    // 挥棒残影（在身体后面）
    this.drawSwingGhosts(ctx, s, pivotX, pivotY, gripDist, trailFrom, clubA, laneColor, trail);

    // 后手（深色）
    this.drawArm(ctx, s, -s * 0.28, -s * 0.3, gripX, gripY, SKIN_DARK, JERSEY_DARK);

    // 躯干 + 头
    this.drawTorso(fc, s);
    this.drawHead(fc, s);

    // 前手 + 棒子
    this.drawArm(ctx, s, s * 0.1, -s * 0.3, gripX, gripY, SKIN, JERSEY);
    this.drawBat(fc, s, gripX, gripY, clubA, trail, impact, laneColor);

    // 受击红闪
    if (fc.playerFlash > 0) {
      ctx.fillStyle = 'rgba(255,60,90,' + fc.playerFlash * 0.42 + ')';
      roundRectPath(ctx, -s * 0.78, -s * 1.16, s * 1.62, s * 2.2, s * 0.4);
      ctx.fill();
    }
    ctx.restore();

    /* ---------- 双生落地的冲击环 ---------- */
    if (pairP > 0.72 && pairP < 1) {
      const k = clamp((pairP - 0.72) / 0.28, 0, 1);
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k) * 0.55 + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(playerX, y + s * 1.15, s * (0.5 + 1.7 * k), s * (0.12 + 0.4 * k), 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    /* ---------- 落地的尘环 ---------- */
    if (this.landT > 0) {
      const k = 1 - this.landT / LAND_DUR;
      ctx.strokeStyle = 'rgba(200,230,220,' + (1 - k) * 0.3 + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(
        playerX,
        groundFeet,
        s * (0.7 + 1.2 * k),
        s * (0.16 + 0.24 * k),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    /* ---------- 生命环 ---------- */
    this.drawHpRing(fc, playerX, bodyY, s);
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
   * 绘制
   * ------------------------------------------------------------------ */

  /** 双腿：走路时前后摆，跳起 / 悬浮时收腿。 */
  private drawLegs(
    ctx: CanvasRenderingContext2D,
    s: number,
    walkAmp: number,
    step: number,
    tuck: number,
  ): void {
    const hipY = s * 0.24;
    const footY = s * FEET_OFFSET_R - tuck * s * 0.16;
    const swing = Math.sin(step) * 0.26 * walkAmp;
    const lift = tuck * s * 0.18;

    ctx.save();
    ctx.lineCap = 'round';
    for (const sgn of SIDES) {
      const phase = sgn * swing;
      const hipX = sgn * s * 0.15;
      const footX = sgn * s * 0.2 + phase * s + tuck * s * 0.18;
      const kneeX = (hipX + footX) / 2 + sgn * s * 0.02;
      const kneeY = (hipY + footY - lift) / 2;

      ctx.strokeStyle = PANTS;
      ctx.lineWidth = s * 0.21;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.quadraticCurveTo(kneeX, kneeY, footX, footY - lift);
      ctx.stroke();

      // 地面偏暗，给腿加一道轮廓光，避免和地面糊在一起
      ctx.strokeStyle = 'rgba(170,215,245,.2)';
      ctx.lineWidth = s * 0.045;
      ctx.beginPath();
      ctx.moveTo(hipX - s * 0.055, hipY + s * 0.04);
      ctx.quadraticCurveTo(
        kneeX - s * 0.055,
        kneeY,
        footX - s * 0.055,
        footY - lift - s * 0.03,
      );
      ctx.stroke();

      // 鞋
      ctx.fillStyle = SHOE;
      roundRectPath(ctx, footX - s * 0.16, footY - lift - s * 0.05, s * 0.34, s * 0.14, s * 0.06);
      ctx.fill();
      ctx.strokeStyle = '#22303c';
      ctx.lineWidth = s * 0.035;
      ctx.beginPath();
      ctx.moveTo(footX - s * 0.14, footY - lift + s * 0.07);
      ctx.lineTo(footX + s * 0.16, footY - lift + s * 0.07);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 躯干：红色球衣 + 奶油色条纹。 */
  private drawTorso(fc: FrameContext, s: number): void {
    const ctx = fc.ctx;
    const bodyGrad = ctx.createLinearGradient(-s * 0.45, -s * 0.55, s * 0.45, s * 0.35);
    bodyGrad.addColorStop(0, '#ef6a5f');
    bodyGrad.addColorStop(0.55, JERSEY);
    bodyGrad.addColorStop(1, JERSEY_DARK);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = 'rgba(40,16,20,.55)';
    ctx.lineWidth = s * 0.045;

    ctx.beginPath();
    ctx.moveTo(-s * 0.4, -s * 0.46);
    ctx.quadraticCurveTo(0, -s * 0.58, s * 0.4, -s * 0.46);
    ctx.lineTo(s * 0.3, s * 0.26);
    ctx.quadraticCurveTo(0, s * 0.36, -s * 0.3, s * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 奶油色胸带
    ctx.strokeStyle = TRIM;
    ctx.lineWidth = s * 0.075;
    ctx.beginPath();
    ctx.moveTo(-s * 0.33, -s * 0.06);
    ctx.quadraticCurveTo(0, s * 0.02, s * 0.33, -s * 0.06);
    ctx.stroke();

    // 领口
    ctx.strokeStyle = '#3a1519';
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.arc(0, -s * 0.46, s * 0.16, 0.15, Math.PI - 0.15);
    ctx.stroke();

    // 背号（一个简单的 7）
    ctx.strokeStyle = 'rgba(244,234,214,.85)';
    ctx.lineWidth = s * 0.035;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.11, s * 0.06);
    ctx.lineTo(s * 0.1, s * 0.02);
    ctx.lineTo(-s * 0.03, s * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.13, s * 0.2);
    ctx.lineTo(s * 0.06, s * 0.24);
    ctx.stroke();
  }

  /** 头：棒球帽 + 侧脸。 */
  private drawHead(fc: FrameContext, s: number): void {
    const ctx = fc.ctx;
    const hx = s * 0.04;
    const hy = -s * 0.78;
    const hr = s * 0.28;

    // 脖子
    ctx.fillStyle = SKIN_DARK;
    roundRectPath(ctx, -s * 0.09, -s * 0.58, s * 0.2, s * 0.18, s * 0.05);
    ctx.fill();

    // 脸
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,30,.5)';
    ctx.lineWidth = s * 0.035;
    ctx.stroke();

    // 耳朵
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(hx - hr * 0.92, hy + hr * 0.14, s * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,50,30,.35)';
    ctx.lineWidth = s * 0.025;
    ctx.stroke();

    // 帽顶
    ctx.fillStyle = CAP;
    ctx.beginPath();
    ctx.arc(hx, hy - s * 0.04, hr * 1.02, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = CAP_BRIM;
    roundRectPath(ctx, hx + s * 0.03, hy - s * 0.16, hr * 0.98, s * 0.1, s * 0.045);
    ctx.fill();
    ctx.fillStyle = '#2b3f52';
    roundRectPath(ctx, hx - hr * 0.18, hy - s * 0.29, hr * 0.36, s * 0.08, s * 0.035);
    ctx.fill();

    // 眼睛：血量低时变红
    const eyeCol = fc.hp / MAX_HP <= 0.3 ? '#ff4d6d' : '#1a2836';
    ctx.fillStyle = eyeCol;
    ctx.beginPath();
    ctx.ellipse(hx + s * 0.12, hy + s * 0.03, s * 0.045, s * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();

    // 眉毛：出手时更凶
    ctx.strokeStyle = '#3a2a24';
    ctx.lineWidth = s * 0.03;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx + s * 0.03, hy - s * 0.06);
    ctx.lineTo(hx + s * 0.2, hy - s * 0.02);
    ctx.stroke();

    // 嘴
    ctx.strokeStyle = 'rgba(120,60,40,.7)';
    ctx.lineWidth = s * 0.028;
    ctx.beginPath();
    ctx.moveTo(hx + s * 0.05, hy + s * 0.17);
    ctx.lineTo(hx + s * 0.19, hy + s * 0.15);
    ctx.stroke();
  }

  /** 手臂：上臂球衣袖 + 前臂皮肤。 */
  private drawArm(
    ctx: CanvasRenderingContext2D,
    s: number,
    shoulderX: number,
    shoulderY: number,
    gripX: number,
    gripY: number,
    skin: string,
    sleeve: string,
  ): void {
    const midX = lerp(shoulderX, gripX, 0.42);
    const midY = lerp(shoulderY, gripY, 0.42);

    ctx.lineCap = 'round';
    ctx.strokeStyle = sleeve;
    ctx.lineWidth = s * 0.2;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(midX, midY);
    ctx.stroke();

    ctx.strokeStyle = skin;
    ctx.lineWidth = s * 0.16;
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.lineTo(gripX, gripY);
    ctx.stroke();

    // 手掌
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(gripX, gripY, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 棒子：木纹渐变 + 挥击时的光晕。 */
  private drawBat(
    fc: FrameContext,
    s: number,
    gripX: number,
    gripY: number,
    angle: number,
    swing: number,
    impact: number,
    laneColor: string,
  ): void {
    const ctx = fc.ctx;
    const L = s * CLUB_LEN_R;
    ctx.save();
    ctx.translate(gripX, gripY);
    ctx.rotate(angle);
    ctx.lineCap = 'round';

    // 挥击光晕
    if (swing > 0.03) {
      ctx.strokeStyle = hexA(laneColor, 0.24 * swing);
      ctx.lineWidth = s * 0.34;
      ctx.beginPath();
      ctx.moveTo(s * 0.02, 0);
      ctx.lineTo(L * 0.95, 0);
      ctx.stroke();
    }

    // 握把
    ctx.strokeStyle = BAT_GRIP;
    ctx.lineWidth = s * 0.12;
    ctx.beginPath();
    ctx.moveTo(-s * 0.02, 0);
    ctx.lineTo(s * 0.34, 0);
    ctx.stroke();

    // 握把防滑纹
    ctx.strokeStyle = 'rgba(220,190,150,.35)';
    ctx.lineWidth = s * 0.02;
    for (let i = 1; i <= 3; i++) {
      const x = s * (0.05 + i * 0.07);
      ctx.beginPath();
      ctx.moveTo(x, -s * 0.045);
      ctx.lineTo(x, s * 0.045);
      ctx.stroke();
    }

    // 棒身（前端更粗）
    const grad = ctx.createLinearGradient(0, -s * 0.13, 0, s * 0.13);
    grad.addColorStop(0, '#f0c088');
    grad.addColorStop(0.45, BAT);
    grad.addColorStop(1, BAT_DARK);
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(70,40,20,.55)';
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.moveTo(s * 0.28, -s * 0.07);
    ctx.quadraticCurveTo(L * 0.82, -s * 0.13, L * 0.94, -s * 0.06);
    ctx.quadraticCurveTo(L, 0, L * 0.94, s * 0.06);
    ctx.quadraticCurveTo(L * 0.82, s * 0.13, s * 0.28, s * 0.07);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 高光
    ctx.strokeStyle = 'rgba(255,240,215,.5)';
    ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    ctx.moveTo(s * 0.42, -s * 0.035);
    ctx.quadraticCurveTo(L * 0.74, -s * 0.075, L * 0.87, -s * 0.035);
    ctx.stroke();

    // 尾端旋钮
    ctx.fillStyle = '#2a1d16';
    ctx.beginPath();
    ctx.arc(-s * 0.02, 0, s * 0.075, 0, Math.PI * 2);
    ctx.fill();

    // 击打闪光（棒尖）
    if (impact > 0.02) {
      ctx.fillStyle = hexA(laneColor, 0.35 * impact);
      starPath(ctx, L * 0.97, 0, s * (0.2 + 0.2 * impact), s * (0.07 + 0.07 * impact));
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + 0.9 * impact + ')';
      starPath(ctx, L * 0.97, 0, s * (0.1 + 0.12 * impact), s * (0.04 + 0.04 * impact));
      ctx.fill();
    }

    ctx.restore();
  }

  /** 挥棒残影：沿挥击弧线留几道半透明的棒影（避免大块扇形遮住角色）。 */
  private drawSwingGhosts(
    ctx: CanvasRenderingContext2D,
    s: number,
    pivotX: number,
    pivotY: number,
    gripDist: number,
    from: number,
    to: number,
    color: string,
    strength: number,
  ): void {
    if (strength <= 0.04 || Math.abs(to - from) < 0.06) return;

    ctx.save();
    ctx.lineCap = 'round';
    const L = s * CLUB_LEN_R;

    // 棒端扫过的细弧线
    const r = gripDist + L;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, r, from, to, to < from);
    ctx.strokeStyle = hexA(color, 0.32 * strength);
    ctx.lineWidth = s * 0.055;
    ctx.stroke();

    // 三道淡棒影，越接近当前角度越实
    const alphas = [0.1, 0.15, 0.21];
    for (let i = 0; i < alphas.length; i++) {
      const a = lerp(from, to, 0.42 + i * 0.22);
      const gx = pivotX + Math.cos(a) * gripDist;
      const gy = pivotY + Math.sin(a) * gripDist;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(a);
      ctx.globalAlpha = (alphas[i] ?? 0) * strength;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.05);
      ctx.quadraticCurveTo(L * 0.5, -s * 0.09, L * 0.94, -s * 0.055);
      ctx.quadraticCurveTo(L, 0, L * 0.94, s * 0.055);
      ctx.quadraticCurveTo(L * 0.5, s * 0.09, 0, s * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /** FEVER 光环 —— 保留旧版效果。 */
  private drawFever(fc: FrameContext, x: number, y: number, s: number): void {
    const ctx = fc.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(fc.vt * 6);
    ctx.save();
    ctx.translate(x, y);
    const ag = ctx.createRadialGradient(0, 0, s * 0.9, 0, 0, s * (2.3 + pulse * 0.35));
    ag.addColorStop(0, 'rgba(255,210,74,0)');
    ag.addColorStop(0.55, 'rgba(255,210,74,' + (0.1 + pulse * 0.08) + ')');
    ag.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(0, 0, s * (2.3 + pulse * 0.35), 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const rr = s * (1.55 + i * 0.28 + pulse * 0.06);
      const a0 = fc.vt * (1.6 + i * 0.5) + i * 2.1;
      ctx.beginPath();
      ctx.arc(0, 0, rr, a0, a0 + Math.PI * 1.05);
      ctx.strokeStyle = 'rgba(255,190,60,.16)';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,226,120,' + (0.35 + pulse * 0.35) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 生命环 —— 保留旧版效果。 */
  private drawHpRing(fc: FrameContext, x: number, y: number, s: number): void {
    const ctx = fc.ctx;
    const frac = fc.hp / MAX_HP;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.95, 0, Math.PI * 2);
    ctx.stroke();

    const hpCol =
      frac > 0.55
        ? 'rgba(67,224,140,.75)'
        : frac > 0.28
          ? 'rgba(255,182,72,.85)'
          : 'rgba(255,77,109,.95)';
    ctx.strokeStyle = hpCol;
    ctx.beginPath();
    ctx.arc(0, 0, s * 1.95, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }
}
