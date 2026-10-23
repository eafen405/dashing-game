/**
 * PixiJS v8 战场渲染器 —— `BattlefieldRenderer` 接口的当前唯一实现。
 *
 * 规则层只读、表现层只读、渲染层不重算任何几何。
 *
 * ## 场景结构
 *
 * ```
 * app.stage                      ← 挂「全屏」滤镜（色散 / 冲击波）
 * └── root（根容器 —— 屏幕抖动的承载者，每帧只改 root.position）
 *     ├── background  星空 + 中线
 *     ├── rails       轨道底光带 / 主线 / 流动刻度
 *     ├── defense     角色身前的防线
 *     ├── entities    判定区 → 角色 → 锁链 → 怪物
 *     ├── glow        判定区光 → FEVER 光环 → 平台光 → FEVER 氛围 → 刀光 → 环 → 粒子
 *     │                 ↑ **bloom 挂在这一层**（票 07）
 *     └── floaters    飘分文字
 * ```
 *
 * 图层顺序由 `layers.ts` 的 `LAYER_ORDER` 驱动（自底向上）。
 *
 * ## 硬约束（ADR-0004 · 性能靠构造，不靠基准）
 *
 * - **复用 `Graphics` 实例**：每个 view 持有一个 `Graphics`，每帧 `clear()` 后重建路径。
 *   **不得每帧 `new Graphics()`**。
 * - **静态图层只在 resize 时重建**（星空数据、轨道渐变、防线渐变）。
 * - **每帧零分配**：样式对象、路径对象、容器、文本、粒子全部**复用**。
 * - **滤镜不得每帧重建实例**：三个滤镜在 `mount()` 里造一次，
 *   每帧只改参数（`enabled` / 分量偏移 / `time` / `center`）。
 *
 * **DOM 依赖延迟到 `mount()`**：view 的构造函数只碰 Pixi 对象（`Graphics` / `Container`），
 * 不碰 `document` —— 这样 `createPixiRenderer()` 在 Node 环境（测试）里也能安全调用。
 */

import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import type { Layout, Monster } from '../../game/types';
import type { BattlefieldRenderer, FrameView } from '../types';
import { BackgroundView } from './background';
import { FrameContext } from './context';
import { DefenseLineView } from './defense-line';
import { ScreenFilterController } from './filters';
import { FloaterView } from './floater';
import { FrenzyView } from './frenzy';
import { GroundView } from './ground';
import { HitZoneView } from './hit-zone';
import { HoldMonsterView } from './hold-monster';
import { LAYER_ORDER } from './layers';
import type { LayerName } from './layers';
import { rand } from './math';
import { MonsterView } from './monster';
import { ParticleView } from './particle';
import { PlayerView } from './player';
import { RailsView } from './rails';
import { RingView } from './ring';
import { SlashView } from './slash';
import { TwinView } from './twin';

/** 图层容器表。 */
type LayerMap = { [K in LayerName]: Container };

/** 屏幕抖动阈值（旧 `source.html:1462`：`shake > 0.2` 才抖）。 */
const SHAKE_THRESHOLD = 0.2;

/**
 * 开发期开关：`?nobloom` 关掉 bloom —— 票 07 的 e2e A/B 对照用
 * （「挂 bloom 前后，同一场景的亮度 / 非透明像素占比」）。
 *
 * **只在带这个查询串时生效** —— 正常游戏永远带 bloom。
 */
const NO_BLOOM =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nobloom');

export class PixiRenderer implements BattlefieldRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private layers: LayerMap | null = null;
  private layout: Layout | null = null;

  /**
   * 全屏滤镜控制器 —— **`mount()` 里造一次，之后只改参数**。
   *
   * 滤镜实例重建 = 整条滤镜管线重建 = 每帧一次 GPU 资源申请 —— 硬约束禁止。
   */
  private filters: ScreenFilterController | null = null;

  /** 已应用的画布尺寸（CSS 像素）—— 与 `layout.width/height` 比对，避免重复 resize。 */
  private appliedWidth = 0;
  private appliedHeight = 0;

  /** 每帧复用的上下文（零分配）。 */
  private readonly fc = new FrameContext();
  /** 怪物 id → 怪物（复用的 Map，每帧 clear + 重建）。 */
  private readonly monsterIndex = new Map<number, Monster>();

  /**
   * 怪物层：**普通怪与长按怪共用一个 `Graphics`**，
   * 才能保持旧代码的交错 z 序（旧 `drawMonsters` 在同一个循环里按 `m.long` 分派，
   * 拆成两个容器会改变 z 序）。
   */
  private readonly monsterGfx = new Graphics();

  // ── 12 个 view（每个持有自己的 Graphics / 容器） ──────────────
  private readonly background = new BackgroundView();
  private readonly ground = new GroundView();
  private readonly rails = new RailsView();
  private readonly defenseLine = new DefenseLineView();
  private readonly hitZone = new HitZoneView();
  private readonly player = new PlayerView();
  private readonly twin = new TwinView();
  private readonly monster = new MonsterView(this.monsterGfx);
  private readonly holdMonster = new HoldMonsterView(this.monsterGfx);
  private readonly slash = new SlashView();
  private readonly ring = new RingView();
  private readonly particle = new ParticleView();
  private readonly floater = new FloaterView();
  private readonly frenzy = new FrenzyView();

  // ── 生命周期 ──────────────────────────────────────────────

  async mount(host: HTMLElement): Promise<void> {
    this.unmount();

    const app = new Application();
    await app.init({
      // **必须显式锁 webgl**：Pixi v8 默认尝试 WebGPU，而 WebGPU 在 `file://`
      // （非安全上下文）下会黑屏。Phase 0 已实测 `preference: 'webgl'` 在 `file://` 下正常。
      preference: 'webgl',
      // 帧循环由 `GameSession` 统一驱动（`renderer.render()`）——关掉 Pixi 自带的
      // ticker，否则同一帧会被重复渲染一次；更重要的是，独立 ticker 可能在
      // `resize()` 重建渐变之后、下一帧 `draw()` 之前抢先渲染，读到已销毁的纹理。
      autoStart: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      // 旧版画布是**透明**的 —— 背景氛围由 DOM 的 `#tint` / `#vignette` 提供
      // （`source.html:127-128`）。不要给一层不透明底色。
      backgroundAlpha: 0,
      antialias: true,
      width: 1,
      height: 1,
    });

    const canvas = app.canvas;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    host.appendChild(canvas);

    const root = new Container();
    root.label = 'battlefield-root';
    app.stage.addChild(root);

    // 图层容器（顺序由 `LAYER_ORDER` 决定 —— 自底向上）。
    const layers = {
      background: new Container(),
      ground: new Container(),
      rails: new Container(),
      defense: new Container(),
      entities: new Container(),
      glow: new Container(),
      floaters: new Container(),
    } satisfies LayerMap;
    for (const name of LAYER_ORDER) {
      layers[name].label = name;
      root.addChild(layers[name]);
    }

    layers.background.addChild(this.background.container);
    layers.ground.addChild(this.ground.container);
    layers.rails.addChild(this.rails.container);
    layers.defense.addChild(this.defenseLine.container);
    // `entities` 内部复现旧代码的遮挡关系：
    // 判定区 → 角色 → 锁链 → 怪物
    layers.entities.addChild(this.hitZone.container);
    layers.entities.addChild(this.player.container);
    layers.entities.addChild(this.twin.container);
    layers.entities.addChild(this.monsterGfx);

    // `glow` 层：**所有「该发光的东西」**（票 07 —— bloom 挂在这一层）。
    //
    // 刀光 / 冲击环 / 粒子在旧版里本来就在怪物**之上**（`source.html:1466-1477`），
    // 挪到 `glow` 层不改变遮挡关系；判定区光晕 / FEVER 光环 / 平台光
    // 是半透明辉光，没有遮挡语义。
    layers.glow.addChild(this.hitZone.haloGfx);
    layers.glow.addChild(this.player.haloGfx);
    layers.glow.addChild(this.player.platformGfx);
    layers.glow.addChild(this.slash.container);
    layers.glow.addChild(this.ring.container);
    layers.glow.addChild(this.particle.container);
    // FEVER 能量带压在最上面（旧版 `drawFrenzyOverlay` 就是最后画）。
    layers.glow.addChild(this.frenzy.container);

    // 全场洗色不进 `glow` 层 —— 它铺满屏幕，过 bloom 会变成一片黄雾（票 09）。
    // `floaters` 层没有 bloom，洗色叠在辉光之上、飘分文字之下。
    layers.floaters.addChild(this.frenzy.washContainer);
    layers.floaters.addChild(this.floater.container);

    // ── 滤镜（票 07）────────────────────────────────────────
    //
    // **实例只造一次**（`ScreenFilterController`），之后只改参数。
    const filters = new ScreenFilterController();
    this.filters = filters;

    // bloom **只挂 `glow` 层** —— 别处挂了就会把不该发光的东西也提亮。
    // （`?nobloom` 是开发期 A/B 对照用的开关，正常游戏永远带 bloom。）
    if (!NO_BLOOM) layers.glow.filters = [filters.bloom];

    // 色散 / 冲击波作用于**整个画面** → 挂 `stage`（不是 glow 层）。
    // 两个滤镜默认 `enabled = false`，FEVER / 暴击时才开。
    // `stage.filterArea` 在 `rebuildStaticLayers` 里随尺寸更新。
    app.stage.filters = [filters.rgbSplit, filters.shockwave];

    // 视图的 DOM 依赖（文本、粒子纹理）在这里才创建 —— 构造函数保持无 DOM。
    this.background.prepare();
    this.ground.prepare();
    this.rails.prepare();
    this.defenseLine.prepare();
    this.hitZone.prepare();
    this.player.prepare();
    this.twin.prepare();
    this.monster.prepare();
    this.holdMonster.prepare();
    this.slash.prepare();
    this.ring.prepare();
    this.particle.prepare();
    this.floater.prepare();
    this.frenzy.prepare();

    this.app = app;
    this.root = root;
    this.layers = layers;
    // 首帧尺寸：宿主还没量过时用 0，等 `resize()` / 首帧 `render()` 修正。
    this.appliedWidth = 0;
    this.appliedHeight = 0;
  }

  unmount(): void {
    const app = this.app;
    if (!app) return;
    this.app = null;
    this.root = null;
    this.layers = null;
    this.layout = null;
    this.appliedWidth = 0;
    this.appliedHeight = 0;

    // 滤镜实例在 `mount()` 里造 —— 这里**显式销毁**
    // （`app.destroy` 只销毁场景图，不会销毁挂在容器上的滤镜资源）。
    const filters = this.filters;
    this.filters = null;
    if (filters) filters.destroy();

    // 先彻底销毁 Pixi 应用（含 WebGL 上下文）——
    // 场景图里的 `Graphics` / `Text` / `ParticleContainer` 都在 `stage` 下面，
    // 跟着一起销毁。
    app.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true, texture: true, textureSource: true, context: true },
    );

    // 再释放各 view **自己持有**、不在渲染器纹理池里的资源
    // （`FillGradient` 的渐变纹理是独立创建的，`app.destroy` 不会代劳）。
    this.background.destroy();
    this.ground.destroy();
    this.rails.destroy();
    this.defenseLine.destroy();
    this.hitZone.destroy();
    this.player.destroy();
    this.twin.destroy();
    this.monster.destroy();
    this.holdMonster.destroy();
    this.slash.destroy();
    this.ring.destroy();
    this.particle.destroy();
    this.floater.destroy();
    this.frenzy.destroy();
  }

  resize(layout: Layout): void {
    this.layout = layout;
    this.applySize(layout);
  }

  render(frame: FrameView): void {
    const root = this.root;
    if (!root) return;
    const layout = frame.layout ?? this.layout;
    if (!layout) return;
    // 旧 `draw()` 开头：`if (!W || !H) return;`
    if (!layout.width || !layout.height) return;

    // 画布尺寸没跟上时补一次（`mount` 之后直接 `render` 的情况）。
    this.applySize(layout);

    this.fillFrameContext(frame, layout);
    this.collectMonsters(frame);

    // 屏幕抖动（旧 `source.html:1462-1464`：两次独立取随机）。
    // 旧代码是 `ctx.translate` 施加在**全部**绘制内容上 —— Pixi 版用根容器承载。
    if (frame.shake > SHAKE_THRESHOLD) {
      root.position.set(this.jitter(frame.shake), this.jitter(frame.shake));
    } else {
      root.position.set(0, 0);
    }

    this.background.draw(this.fc);
    this.ground.draw(this.fc);
    this.rails.draw(this.fc);
    this.defenseLine.draw(this.fc);
    this.hitZone.draw(this.fc);
    this.player.draw(this.fc);
    this.twin.draw(this.fc);
    this.drawMonsters();
    this.slash.draw(this.fc);
    this.ring.draw(this.fc);
    this.particle.draw(this.fc);
    this.floater.draw(this.fc);
    this.frenzy.draw(this.fc);

    // 全屏滤镜参数（实例不重建，只改参数）。
    this.applyScreenFx(frame);

    // **显式出帧**：Pixi 的 ticker 已关（`autoStart: false`），
    // 场景图更新完必须自己调用一次 renderer，否则画面永远停在上一帧。
    this.app?.renderer.render(this.app.stage);
  }

  /** 把表现层的 `ScreenFx` 映射到滤镜参数上（实例不重建，只改参数）。 */
  private applyScreenFx(frame: FrameView): void {
    this.filters?.apply(frame.screenFx, frame.visualTime);
  }

  // ── 内部 ──────────────────────────────────────────────────

  /** 抖动位移 —— 旧 `source.html:1463`：`rand(-shake,shake)*0.5`，两次独立取随机。 */
  private jitter(shake: number): number {
    return rand(-shake, shake) * 0.5;
  }

  /** 画布尺寸 / DPR 变化时更新尺寸 + 重建静态图层。 */
  private applySize(layout: Layout): void {
    const app = this.app;
    if (!app) return;
    if (layout.width === this.appliedWidth && layout.height === this.appliedHeight) return;
    this.appliedWidth = layout.width;
    this.appliedHeight = layout.height;
    // `renderer.resize(w, h)` 的 `w` / `h` 是 **CSS 像素**（与 `computeLayout` 同一坐标系）。
    app.renderer.resize(layout.width, layout.height);
    const canvas = app.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.rebuildStaticLayers(layout);
  }

  /** 静态图层只在尺寸变化时重建（星空、地面、轨道、防线）。 */
  private rebuildStaticLayers(layout: Layout): void {
    this.background.resize(layout);
    this.ground.resize(layout);
    this.rails.resize(layout);
    this.defenseLine.resize();
    // 票 07：`glow` 层挂 bloom —— 滤镜区域必须显式给出，
    // 否则 Pixi 会用图层的自动包围盒（`ParticleContainer` 恒为空）。
    const layers = this.layers;
    const app = this.app;
    if (layers) {
      layers.glow.filterArea = new Rectangle(0, 0, layout.width, layout.height);
      layers.entities.filterArea = new Rectangle(0, 0, layout.width, layout.height);
    }
    if (app) {
      // 全屏滤镜（色散 / 冲击波）的区域 = 整个画面。
      app.stage.filterArea = new Rectangle(0, 0, layout.width, layout.height);
    }
    // `ParticleContainer` 的 `bounds` 恒为空 —— 必须手动给 `boundsArea`，
    // 否则将来挂在它上面的滤镜会因为空包围盒被静默跳过。
    this.particle.resize(layout.width, layout.height);
  }

  private fillFrameContext(frame: FrameView, layout: Layout): void {
    const fc = this.fc;
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
   * 每帧一次的怪物预扫（零分配）。
   *
   * - 每轨的 `some` 扫描 → 一次遍历同时算出两轨的「有长按怪」标志。
   * - O(n²) 的 `monsters.indexOf(p)` → id → 怪物的 Map 查表。
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
   * 普通怪与长按怪**共用一个 `Graphics`**，所以绘制顺序与旧代码完全一致。
   */
  private drawMonsters(): void {
    const gfx = this.monsterGfx;
    gfx.clear();
    for (const m of this.fc.monsters) {
      if (m.removed) continue;
      if (m.kind === 'hold') this.holdMonster.draw(this.fc, m);
      else this.monster.draw(this.fc, m);
    }
  }
}
