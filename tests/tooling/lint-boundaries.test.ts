import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * 工具层契约测试：ESLint 对 `src/game/**` 的拦截规则必须真的拦得住。
 *
 * 这是票 01 的核心交付物之一 —— 后续票（02 规则层纯化、03 保真门禁）依赖这些规则
 * 来保证「规则层无 DOM / 无 Pixi / 无 React / 不用 Math.random」。
 * 规则写在配置里不算数：配置写错、路径写错、规则被后续改动覆盖，都会让后续票
 * 在毫无保护的情况下继续写代码。本文件用 ESLint 的公开 API 对**虚拟文件**跑一遍，
 * 直接验证「违规代码被报错、合规代码不报错」。
 *
 * 探测文件用 `lintText` + 虚拟路径，因此不往仓库里落任何故意违规的文件。
 */

/** 仓库根目录（`tests/tooling/` → 上溯三级）。 */
const repoRoot = decodeURIComponent(new URL('../../', import.meta.url).pathname);

const eslint = new ESLint({ cwd: repoRoot });

/** 在给定虚拟路径上跑一段代码，返回 ESLint 报出的消息。 */
async function lintAt(filePath: string, code: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(code, { filePath });
  if (!result) throw new Error(`ESLint 没有返回结果：${filePath}`);
  return result.messages;
}

function ruleIds(messages: Linter.LintMessage[]): (string | null)[] {
  return messages.map((m) => m.ruleId);
}

describe('规则层 lint 边界', () => {
  it('拦截规则层的 React 导入', async () => {
    const messages = await lintAt(
      'src/game/__probe__.ts',
      "import React from 'react';\nexport const a = React;\n",
    );

    expect(ruleIds(messages)).toContain('no-restricted-imports');
  });

  it('拦截规则层的 React 子路径导入', async () => {
    const messages = await lintAt(
      'src/game/__probe__.ts',
      "import { jsx } from 'react/jsx-runtime';\nexport const a = jsx;\n",
    );

    expect(ruleIds(messages)).toContain('no-restricted-imports');
  });

  it('拦截规则层的 Pixi 导入', async () => {
    const messages = await lintAt(
      'src/game/__probe__.ts',
      "import { Application } from 'pixi.js';\nexport const a = Application;\n",
    );

    expect(ruleIds(messages)).toContain('no-restricted-imports');
  });

  it('拦截规则层的 DOM 全局', async () => {
    const messages = await lintAt(
      'src/game/__probe__.ts',
      "export const el = document.getElementById('root');\n",
    );

    expect(ruleIds(messages)).toContain('no-restricted-globals');
  });

  it('拦截规则层的 Math.random', async () => {
    const messages = await lintAt('src/game/__probe__.ts', 'export const r = Math.random();\n');

    expect(ruleIds(messages)).toContain('no-restricted-properties');
  });

  it('拦截规则层的 any 逃逸', async () => {
    const messages = await lintAt('src/game/__probe__.ts', 'export const x: any = 1;\n');

    expect(ruleIds(messages)).toContain('@typescript-eslint/no-explicit-any');
  });

  it('规则层之外不误伤同样的代码', async () => {
    const code = [
      "import React from 'react';",
      "export const el = document.getElementById('root');",
      'export const r = Math.random();',
    ].join('\n');

    const messages = await lintAt('src/app/__probe__.ts', code);
    const ids = ruleIds(messages);

    expect(ids).not.toContain('no-restricted-imports');
    expect(ids).not.toContain('no-restricted-globals');
    expect(ids).not.toContain('no-restricted-properties');
  });
});
