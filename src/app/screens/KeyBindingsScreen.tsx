/**
 * 按键设置界面（电脑端）。
 *
 * 上下轨各允许 **1–3 个** 物理键。点一个键位进入「听键」状态，
 * 下一个按下的键就替换它；`Esc` 取消。上下轨之间不允许重复，
 * `P` / `Enter` / `Space` / `Esc` / `Tab` 等游戏控制键也不允许占用。
 *
 * 设置**即时生效并写入 `localStorage`** —— 没有「保存」按钮，
 * 因为这张表只有六个格子，误操作再点一下就能改回来。
 */

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { Lane } from '../../game/types';
import {
  MAX_KEYS_PER_LANE,
  RESERVED_KEY_CODES,
  defaultKeyBindings,
  isBindableKeyCode,
  keyLabel,
  type KeyBindings,
} from '../../input/keyBindings';

/** 按键设置界面属性。 */
export interface KeyBindingsScreenProps {
  /** 当前绑定。 */
  bindings: KeyBindings;
  /** 绑定变化（即时保存由上层负责）。 */
  onChange: (next: KeyBindings) => void;
  /** 返回主页面。 */
  onBack: () => void;
}

/** 正在等待按键的槽位。 */
interface ListeningSlot {
  lane: Lane;
  index: number;
}

const LANES: ReadonlyArray<{ lane: Lane; label: string; note: string }> = [
  { lane: 'top', label: '上轨', note: '默认 ↑ / W' },
  { lane: 'bottom', label: '下轨', note: '默认 ↓ / S' },
];

/** 按键设置界面。 */
export function KeyBindingsScreen({
  bindings,
  onChange,
  onBack,
}: KeyBindingsScreenProps): ReactElement {
  const [listening, setListening] = useState<ListeningSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      // 捕获阶段拦下：这一下是「绑定」，不是出刀、也不是菜单确认。
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;

      if (event.code === 'Escape') {
        setListening(null);
        setError(null);
        return;
      }

      const code = event.code;
      if (!isBindableKeyCode(code)) {
        setError(
          RESERVED_KEY_CODES.has(code)
            ? `「${keyLabel(code)}」是开始 / 暂停 / 菜单控制键，换一个`
            : `「${keyLabel(code)}」不能绑定，换一个`,
        );
        return;
      }

      const otherLane: Lane = listening.lane === 'top' ? 'bottom' : 'top';
      if (bindings[otherLane].includes(code)) {
        setError(`「${keyLabel(code)}」已经绑在${otherLane === 'top' ? '上' : '下'}轨了`);
        return;
      }

      const sameLane = bindings[listening.lane];
      const duplicateIndex = sameLane.indexOf(code);
      if (duplicateIndex !== -1 && duplicateIndex !== listening.index) {
        setError(`「${keyLabel(code)}」已经在本轨的另一个键位上`);
        return;
      }

      const nextLane = [...sameLane];
      if (listening.index < nextLane.length) nextLane[listening.index] = code;
      else nextLane.push(code);
      onChange({ ...bindings, [listening.lane]: nextLane });
      setListening(null);
      setError(null);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [listening, bindings, onChange]);

  const startListening = (lane: Lane, index: number): void => {
    setListening({ lane, index });
    setError(null);
  };

  const removeKey = (lane: Lane, index: number): void => {
    const list = bindings[lane];
    if (list.length <= 1) return; // 每轨至少留一个键，否则这一轨就没法出刀了
    onChange({ ...bindings, [lane]: list.filter((_, i) => i !== index) });
    setListening(null);
    setError(null);
  };

  const reset = (): void => {
    onChange(defaultKeyBindings());
    setListening(null);
    setError(null);
  };

  return (
    <div id="keyBindingsScreen" className="overlay key-bindings" data-no-strike="">
      <h2>按键设置</h2>
      <p className="key-intro">
        电脑端：上轨 / 下轨各最多绑 3 个键。点键位后按下新键，「Esc」取消。
      </p>

      <div className="key-lanes">
        {LANES.map(({ lane, label, note }) => {
          const list = bindings[lane];
          return (
            <section className="key-lane" data-lane={lane} key={lane}>
              <header className="key-lane-head">
                <i className={`dot dot-${lane}`} />
                <span className="key-lane-name">{label}</span>
                <span className="key-lane-note">{note}</span>
              </header>

              <div className="key-slots">
                {list.map((code, index) => {
                  const active = listening?.lane === lane && listening.index === index;
                  return (
                    <span className="key-slot" key={`${lane}-${code}-${index}`}>
                      <button
                        type="button"
                        className={active ? 'key-btn listening' : 'key-btn'}
                        data-code={code}
                        data-slot={index}
                        aria-label={`${label}第 ${index + 1} 个键：${keyLabel(code)}，点击重新绑定`}
                        onClick={() => startListening(lane, index)}
                      >
                        {active ? '按下按键…' : keyLabel(code)}
                      </button>
                      {list.length > 1 ? (
                        <button
                          type="button"
                          className="key-clear"
                          aria-label={`清除${label}的 ${keyLabel(code)}`}
                          onClick={() => removeKey(lane, index)}
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  );
                })}

                {list.length < MAX_KEYS_PER_LANE ? (
                  <button
                    type="button"
                    className="key-add"
                    data-add={lane}
                    onClick={() => startListening(lane, list.length)}
                  >
                    ＋ 添加
                  </button>
                ) : null}
              </div>

              <span className="key-count">
                {list.length}/{MAX_KEYS_PER_LANE}
              </span>
            </section>
          );
        })}
      </div>

      <div className={error ? 'key-error has-error' : 'key-error'} role="status" aria-live="polite">
        {error ??
          (listening
            ? '按下要绑定的键…（Esc 取消）'
            : '上下轨不能重复，P / Enter / 空格 / Esc 保留给游戏')}
      </div>

      <div className="key-actions">
        <button type="button" className="ghost-button" onClick={reset}>
          恢复默认
        </button>
        <button id="btnKeysBack" type="button" className="back-button" onClick={onBack}>
          返回主页面
        </button>
      </div>
    </div>
  );
}
