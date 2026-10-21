/**
 * Canvas 2D 渲染器 —— `BattlefieldRenderer` 接口的实现。
 *
 * 逐字搬自旧实现的 `draw()`（`source.html:1455-1478`）与 `resize()`（`534-577`）。
 *
 * **职责边界（票 04 的关键约束）**：
 *
 * - 渲染层**只读**规则层算好的几何（`Layout`），**不重算**任何坐标 ——
 *   旧实现的 `hitX` 顺序 bug（`source.html:555` 用到 `560` 才算出的 `playerX`）
 *   已由规则层的 `computeLayout` 修好，渲染层不重复这个坑。
 * - 渲染层**不做**「旋转/尺寸变化后让在场怪物重新贴合轨道」
 *   （旧 `source.html:562-574`）—— 那是规则层的 `refitMonsters` 的职责。
 * - `resize(layout)` 只做三件事：更新画布尺寸 / DPR / 重建静态图层。
 *
 * **绘制顺序**逐字照抄 `source.html:1466-1477`：
 * 背景 → 轨道 → 判定区 → 防线 → 角色 → 锁链 → 怪物 → 刀光 → 环 → 粒子 → 飘字 → FEVER 洗色。
 * 锁链在怪物**之下**、刀光在怪物**之上**、FEVER 洗色最顶。
 */

import type { Layout, Monster } from '../../game/types';
import type { BattlefieldRenderer, FrameView } from '../types';
import { BackgroundView } from './background';
import { FrameContext } from './context';
import { DefenseLineView } from './defense-line';
import { FloaterView } from './floater';
import { FrenzyView } from './frenzy';
import { GroundView } from './ground';
import { HitZoneView } from './hit-zone';
import { HoldMonsterView } from './hold-monster';
import { rand } from './math';
import { MonsterView } from './monster';
import { ParticleView } from './particle';
import { PlayerView } from './player';
import { RailsView } from './rails';
import { RingView } from './ring';
import { SlashView } from './slash';
import { TwinView } from './twin';

/** DPR 上限（移动端 3x 屏只按 2x 渲染）—— 旧 `source.html:540`。 */
const MAX_DPR = 2;

export class Canvas2dRenderer implements BattlefieldRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private layout: Layout | null = null;
  private dpr = 1;

  /** 每帧复用的上下文（零分配）。 */
  private readonly fc = new FrameContext();
  /** 怪物 id → 怪物（复用的 Map，每帧 clear + 重建）。 */
  private readonly monsterIndex = new Map<number, Monster>();

  private readonly background = new BackgroundView();
  private readonly ground = new GroundView();
  private readonly rails = new RailsView();
  private readonly defenseLine = new DefenseLineView();
  private readonly hitZone = new HitZoneView();
  private readonly player = new PlayerView();
  private readonly twin = new TwinView();
  private readonly monster = new MonsterView();
  private readonly holdMonster = new HoldMonsterView();
  private readonly slash = new SlashView();
  private readonly ring = new RingView();
  private readonly particle = new ParticleView();
  private readonly floater = new FloaterView();
  private readonly frenzy = new FrenzyView();

  mount(host: HTMLElement): void {
    this.unmount();
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 上下文不可用');
    host.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = ctx;
  }

  unmount(): void {
    const canvas = this.canvas;
    if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
    this.canvas = null;
    this.ctx = null;
  }

  resize(layout: Layout): void {
    this.layout = layout;
    this.dpr = Math.min(layout.dpr || 1, MAX_DPR);
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.width = Math.round(layout.width * this.dpr);
    canvas.height = Math.round(layout.height * this.dpr);
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.rebuildStaticLayers(layout);
  }

  render(frame: FrameView): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const layout = frame.layout ?? this.layout;
    if (!layout) return;
    // 旧 `draw()` 开头：`if (!W || !H) return;`
    if (!layout.width || !layout.height) return;

    this.ensureCanvas(layout);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);

    // 抖动（旧 `source.html:1462-1464`：两次独立取随机）
    if (frame.shake > 0.2) {
      ctx.translate(
        this.jitter(frame.shake),
        this.jitter(frame.shake),
      );
    }

    this.fillFrameContext(ctx, frame, layout);
    this.collectMonsters(frame);

    // 绘制顺序逐字照抄 `source.html:1466-1477`
    this.background.draw(this.fc);
    this.ground.draw(this.fc);
    this.rails.draw(this.fc);
    this.hitZone.draw(this.fc);
    this.defenseLine.draw(this.fc);
    this.player.draw(this.fc);
    this.twin.draw(this.fc);
    this.drawMonsters();
    this.slash.draw(this.fc);
    this.ring.draw(this.fc);
    this.particle.draw(this.fc);
    this.floater.draw(this.fc);
    this.frenzy.draw(this.fc);
  }

  /** 抖动位移 —— 旧 `source.html:1463`：`rand(-shake,shake)*0.5`，两次独立取随机。 */
  private jitter(shake: number): number {
    return rand(-shake, shake) * 0.5;
  }

  private fillFrameContext(
    ctx: CanvasRenderingContext2D,
    frame: FrameView,
    layout: Layout,
  ): void {
    const fc = this.fc;
    fc.ctx = ctx;
    fc.layout = layout;
    fc.vt = frame.visualTime;
    fc.phase = frame.phase;
    fc.now = frame.now;
    fc.scrollSpeed = frame.scrollSpeed;
    fc.frenzyActive = frame.frenzyActive;
    fc.hp = frame.hp;
    fc.playerFlash = frame.playerFlash;
    fc.attackT = frame.attackT;
    fc.attackLane = frame.attackLane;
    fc.playerLane = frame.playerLane;
    fc.playerAirT = frame.playerAirT;
    fc.pairSmash = frame.pairSmash;
    fc.monsters = frame.monsters;
    fc.effects = frame.effects;
  }

  /**
   * 每帧一次的怪物预扫。
   *
   * 这一趟扫描同时解决了两个结构性热点：
   *
   * - **每轨的 `some` 扫描**（旧 `source.html:1633`，两轨各一次全量扫描）
   *   → 改成一次遍历同时算出两轨的「有长按怪」标志。
   * - **O(n²) 的 `monsters.indexOf(p)`**（旧 `source.html:1989`）
   *   → 用 id → 怪物的 Map 查表；「每组只画一次」改成 O(1) 的
   *   「链主 = 上轨那只」判定（等价性推导见 `draw-port-map-b.md` §5.1）。
   *
   * 整个过程**零分配**：`Map` 复用，锁链对象复用。
   */
  private collectMonsters(frame: FrameView): void {
    const fc = this.fc;
    const monsters = frame.monsters;

    fc.longInLane.top = false;
    fc.longInLane.bottom = false;
    fc.holdMonster = null;
    fc.twinLinkCount = 0;

    this.monsterIndex.clear();
    for (const m of monsters) this.monsterIndex.set(m.id, m);

    for (const m of monsters) {
      if (m.kind === 'hold' && !m.removed) {
        fc.longInLane[m.lane] = true;
        // 正在被按住的那只（同一时刻最多一只）驱动角色的悬浮连击动画
        if (m.anchored && !m.escaped) fc.holdMonster = m;
      }
    }

    for (const m of monsters) {
      if (m.kind !== 'twin' || m.removed) continue;
      const pid = m.partnerId;
      if (pid === null) continue;
      const p = this.monsterIndex.get(pid);
      if (!p || p.removed || p.kind !== 'twin') continue;
      // 链主 = 上轨那只（旧代码 `indexOf(p) < i` 的等价判定）
      if (m.lane !== 'top') continue;
      const index = fc.twinLinkCount;
      let link = fc.twinLinks[index];
      if (!link) {
        link = { a: m, b: p };
        fc.twinLinks[index] = link;
      } else {
        link.a = m;
        link.b = p;
      }
      fc.twinLinkCount++;
    }
  }

  /**
   * 画怪物 —— 保持旧代码的**数组顺序**（后生成的怪叠在上面）。
   *
   * 旧 `drawMonsters()`（`source.html:2052-2057`）在**同一个循环**里按 `m.long`
   * 分派；这里保持同样的单循环分派，不能拆成「先画普通怪再画长按怪」——
   * 那会改变 z 序。
   */
  private drawMonsters(): void {
    for (const m of this.fc.monsters) {
      // 新模型统一用 `removed`（旧代码靠「死怪已被移出数组」隐式实现）
      if (m.removed) continue;
      if (m.kind === 'hold') this.holdMonster.draw(this.fc, m);
      else this.monster.draw(this.fc, m);
    }
  }

  /** 画布尺寸没跟上时补一次（`mount` 之后直接 `render` 的情况）。 */
  private ensureCanvas(layout: Layout): void {
    const canvas = this.canvas;
    if (!canvas) return;
    this.dpr = Math.min(layout.dpr || 1, MAX_DPR);
    const w = Math.round(layout.width * this.dpr);
    const h = Math.round(layout.height * this.dpr);
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.rebuildStaticLayers(layout);
  }

  private rebuildStaticLayers(layout: Layout): void {
    this.background.resize(layout);
    this.ground.resize(layout);
    this.rails.resize(layout);
    this.defenseLine.resize();
  }
}
