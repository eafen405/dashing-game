import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'vite';
import { measureBundle, BUNDLE_BUDGET, bundleWarnings } from './bundle-size.mjs';

// Measure production output without touching dist/index.html or the artwork.
const packages = {};
const modules = [];
const result = await build({
  build: { write: false },
  plugins: [
    {
      name: 'dashing-bundle-report',
      generateBundle: {
        order: 'pre',
        handler(_options, bundle) {
          for (const chunk of Object.values(bundle)) {
            if (chunk.type !== 'chunk') continue;
            for (const [id, metadata] of Object.entries(chunk.modules)) {
              const path = id.replaceAll('\\', '/');
              const bytes = metadata.renderedLength;
              const dependency =
                path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ?? 'application';
              packages[dependency] = (packages[dependency] ?? 0) + bytes;
              modules.push({
                path: path.replace(process.cwd().replaceAll('\\', '/') + '/', ''),
                bytes,
              });
            }
          }
        },
      },
    },
  ],
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
const html = outputs.find(
  (item) => item.type === 'asset' && item.fileName === 'index.html',
)?.source;
if (typeof html !== 'string') throw new Error('Single-file HTML was not produced');
const report = {
  ...measureBundle(html),
  budgets: BUNDLE_BUDGET,
  warnings: bundleWarnings(measureBundle(html)),
  moduleSizeNote:
    'Package/module lengths are before final minification; they do not sum to HTML bytes.',
  packages: Object.fromEntries(Object.entries(packages).sort((a, b) => b[1] - a[1])),
  largestModules: modules.sort((a, b) => b.bytes - a.bytes).slice(0, 15),
};
mkdirSync('dist', { recursive: true });
writeFileSync('dist/bundle-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
