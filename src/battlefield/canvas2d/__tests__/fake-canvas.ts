/**
 * 测试用的假 Canvas 2D 上下文。
 *
 * Vitest 跑在 node 环境（没有 DOM），所以渲染层单测不能真的开画布。
 * 这里用一个**记录型**的假上下文代替：它实现渲染层用到的全部 2D API，
 * 并统计每种操作的调用次数 —— 测试据此断言「这一帧真的画了东西」。
 *
 * 真实像素的验证另有一路：Playwright + 真浏览器（见 `scripts/` 的一次性脚本）。
 */

/** 假渐变对象。 */
export class FakeGradient {
  readonly stops: [number, string][] = [];
  addColorStop(offset: number, color: string): void {
    this.stops.push([offset, color]);
  }
}

/** 假画布元素。 */
export class FakeCanvas {
  width = 300;
  height = 150;
  readonly style: Record<string, string> = {};
  parentNode: FakeHost | null = null;
  readonly ctx = new FakeCtx();

  getContext(kind: string): CanvasRenderingContext2D | null {
    return kind === '2d' ? (this.ctx as unknown as CanvasRenderingContext2D) : null;
  }
}

/** 假宿主元素。 */
export class FakeHost {
  readonly children: FakeCanvas[] = [];

  appendChild(child: FakeCanvas): void {
    child.parentNode = this;
    this.children.push(child);
  }

  removeChild(child: FakeCanvas): void {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
  }
}

/** 记录型 2D 上下文。 */
export class FakeCtx {
  // ── 状态属性 ──
  globalAlpha = 1;
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  miterLimit = 10;
  font = '';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  lineDashOffset = 0;
  filter = 'none';

  /** 每种操作的调用次数。 */
  readonly ops = new Map<string, number>();
  /** 调用序列（顺序断言用）。 */
  readonly log: string[] = [];

  private hit(op: string): void {
    this.ops.set(op, (this.ops.get(op) ?? 0) + 1);
    this.log.push(op);
  }

  /** 取某个操作的调用次数。 */
  count(op: string): number {
    return this.ops.get(op) ?? 0;
  }

  // ── 变换 ──
  save(): void {
    this.hit('save');
  }
  restore(): void {
    this.hit('restore');
  }
  setTransform(): void {
    this.hit('setTransform');
  }
  translate(): void {
    this.hit('translate');
  }
  rotate(): void {
    this.hit('rotate');
  }
  scale(): void {
    this.hit('scale');
  }

  // ── 路径 ──
  beginPath(): void {
    this.hit('beginPath');
  }
  closePath(): void {
    this.hit('closePath');
  }
  moveTo(): void {
    this.hit('moveTo');
  }
  lineTo(): void {
    this.hit('lineTo');
  }
  arc(): void {
    this.hit('arc');
  }
  arcTo(): void {
    this.hit('arcTo');
  }
  ellipse(): void {
    this.hit('ellipse');
  }
  quadraticCurveTo(): void {
    this.hit('quadraticCurveTo');
  }

  // ── 绘制 ──
  fill(): void {
    this.hit('fill');
  }
  stroke(): void {
    this.hit('stroke');
  }
  fillRect(): void {
    this.hit('fillRect');
  }
  strokeRect(): void {
    this.hit('strokeRect');
  }
  fillText(): void {
    this.hit('fillText');
  }
  strokeText(): void {
    this.hit('strokeText');
  }
  drawImage(): void {
    this.hit('drawImage');
  }
  setLineDash(): void {
    this.hit('setLineDash');
  }
  clearRect(): void {
    this.hit('clearRect');
  }

  measureText(text: string): { width: number } {
    this.hit('measureText');
    return { width: text.length * 7 };
  }

  createLinearGradient(): FakeGradient {
    this.hit('createLinearGradient');
    return new FakeGradient();
  }
  createRadialGradient(): FakeGradient {
    this.hit('createRadialGradient');
    return new FakeGradient();
  }
}
