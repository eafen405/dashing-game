/**
 * 配色常量的契约测试 —— **次 seam**（brief-06 §「已约定的测试 seam」第 2 条）。
 *
 * 断言的是**票里写死的字面量**（不是「从别处算出来的期望值」）：
 * 这套赛博霓虹配色不得改（ADR-0001 附带决定）。
 * 规则层常量一旦改色，这里的断言就会红 —— 防止两处漂移。
 */

import { describe, expect, it } from 'vitest';

import {
  FRENZY_BOTTOM,
  FRENZY_TOP,
  GOLD,
  LANE_BOTTOM,
  LANE_TOP,
  LONG_COLOR,
  PAIR_COLOR,
  hexA,
  laneColorOf,
} from '../palette';

describe('战场配色（Pixi 侧）', () => {
  it('色彩常量与票里写死的值一致', () => {
    expect(GOLD).toBe('#ffd24a'); // 得分 / 暴击圈
    expect(PAIR_COLOR).toBe('#ff5ecb'); // 双生
    expect(LONG_COLOR).toBe('#a6ff5e'); // 长按怪
    expect(LANE_TOP).toBe('#4fd1ff'); // 上轨
    expect(LANE_BOTTOM).toBe('#ff8a4f'); // 下轨
    expect(FRENZY_TOP).toBe('#ffd24a'); // FEVER 上轨（亮金）
    expect(FRENZY_BOTTOM).toBe('#ff9a2e'); // FEVER 下轨（琥珀金）
  });

  it('FEVER 时两轨仍保留区分度（上轨亮金 / 下轨琥珀金）', () => {
    expect(laneColorOf('top', false)).toBe('#4fd1ff');
    expect(laneColorOf('bottom', false)).toBe('#ff8a4f');
    expect(laneColorOf('top', true)).toBe('#ffd24a');
    expect(laneColorOf('bottom', true)).toBe('#ff9a2e');
  });

  it('hexA() 只接受 6 位十六进制，alpha 不做格式化', () => {
    expect(hexA('#ffd24a', 0.16)).toBe('rgba(255,210,74,0.16)');
    expect(hexA('#4fd1ff', 1)).toBe('rgba(79,209,255,1)');
    expect(hexA('#000000', 0)).toBe('rgba(0,0,0,0)');
  });
});
