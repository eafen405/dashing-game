/**
 * 角色选择界面 —— 主页面「角色」入口进来的独立一屏。
 *
 * 和难度屏同样的形状：纵排两张卡、当前角色高亮、点选即保存并回主页面。
 * 角色只改规则层被动（生命 / 回复 / 燃魂），不影响判定；镰刀只是凛的外观。
 */

import type { ReactElement } from 'react';

import { CHARACTERS, CHARACTER_IDS } from '../../game/characters';
import { MAX_HP } from '../../game/constants';
import type { CharacterId } from '../../game/types';

/** 角色选择界面属性。 */
export interface CharacterScreenProps {
  /** 当前角色。 */
  characterId: CharacterId;
  /** 选定角色（保存并回主页面）。 */
  onPick: (id: CharacterId) => void;
  /** 返回主页面。 */
  onBack: () => void;
}

/** 武器名（只影响文案）。 */
const WEAPON_NAME: Record<CharacterId, string> = {
  zhe: '球棒',
  rin: '镰刀',
};

/** 被动文案（数值来自规则层配置，避免界面另抄一份）。 */
function passiveText(id: CharacterId): string {
  const c = CHARACTERS[id];
  if (id === 'rin') {
    return `命中 +${c.healPerHit} · 满血燃魂 ×${c.burnScoreMult}`;
  }
  return `生命上限 +${c.maxHp - MAX_HP}`;
}

/** 角色选择界面。 */
export function CharacterScreen({
  characterId,
  onPick,
  onBack,
}: CharacterScreenProps): ReactElement {
  return (
    <div id="characterScreen" className="overlay" data-no-strike="">
      <h2>角色</h2>
      <p className="char-intro">选择角色 · 下一局生效</p>

      <div className="char-list" role="radiogroup" aria-label="角色">
        {CHARACTER_IDS.map((id) => {
          const c = CHARACTERS[id];
          const active = id === characterId;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              className={active ? `char-row active char-${id}` : `char-row char-${id}`}
              data-character={id}
              onClick={() => onPick(id)}
            >
              <span className="char-badge" aria-hidden="true">
                {c.name}
              </span>

              <span className="char-text">
                <span className="char-head">
                  <span className="char-name">{c.name}</span>
                  <span className="char-weapon">{WEAPON_NAME[id]}</span>
                  {active ? <span className="char-active">使用中</span> : null}
                </span>
                <span className="char-passive">{passiveText(id)}</span>
              </span>

              <span className="char-hp">
                {c.startHp} / {c.maxHp}
              </span>
            </button>
          );
        })}
      </div>

      <button id="btnCharacterBack" type="button" className="back-button" onClick={onBack}>
        ‹ 返回
      </button>
    </div>
  );
}
