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
 */

import { ATTACK_DUR, MAX_HP } from '../../game/constants';
import { FRENZY_LANE, LANE } from '../../game/constants';
import type { FrameContext } from './context';
import { clamp, easeInOutCubic, easeOutCubic, lerp } from './math';
import { hexA, roundRectPath, starPath } from './paths';

/** 残刃的采样位置（旧 `source.html:1882` 的 `[0.35, 0.7]`）。 */
const BLADE_T = [0.35, 0.7] as const;
/** 残刃的两个采样点（解构后类型确定，不需要 `!` 断言）。 */
const [BLADE_T0, BLADE_T1] = BLADE_T;

/** 腿的两侧（旧 `source.html:1779` / `1791` 的 `[-1, 1]`）—— 提到模块级，避免每帧建数组。 */
const SIDES = [-1, 1] as const;
/** 左腿 / 右腿。 */
const [SIDE_L, SIDE_R] = SIDES;

export class PlayerView {
  draw(fc: FrameContext): void {
    const ctx = fc.ctx;
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
    if (fc.frenzyActive) {
      const pulse = 0.5 + 0.5 * Math.sin(fc.vt * 6);
      ctx.save();
      ctx.translate(playerX, y);
      // 外层金色呼吸光环
      const ag = ctx.createRadialGradient(0, 0, s * 0.9, 0, 0, s * (2.3 + pulse * 0.35));
      ag.addColorStop(0, 'rgba(255,210,74,0)');
      ag.addColorStop(0.55, 'rgba(255,210,74,' + (0.1 + pulse * 0.08) + ')');
      ag.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.arc(0, 0, s * (2.3 + pulse * 0.35), 0, Math.PI * 2);
      ctx.fill();
      // 金色电弧环：宽底描边代替 shadowBlur
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

    /* ---------- 脚下平台光 ---------- */
    const g = ctx.createRadialGradient(playerX, y + s * 1.35, 2, playerX, y + s * 1.35, s * 2);
    g.addColorStop(0, 'rgba(96,200,255,.22)');
    g.addColorStop(1, 'rgba(96,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(playerX, y + s * 1.35, s * 1.95, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    /* ---------- 双腿（脚掌钉在原地，随冲刺屈伸） ---------- */
    this.drawLegs(fc, s, y, lunge, dir);

    /* ---------- 上半身 ---------- */
    ctx.save();
    ctx.translate(playerX, y + bob + lunge);
    ctx.rotate(bodyRot);
    ctx.scale(1, 1 - 0.06 * swing);
    this.drawTorso(fc, s, swing);
    this.drawHead(fc, s);
    this.drawSwordArm(fc, s, armA, swing, dir, laneColor, windA);
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,60,90,' + flash * 0.42 + ')';
      roundRectPath(ctx, -s * 0.9, -s * 1.2, s * 2.1, s * 2.3, s * 0.4);
      ctx.fill();
    }
    ctx.restore();

    /* ---------- 生命环 ---------- */
    const frac = fc.hp / MAX_HP;
    ctx.save();
    ctx.translate(playerX, y);
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

  /** 双腿 —— `source.html:1768-1800`。 */
  private drawLegs(fc: FrameContext, s: number, y: number, lunge: number, dir: number): void {
    const ctx = fc.ctx;
    const { playerX } = fc.layout;
    const hipY = y + lunge * 0.5;
    const footY = y + s * 0.96;
    const kneeY = (hipY + footY) * 0.5;
    const spread = s * 0.26;
    const lean = (dir * s * 0.06 * Math.abs(lunge)) / (s * 0.26);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#17364d';
    ctx.lineWidth = s * 0.24;
    this.drawLeg(ctx, SIDE_L, playerX, spread, lean, hipY, kneeY, footY);
    this.drawLeg(ctx, SIDE_R, playerX, spread, lean, hipY, kneeY, footY);
    // 脚掌
    ctx.strokeStyle = 'rgba(120,238,255,.55)';
    ctx.lineWidth = s * 0.1;
    this.drawFoot(ctx, SIDE_L, playerX, s, spread, lean, footY);
    this.drawFoot(ctx, SIDE_R, playerX, s, spread, lean, footY);
    ctx.restore();
  }

  /** 一条腿 —— 旧 `source.html:1780-1786`。 */
  private drawLeg(
    ctx: CanvasRenderingContext2D,
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
    ctx.beginPath();
    ctx.moveTo(playerX + side * spread * 0.7, hipY);
    ctx.quadraticCurveTo(kneeX, kneeY, footX, footY);
    ctx.stroke();
  }

  /** 一只脚掌 —— 旧 `source.html:1792-1797`。 */
  private drawFoot(
    ctx: CanvasRenderingContext2D,
    side: number,
    playerX: number,
    s: number,
    spread: number,
    lean: number,
    footY: number,
  ): void {
    const front = side > 0;
    const footX = playerX + side * spread + (front ? lean : lean * 0.5);
    ctx.beginPath();
    ctx.moveTo(footX - s * 0.1, footY);
    ctx.lineTo(footX + s * 0.14, footY);
    ctx.stroke();
  }

  /** 躯干 —— `source.html:1802-1840`。 */
  private drawTorso(fc: FrameContext, s: number, swing: number): void {
    const ctx = fc.ctx;
    const bodyGrad = ctx.createLinearGradient(-s * 0.6, -s * 0.5, s * 0.6, s * 0.5);
    bodyGrad.addColorStop(0, '#2b5a7a');
    bodyGrad.addColorStop(0.5, '#16313f');
    bodyGrad.addColorStop(1, '#0d1e2b');
    ctx.fillStyle = bodyGrad;
    roundRectPath(ctx, -s * 0.62, -s * 0.52, s * 1.24, s * 0.95, s * 0.24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,210,255,.18)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(110,225,255,.75)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(120,230,255,.35)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, s * 0.16);
    ctx.lineTo(s * 0.3, s * 0.16);
    ctx.stroke();

    const core = clamp(0.45 + 0.35 * Math.sin(fc.vt * 3.4) + 0.3 * swing, 0, 1);
    ctx.fillStyle = 'rgba(95,225,255,' + core * 0.22 + ')';
    ctx.beginPath();
    ctx.arc(-s * 0.08, -s * 0.12, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(95,225,255,' + core + ')';
    ctx.beginPath();
    ctx.arc(-s * 0.08, -s * 0.12, s * 0.14, 0, Math.PI * 2);
    ctx.fill();

    // 双肩
    ctx.fillStyle = '#1d435c';
    ctx.strokeStyle = 'rgba(110,225,255,.6)';
    ctx.lineWidth = 1.8;
    roundRectPath(ctx, -s * 0.82, -s * 0.58, s * 0.34, s * 0.36, s * 0.1);
    ctx.fill();
    ctx.stroke();
    roundRectPath(ctx, s * 0.48, -s * 0.58, s * 0.34, s * 0.36, s * 0.1);
    ctx.fill();
    ctx.stroke();
  }

  /** 头部 —— `source.html:1842-1857`。 */
  private drawHead(fc: FrameContext, s: number): void {
    const ctx = fc.ctx;
    ctx.fillStyle = '#102232';
    ctx.strokeStyle = 'rgba(130,235,255,.8)';
    ctx.lineWidth = 2;
    roundRectPath(ctx, -s * 0.3, -s * 1.1, s * 0.62, s * 0.56, s * 0.16);
    ctx.fill();
    ctx.stroke();

    const eyeA = 0.75 + 0.25 * Math.sin(fc.vt * 4.2);
    ctx.fillStyle =
      (fc.hp / MAX_HP <= 0.3 ? 'rgba(255,77,109,' : 'rgba(120,240,255,') + eyeA + ')';
    ctx.globalAlpha = 0.3;
    roundRectPath(ctx, -s * 0.2, -s * 0.98, s * 0.48, s * 0.24, s * 0.09);
    ctx.fill();
    ctx.globalAlpha = 1;
    roundRectPath(ctx, -s * 0.16, -s * 0.94, s * 0.4, s * 0.16, s * 0.06);
    ctx.fill();
  }

  /** 持剑臂 —— `source.html:1859-1959`。 */
  private drawSwordArm(
    fc: FrameContext,
    s: number,
    armA: number,
    swing: number,
    dir: number,
    laneColor: string,
    windA: number,
  ): void {
    const ctx = fc.ctx;
    const sx = s * 0.38;
    const sy = -s * 0.2;

    ctx.save();
    ctx.translate(sx, sy);

    /* 挥击扇形：柔和光幕 + 亮边 */
    if (swing > 0.04) {
      const a0 = Math.min(windA, armA);
      const a1 = Math.max(windA, armA);
      if (a1 - a0 > 0.02) {
        const grad = ctx.createRadialGradient(0, 0, s * 0.5, 0, 0, s * 2.15);
        grad.addColorStop(0, hexA(laneColor, 0));
        grad.addColorStop(0.55, hexA(laneColor, 0.16 * swing));
        grad.addColorStop(1, hexA(laneColor, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, s * 2.15, a0, a1);
        ctx.closePath();
        ctx.fill();

        // 两道残刃
        for (let i = 0; i < 2; i++) {
          const ga = lerp(a0, a1, i === 0 ? BLADE_T0 : BLADE_T1);
          ctx.save();
          ctx.rotate(ga);
          ctx.globalAlpha = 0.22 * swing;
          ctx.strokeStyle = '#dffaff';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(s * 0.55, 0);
          ctx.lineTo(s * 1.55, 0);
          ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = 1;

        // 弧形亮边
        ctx.strokeStyle = hexA(laneColor, 0.55 * swing);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, s * 1.98, a0, a1);
        ctx.stroke();
      }
    }

    ctx.rotate(armA);

    // 上臂
    ctx.strokeStyle = '#1b3c52';
    ctx.lineWidth = s * 0.24;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s * 0.5, 0);
    ctx.stroke();

    // 护手
    ctx.fillStyle = '#2b6c8c';
    ctx.strokeStyle = 'rgba(120,235,255,.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(s * 0.54, 0, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 能量刃（前半段实、后半段渐隐）
    const bladeA = clamp(0.55 + 0.18 * Math.sin(fc.vt * 3) + 0.4 * swing, 0, 1);
    const bx = s * 0.58;
    const bx1 = s * (1.3 + 0.62 * swing);
    const bg = ctx.createLinearGradient(bx, 0, bx1, 0);
    bg.addColorStop(0, 'rgba(235,253,255,' + bladeA + ')');
    bg.addColorStop(0.55, 'rgba(150,238,255,' + bladeA * 0.75 + ')');
    bg.addColorStop(1, 'rgba(120,230,255,0)');
    ctx.strokeStyle = 'rgba(120,230,255,.18)';
    ctx.lineWidth = s * (0.3 + 0.12 * swing);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.lineTo(bx1, 0);
    ctx.stroke();
    ctx.strokeStyle = bg;
    ctx.lineWidth = s * (0.12 + 0.08 * swing);
    ctx.stroke();

    // 枪尖闪光
    if (swing > 0.55) {
      const f = clamp((swing - 0.55) / 0.45, 0, 1);
      ctx.globalAlpha = f;
      ctx.fillStyle = hexA(laneColor, 0.35);
      starPath(ctx, bx1 - s * 0.05, 0, s * (0.22 + 0.2 * f), s * (0.08 + 0.07 * f));
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      starPath(ctx, bx1 - s * 0.05, 0, s * (0.12 + 0.13 * f), s * (0.04 + 0.04 * f));
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    void dir;
  }
}
