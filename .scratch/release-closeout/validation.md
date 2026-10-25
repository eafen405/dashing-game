# Release closeout validation

Date: 2026-10-25

## Web

- TypeScript and ESLint pass.
- 530 tests across 38 files pass, including separate code/artwork budget checks.
- Production build, file:// offline verification and menu/play/pause/resize/
  settlement smoke pass. No external requests or page exceptions.
- HUD verification passes two 30-second scenarios: animated score updates still
  write directly to DOM and do not cause per-frame React reconciliation.
- Final HTML: 2,276,997 bytes; gzip: 1,209,335 bytes. Original baseline:
  2,325,570 / gzip 1,223,459. Actual reduction: 48,573 bytes (2.09%).
- Code/style: 1084.3 KiB / gzip 321.3 KiB; original inline artwork:
  1139.8 KiB / gzip 857.6 KiB. Both stay within their documented warning budgets.
- All 26 original WebP source frames and source.html remain unchanged.
- Targeted formatting and Git whitespace checks pass.

## Unity

- Final Windows rebuild succeeds: zero errors, one existing headless ambient /
  reflection-probe warning for a 2D scene that does not use scene lighting.
- Rules: 3162 assertions; 408 TypeScript snapshots across eight deterministic
  replays. Presentation: 18 assertions. Clarity imports: 127 assertions.
- New key-binding checks: 36 assertions, including count/duplicate/reserved-key
  rules, defaults, legacy presets, malformed storage and JSON persistence.
- Actual Windows keyboard/mouse validation: 37 checks pass on the final build.
  This covers adding/removing/replacing keys, errors, cancellation, paused
  editing, custom-key strikes, defaults, pointer input and existing menus.
- Test mode does not write player key preferences. Binding descriptions are
  cached until edits, avoiding new per-frame label allocations.
- UI screenshots inspected: TestResults/KeyBindings/01-editor.png,
  02-conflict.png, 03-custom.png and 04-paused.png.
- Final native smoke passes after 2792 gameplay frames: pause clock, hold/soul,
  FEVER cleanup, window resizing and settlement/restart. Natural twins, burning
  and FEVER occur; holds are also exercised explicitly.

## Source checkpoint

Include the native project, original/enhanced art and metadata, earlier local
animation/FEVER/layout fixes, closeout changes and documentation in one local
Git checkpoint. Generated builds, logs, Library, TestResults and screenshots
remain ignored. Unity YAML whitespace attributes preserve native serialization.
The commit identifier is available in git log; no remote publication is part
of this closeout.
