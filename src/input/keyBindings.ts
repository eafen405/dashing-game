/**
 * 电脑端按键绑定 —— **纯数据 + 纯函数**。
 *
 * 上下轨各允许绑定 **最多 3 个** 物理键（`KeyboardEvent.code`）。
 * 默认值就是旧版写死的操作：
 *
 *   上轨：↑ / W
 *   下轨：↓ / S
 *
 * **为什么不用 `key` 而用 `code`**：`code` 是物理位置（`KeyW` / `ArrowUp`），
 * 不受输入法、大小写、Shift 影响；`key` 会随输入法和 Shift 变化，绑不住。
 *
 * 存储键是 `dualrail_keys`；读写失败一律回退默认值，不让坏数据卡住开始界面。
 */

import type { Lane } from '../game/types';

/** 每条轨最多能绑几个键。 */
export const MAX_KEYS_PER_LANE = 3;

/** `localStorage` 的键名。 */
export const KEY_BINDINGS_STORAGE_KEY = 'dualrail_keys';

/** 上下轨各自的按键列表（`KeyboardEvent.code`）。 */
export type KeyBindings = Record<Lane, string[]>;

/** 默认绑定 —— 与旧版写死的 ↑/W、↓/S 一致。 */
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  top: ['ArrowUp', 'KeyW'],
  bottom: ['ArrowDown', 'KeyS'],
};

/** 默认绑定的一份新拷贝（界面里的「恢复默认」用，避免共享数组被改）。 */
export function defaultKeyBindings(): KeyBindings {
  return {
    top: [...DEFAULT_KEY_BINDINGS.top],
    bottom: [...DEFAULT_KEY_BINDINGS.bottom],
  };
}

/**
 * 游戏自己占用的键 —— 不允许绑到轨道上。
 *
 * `P` 暂停、`Enter` / `Space` 开始或重开、`Esc` / `Backspace` 菜单返回、
 * `Tab` 留给键盘导航。绑上去会和这些动作打架。
 */
export const RESERVED_KEY_CODES: ReadonlySet<string> = new Set([
  'KeyP',
  'Enter',
  'Space',
  'Escape',
  'Backspace',
  'Tab',
]);

/** 没有绑定意义、或按住会影响所有按键的「键」。 */
const IGNORED_KEY_CODES: ReadonlySet<string> = new Set([
  'Unidentified',
  'CapsLock',
  'Fn',
  'FnLock',
  'NumLock',
  'ScrollLock',
]);

/** 修饰键单独按没有「出刀」语义，也容易误触。 */
const MODIFIER_CODES: ReadonlySet<string> = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
]);

/** 空轨兜底用的候选键（正常 UI 不会走到，只有脏存储会）。 */
const FALLBACK_CODES = ['KeyQ', 'KeyZ', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'];

/** 这个键能不能绑到轨道上。 */
export function isBindableKeyCode(code: string): boolean {
  if (!code) return false;
  if (RESERVED_KEY_CODES.has(code)) return false;
  if (IGNORED_KEY_CODES.has(code)) return false;
  if (MODIFIER_CODES.has(code)) return false;
  return true;
}

/** 按 `code` 找轨道 —— 找不到就是 `null`（不吞掉其它键）。 */
export function laneForKeyCode(code: string, bindings: KeyBindings): Lane | null {
  if (bindings.top.includes(code)) return 'top';
  if (bindings.bottom.includes(code)) return 'bottom';
  return null;
}

/** 人类可读的键名（界面展示用）。 */
const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
};

/** 把 `KeyboardEvent.code` 转成短标签。 */
export function keyLabel(code: string): string {
  const named = KEY_LABELS[code];
  if (named) return named;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `小键盘 ${code.slice(6)}`;
  return code;
}

/** 一条轨的候选键（保持顺序、去重、过滤保留键、最多 3 个）。 */
function sanitizeLane(value: unknown, used: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    if (!isBindableKeyCode(item) || used.has(item)) continue;
    used.add(item);
    out.push(item);
    if (out.length === MAX_KEYS_PER_LANE) break;
  }
  return out;
}

/**
 * 把任意输入收拾成合法绑定。
 *
 * 规则：每条轨 1–3 个、上下轨不重复、过滤保留键。
 * 脏数据里某条轨为空时，用默认键（或其它还没被占用的键）补一个 ——
 * 否则玩家会进入一个「按什么都没反应」的对局。
 */
export function sanitizeKeyBindings(value: unknown): KeyBindings {
  const source =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  // 完全没存过（或整个值坏了）→ 用完整默认值；
  // 只有「其中一条轨还在」时才按脏数据处理，避免把默认的第二、三个键吞掉。
  if (!Array.isArray(source.top) && !Array.isArray(source.bottom)) {
    return defaultKeyBindings();
  }

  const used = new Set<string>();
  const top = sanitizeLane(source.top, used);
  const bottom = sanitizeLane(source.bottom, used);

  const fill = (lane: Lane, current: string[]): string[] => {
    if (current.length > 0) return current;
    for (const code of [...DEFAULT_KEY_BINDINGS[lane], ...FALLBACK_CODES]) {
      if (!isBindableKeyCode(code) || used.has(code)) continue;
      used.add(code);
      return [code];
    }
    return current;
  };

  return { top: fill('top', top), bottom: fill('bottom', bottom) };
}

/** 从 `localStorage` 读绑定；没有 / 坏了就回默认。 */
export function loadKeyBindings(): KeyBindings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY_BINDINGS_STORAGE_KEY);
    if (!raw) return sanitizeKeyBindings(null);
    return sanitizeKeyBindings(JSON.parse(raw) as unknown);
  } catch {
    return sanitizeKeyBindings(null);
  }
}

/** 写回 `localStorage`；写不进去就算了（无痕模式等）。 */
export function saveKeyBindings(bindings: KeyBindings): void {
  try {
    globalThis.localStorage?.setItem(
      KEY_BINDINGS_STORAGE_KEY,
      JSON.stringify(sanitizeKeyBindings(bindings)),
    );
  } catch {
    // 存不了就只在本次会话生效
  }
}
