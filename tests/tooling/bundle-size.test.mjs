import { describe, expect, it } from 'vitest';
import { BUNDLE_BUDGET, bundleWarnings, measureBundle } from '../../scripts/bundle-size.mjs';

describe('Single-file code and artwork budgets', () => {
  it('reports the actual complete file and original inline artwork independently', () => {
    const html = '<script>const frame="data:image/webp;base64,QUJDRA==";</script>';
    const result = measureBundle(html);
    expect(result.htmlBytes).toBe(html.length);
    expect(result.inlineImages).toBe(1);
    expect(result.imageBytes).toBe('data:image/webp;base64,QUJDRA=='.length);
    expect(result.codeBytes).toBeLessThan(result.htmlBytes);
    expect(result.gzipBytes).toBeGreaterThan(0);
    expect(bundleWarnings(result)).toEqual([]);
  });

  it('still warns when executable code exceeds the original cap', () => {
    const result = measureBundle(`<script>${'a'.repeat(BUNDLE_BUDGET.codeBytes)}</script>`);
    expect(bundleWarnings(result)).toHaveLength(1);
    expect(bundleWarnings(result)[0]).toContain('代码 / 样式');
  });

  it('does not blame inline artwork on the JavaScript dependency budget', () => {
    const html = `<script>const frame="data:image/webp;base64,${'A'.repeat(BUNDLE_BUDGET.imageBytes)}";</script>`;
    const result = measureBundle(html);
    expect(result.codeBytes).toBeLessThan(100);
    expect(bundleWarnings(result)).toHaveLength(1);
    expect(bundleWarnings(result)[0]).toContain('内联原画');
  });

  it('counts repeated image payloads instead of deduplicating away file growth', () => {
    const image = 'data:image/webp;base64,QUJDRA==';
    expect(measureBundle(`"${image}" "${image}"`).inlineImages).toBe(2);
    expect(measureBundle(`"${image}" "${image}"`).imageBytes).toBe(image.length * 2 + 1);
  });
});
