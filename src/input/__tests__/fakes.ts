/**
 * 输入层单测用的最小假 DOM。
 *
 * 工程里没有装 jsdom / happy-dom（规则层是纯函数层，本来就不需要 DOM），
 * 而输入层只用到极小一部分 DOM 能力：
 *   - `addEventListener` / `removeEventListener`
 *   - `getBoundingClientRect`
 *   - `matchMedia` / `screen.orientation` / `document.hidden`
 *   - `Element.closest`
 *
 * 所以这里手写几个够用的假实现 —— 好处是测试不依赖任何浏览器环境，
 * 坏处是假实现与真实 DOM 的差异由本文件负责兜住（它只实现上面列出的能力）。
 */

/** 假的事件目标：记录监听器并支持手动派发。 */
export class FakeEventTarget {
  private readonly handlers = new Map<string, Set<(event: never) => void>>();

  addEventListener(type: string, listener: (event: never) => void): void {
    const set = this.handlers.get(type) ?? new Set<(event: never) => void>();
    set.add(listener);
    this.handlers.set(type, set);
  }

  removeEventListener(type: string, listener: (event: never) => void): void {
    this.handlers.get(type)?.delete(listener);
  }

  /** 派发一个事件给该类型的所有监听器。 */
  dispatch(type: string, event: unknown): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const listener of [...set]) {
      (listener as (e: unknown) => void)(event);
    }
  }

  /** 该类型上挂了多少监听器。 */
  listenerCount(type: string): number {
    return this.handlers.get(type)?.size ?? 0;
  }
}

/** 假的事件对象（够 `pointer.ts` / `keyboard.ts` 用）。 */
export interface FakeEvent {
  clientY?: number;
  pointerId?: number;
  code?: string;
  repeat?: boolean;
  target?: unknown;
  preventDefault?: () => void;
  defaultPrevented?: boolean;
}

/** 造一个假事件。 */
export function makeEvent(props: FakeEvent): FakeEvent {
  return {
    defaultPrevented: false,
    preventDefault(): void {
      this.defaultPrevented = true;
    },
    ...props,
  };
}

/** 假的元素：支持 `closest` 与 `getBoundingClientRect`。 */
export class FakeElement extends FakeEventTarget {
  /** `closest` 的返回值（模拟「命中了排除目标」）。 */
  closestResult: unknown = null;

  readonly rect: { top: number; height: number; left: number; width: number };

  constructor(rect: { top: number; height: number; left?: number; width?: number } = {
    top: 0,
    height: 400,
  }) {
    super();
    this.rect = {
      top: rect.top,
      height: rect.height,
      left: rect.left ?? 0,
      width: rect.width ?? 800,
    };
  }

  closest(selector: string): unknown {
    void selector;
    return this.closestResult;
  }

  getBoundingClientRect(): { top: number; height: number; left: number; width: number } {
    return this.rect;
  }
}

/** 假的对象（用于 `closest` 命中时的返回值）。 */
export const SOME_ELEMENT = { tagName: 'BUTTON' };

/** 假的媒体查询列表。 */
export class FakeMediaQueryList {
  matches: boolean;

  private readonly target = new FakeEventTarget();

  constructor(matches: boolean) {
    this.matches = matches;
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    this.target.addEventListener(type, listener);
  }

  removeEventListener(type: string, listener: (event: never) => void): void {
    this.target.removeEventListener(type, listener);
  }

  /** 模拟媒体查询结果变化。 */
  setMatches(matches: boolean): void {
    this.matches = matches;
    this.target.dispatch('change', { matches });
  }
}

/** 假的 window。 */
export class FakeWindow extends FakeEventTarget {
  innerWidth: number;
  innerHeight: number;
  orientationType: string;
  hidden: boolean;
  media: FakeMediaQueryList;

  readonly documentTarget = new FakeEventTarget();

  constructor(options: {
    innerWidth?: number;
    innerHeight?: number;
    matches?: boolean;
    orientationType?: string;
  } = {}) {
    super();
    this.innerWidth = options.innerWidth ?? 800;
    this.innerHeight = options.innerHeight ?? 400;
    this.orientationType = options.orientationType ?? '';
    this.hidden = false;
    this.media = new FakeMediaQueryList(options.matches ?? false);
  }

  /** 最近一次 `matchMedia` 的查询串（断言用）。 */
  lastQuery = '';

  matchMedia(query: string): FakeMediaQueryList {
    this.lastQuery = query;
    return this.media;
  }

  get screen(): { orientation: { type: string } } {
    return { orientation: { type: this.orientationType } };
  }

  get document(): { hidden: boolean; addEventListener: unknown; removeEventListener: unknown } {
    return {
      hidden: this.hidden,
      addEventListener: (type: string, listener: (event: never) => void) =>
        this.documentTarget.addEventListener(type, listener),
      removeEventListener: (type: string, listener: (event: never) => void) =>
        this.documentTarget.removeEventListener(type, listener),
    };
  }
}
