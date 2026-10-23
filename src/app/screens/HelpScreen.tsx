/**
 * 玩法说明界面 —— 旧实现开始界面里那堵规则墙（`source.html:329`）。
 *
 * **为什么从开始界面搬出来**：那堵墙 6 行，横屏手机上占掉约三分之一屏高，
 * 而它只对**第一次玩**的人有用 —— 老玩家天天被它挤着，却一次都不看。
 * 搬进独立一屏之后，开始界面只回答「现在打哪一档」。
 *
 * ## 顺带清掉的用词偏差
 *
 * `GLOSSARY.md` 的「已知用词偏差」表记着 7 处**玩家可见**的旧词。
 * 其中 4 处就在这块规则墙里，搬家的同时一并统一（另 3 处在
 * 规则层的刷怪提示与 HUD 标签上，不属于这一版范围，另开票处理）：
 *
 * | 原词 | 改为 |
 * | --- | --- |
 * | 打击点 | 判定区 |
 * | 光门 | 判定区 |
 * | 判定框 | 判定区 |
 * | COMBO | 连击 |
 *
 * 数值（200 / 300 / 50 连击 / 10 秒 / ×1.5 / 700 / 1000 / -20 / 2 秒）与旧版逐字一致。
 */

import type { ReactElement } from 'react';

import { LONG_HOLD_TIME } from '../../game/constants';

/** 玩法说明界面属性。 */
export interface HelpScreenProps {
  /** 返回主页面。 */
  onBack: () => void;
}

/** 玩法说明界面。 */
export function HelpScreen({ onBack }: HelpScreenProps): ReactElement {
  return (
    <div id="helpScreen" className="overlay" data-no-strike="">
      <h2>玩法说明</h2>

      <div className="help-card">
        <div className="legend">
          <div style={{ color: 'var(--p1)' }}>
            <i className="dot" />
            上半屏 → 上轨判定区
          </div>
          <div style={{ color: 'var(--p2)' }}>
            <i className="dot" />
            下半屏 → 下轨判定区
          </div>
        </div>

        <div className="sub">
          怪物从右侧沿上下轨袭来，进入左侧判定区时点击对应半屏出刀。
          <br />
          漏掉一次，角色失去 20 点血量（初始 250）。
          <br />
          <span style={{ color: '#ffd24a' }}>
            每次命中 200 分，命中中心暴击区 300 分；每累计 50 连击进入 FEVER 10 秒，期间得分 ×1.5。
          </span>
          <br />
          <span style={{ color: '#ff5ecb' }}>
            双生：锁链相连，同击 700（双暴 1000）；单破另一只自爆 -20。
          </span>
          <br />
          <span style={{ color: '#a6ff5e' }}>
            长按：等头部进判定区时点击起手，按住 {LONG_HOLD_TIME} 秒贯穿，头 / 1s / 尾各 +200。
            <br />
            按住期间点另一条轨：灵魂代打，分身替本体出刀，本体留在原地继续长按。
            <br />
            错过时机或中途松手：连击清零，不扣血。
          </span>
        </div>
      </div>

      <button id="btnHelpBack" type="button" className="back-button" onClick={onBack}>
        ‹ 返回
      </button>
    </div>
  );
}
