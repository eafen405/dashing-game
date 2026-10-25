# Separate code and original inline artwork budgets

The historical 1200 KiB / gzip 380 KiB warning was measured before Rin's 26
original frames. On 2026-10-25 the complete single-file HTML measured 2,325,570
bytes (gzip 1,223,459); 1,167,086 bytes were image data URLs. Treating this as
dependency bloat incorrectly attributes the original artwork to JavaScript.

Keep offline single-file delivery and preserve the original frames. Use Motion's
`LazyMotion` / `domAnimation` and small `motion/react-m` components because the
game does not use layout projection or drag features. This reduces the actual
file by 48,573 bytes without changing images or animation timings.

Keep the original code/style warnings at 1200 KiB / gzip 380 KiB. Measure embedded
images separately, with warnings at 1200 KiB / gzip 1000 KiB, covering the current
1140 KiB image payload with limited headroom. Both budgets remain visible in the
verification output and neither is a hard build failure, matching the old policy.
Continue displaying complete-file bytes and gzip bytes; no total-size reduction
is claimed merely because budgets are separated. Separate gzip sizes do not sum
exactly to the combined gzip size because dictionary context differs.

`npm run analyze` writes `dist/bundle-report.json`: total, code, artwork and package
contributions. Package/module sizes are before final minification and are for
diagnosis, not an additive accounting of the final HTML.
