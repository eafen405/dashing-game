import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

/**
 * ESLint flat config —— 票 01 工程基线。
 *
 * 分层：
 *   1. 通用：JS 规则 + TypeScript 严格档（`typescript-eslint` strict）
 *   2. React Hooks 规则（`eslint-plugin-react-hooks`）
 *   3. 规则层边界（`src/game/**`）—— 后续票依赖这一段来守住「规则层是纯函数层」
 *   4. `eslint-config-prettier` —— 放在最后，关闭与 Prettier 冲突的规则
 */

/** 供 TS 源文件使用的文件选择器。 */
const TS_FILES = ['**/*.{ts,tsx,mts,cts}'];

/**
 * DOM 全局。
 *
 * `tsconfig.json` 的 `lib` 含 `"DOM"`，所以这些全局在 TS 源码里是合法存在的。
 * ESLint 侧必须也把它们声明为全局，`no-restricted-globals` 才能识别到引用
 * （该规则只看得到「已定义但未在文件内定义」的全局变量）。
 */
const DOM_GLOBALS = {
  document: 'readonly',
  window: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  screen: 'readonly',
  ResizeObserver: 'readonly',
  fetch: 'readonly',
  Image: 'readonly',
  HTMLElement: 'readonly',
  HTMLCanvasElement: 'readonly',
  Element: 'readonly',
  Node: 'readonly',
  Window: 'readonly',
  Document: 'readonly',
  Storage: 'readonly',
  Event: 'readonly',
  EventTarget: 'readonly',
};

/** 规则层不得出现的 DOM 类型（类型位置）。 */
const DOM_TYPES = [
  'HTMLElement',
  'HTMLCanvasElement',
  'HTMLImageElement',
  'HTMLDivElement',
  'HTMLInputElement',
  'Element',
  'Node',
  'NodeList',
  'Document',
  'Window',
  'Storage',
  'Event',
  'EventTarget',
  'ImageData',
  'CanvasRenderingContext2D',
  'WebGLRenderingContext',
  'CanvasImageSource',
  'File',
  'Blob',
  'FormData',
  'Request',
  'Response',
  'Headers',
  'MutationObserver',
  'ResizeObserver',
  'IntersectionObserver',
  'Performance',
  'PerformanceObserver',
  'Worker',
  'XMLHttpRequest',
  'WebSocket',
];

/** 规则层不得出现的宿主全局（值位置）。 */
const FORBIDDEN_GLOBALS = [
  'document',
  'window',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'fetch',
  'Image',
];

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },

  // ── 1. 通用规则 ─────────────────────────────────────────────
  js.configs.recommended,
  {
    name: 'project/js',
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        // scripts/ 下的浏览器校验代码通过 page.evaluate 在 Chromium 里执行
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        HTMLCanvasElement: 'readonly',
      },
    },
  },
  // TypeScript 严格档。`typescript-eslint` 的 base/strict 段默认不带 `files`，
  // 这里补上，避免把 TS 专属规则和 TS parser 套到 .mjs / .js 上。
  ...tseslint.configs.strict.map((config) => ({
    ...config,
    files: config.files ?? TS_FILES,
  })),
  {
    name: 'project/dom-globals',
    files: TS_FILES,
    languageOptions: {
      globals: { ...DOM_GLOBALS },
    },
  },

  // ── 2. React Hooks ──────────────────────────────────────────
  {
    name: 'project/react-hooks',
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // ── 3. 规则层边界（src/game/**）─────────────────────────────
  // 规则层是纯函数层：无 DOM、无 Pixi、无 React、随机性走注入的 PRNG。
  // 这些规则预留给票 02（规则层纯化）及之后所有票。
  {
    name: 'rules-layer/game',
    files: ['src/game/**/*.{ts,tsx}'],
    rules: {
      // 禁止 any 逃逸
      '@typescript-eslint/no-explicit-any': 'error',

      // 禁止引入 DOM / React / Pixi
      // 注意：`patterns` 里的 `group` 是「逐条禁止」的语义（每条路径单独命中即报错），
      // 与顶层 `paths` 选项的「互斥」语义不同。
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*'],
              message: '规则层不得依赖 React —— 规则层必须是纯函数层。',
            },
            {
              group: ['react-dom', 'react-dom/*'],
              message: '规则层不得依赖 ReactDOM —— 规则层必须是纯函数层。',
            },
            {
              group: ['pixi.js', 'pixi.js/*'],
              message: '规则层不得依赖 Pixi —— 规则层必须是纯函数层。',
            },
            {
              group: ['@pixi/*'],
              message: '规则层不得依赖 @pixi —— 规则层必须是纯函数层。',
            },
          ],
        },
      ],

      // 禁止触碰 DOM / 宿主全局
      'no-restricted-globals': [
        'error',
        ...FORBIDDEN_GLOBALS.map((name) => ({
          name,
          message: `规则层不得使用宿主全局 \`${name}\` —— 规则层必须是纯函数层。`,
        })),
      ],

      // 禁止在类型位置引用 DOM 类型
      'no-restricted-syntax': [
        'error',
        {
          selector: `TSTypeReference > Identifier[name=/^(${DOM_TYPES.join('|')})$/]`,
          message: '规则层不得引用 DOM 类型 —— 规则层必须是纯函数层。',
        },
        {
          selector:
            'TSQualifiedName > Identifier[name=/^(document|window|navigator|localStorage)$/]',
          message: '规则层不得引用 DOM 全局 —— 规则层必须是纯函数层。',
        },
      ],

      // 随机性必须来自可注入的种子 PRNG，不能用 Math.random()
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: '规则层禁用 `Math.random()` —— 随机性一律走注入的种子 PRNG。',
        },
      ],
    },
  },

  // ── 4. Prettier 集成（必须放最后）────────────────────────────
  prettier,
);
