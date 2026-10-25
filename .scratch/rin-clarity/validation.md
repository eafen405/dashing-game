# Rin clarity validation

Completed: 2026-10-25

## Results

- Windows build: succeeded, zero errors, one existing nonblocking headless
  ambient/reflection-probe warning.
- Local asset pipeline: 110 checks passed; original frame hashes preserved.
- Unity asset/import validation: 127 checks passed.
- Existing motion validation: 18 assertions passed.
- Rules/replay validation: 3162 assertions, including 408 snapshots from eight
  TypeScript replays, passed.
- Actual keyboard/mouse validation: 18 checks passed, including F8 toggle and
  restore without changing test-time player preferences.
- Native comparison: passed; three matched poses, three riding midpoints and
  burn comparison, with identical source frames and character scale.
- Final full native smoke: passed after 3291 frames; pause clock, FEVER cleanup,
  hold/soul, game over/restart and resize checks all pass. Natural pair, burn
  and FEVER occurred. Holds were explicitly exercised; `naturalHold: false`
  is not a failed check.

## Review artifacts

Paths below are relative to the repository root.

- `unity/TestResults/RinClarity/clarity-comparison.png`
- `unity/TestResults/RinClarity/rin-ride-before-after.png`
- `unity/TestResults/RinClarity/burn-comparison.png`
- `unity/TestResults/RinClarity/native-preview.json`
- `unity/TestResults/RinClarity/pipeline-checks.json`
- `unity/TestResults/RinClarity/asset-report.json`
- `unity/TestResults/Player/player-smoke.json`
- `unity/player-smoke.log` (`DASHING_PLAYER_SMOKE_PASS`)
- `unity/build.log`

Final native images were visually inspected. Facial ghosting is reduced and
hair/blade contours remain coherent; the earlier blade-edge streak is absent.
Idle and attack improvements are subtler than the riding transition changes.
These checks establish correctness and visual behavior, not an FPS benchmark
or a perceptual quality score. No AI redrawing or new source detail is claimed.
