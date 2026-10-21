/**
 * Node 侧的 TypeScript 解析钩子。
 *
 * Node 24 内置「类型擦除」（type stripping），可以直接跑 `.ts` 文件，
 * 但它要求 import 说明符带**真实的文件扩展名** —— 而本仓库用
 * `moduleResolution: bundler` 风格的无扩展名 import（`'./constants'`）。
 *
 * 这个钩子补上扩展名：解析失败时自动重试 `specifier + '.ts'`。
 *
 * 注册方式：`module.register('./ts-resolve.mjs', import.meta.url)`。
 */

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (specifier.endsWith('.ts')) throw err;
      return await nextResolve(`${specifier}.ts`, context);
    }
  }
  return nextResolve(specifier, context);
}
