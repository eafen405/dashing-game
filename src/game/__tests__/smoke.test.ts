import { describe, expect, it } from 'vitest';

/**
 * 规则层骨架冒烟测试（票 01 占位；正式用例由票 02 / 03 补）。
 *
 * 这里断言的不是常量本身，而是一条真实的架构约束：
 * 规则层必须能在**没有 DOM 的环境**（vitest `environment: 'node'`）里被导入。
 * 一旦有人把 React / Pixi / DOM 依赖引进 `src/game/`，这个导入就会失败。
 */
describe('规则层骨架', () => {
  it('可在无 DOM 的 node 环境中导入（规则层不依赖 DOM / Pixi / React）', async () => {
    // 用字符串字面量而不是标识符：规则层自身也受 `no-restricted-globals` 约束。
    expect('document' in globalThis).toBe(false);
    expect('window' in globalThis).toBe(false);

    const rulesLayer = await import('../index');

    expect(Object.keys(rulesLayer)).toContain('RULES_LAYER_ID');
  });
});
