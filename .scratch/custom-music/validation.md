# Custom music validation

Validated on Windows, Unity 2022.3.62f3c1, 2026-10-25.

- Unity compilation and Windows standalone build succeeded, zero errors.
- 70 editor rhythm/storage/combat assertions passed, alongside 3162 existing rule checks.
  Combat cases include shared character HP, critical/normal score, healing,
  same-rail damage, opposite-rail graze, no random spawns, Burning activation,
  FEVER stacking, HP drain floor, pause freezing and death accounting.
- Existing reference replays remain covered by the build-time rule validator.
- Native MP3 smoke: 22 assertions covering decode, countdown, recording, pause,
  hidden character, central spawn and leftward movement, undo, save, unsaved
  protection, source independence, reload, character selection, shared critical
  score/healing and complete results. Uses an original synthesized four-second MP3.
- Native music input: 42 checks passed with the Windows file picker, real W and
  mouse input on both rails, pause/resume, undo, modal click blocking, cancel,
  confirmed rerecord, draft audition, editable title, copied audio, two process
  launches sharing an isolated test library, song completion, and return navigation.
  Checks additionally cover central recording feedback without a character,
  leftward monster movement, draft and saved-chart character selection, Rin's
  125/250 HP and Zhe's 300/300 HP, visible selected character in play, and shared
  same-rail damage / opposite-rail graze (Zhe finishes at 280/300 HP).
- Actual window screenshots reviewed for library, preparation, central recording,
  discard modal, character selection, saved level, gameplay and results. Hidden-window smoke captures
  are black on this machine and are not used as visual acceptance evidence.
- Existing survival keyboard/mouse check: 37 checks passed, including custom
  keys, pause/menu navigation and mouse attacks after music menu integration.
- Existing survival native smoke passed across 2791 gameplay frames, including
  pause freezing, hold/soul scenarios, FEVER cleanup, resize, game over and restart.
  The latest visible-window run passed with fresh screenshots and a successful
  player-smoke.json report after the shared combat and recording-stage changes.

Evidence (ignored, local only): unity/TestResults/music-checks.txt,
unity/TestResults/Music/music-smoke.json,
unity/TestResults/Music/music-input-checks.txt,
unity/TestResults/Music/ui-*.png, unity/TestResults/input-checks.txt,
unity/TestResults/Player/player-smoke.json, unity/TestResults/build-report.json.

Direction update (2026-10-25): recording points stay centered; recorded monsters
now move left. Direction arrows and text match. Rebuilt Windows successfully;
70 editor music assertions, 3162 existing rule checks, 22 native music smoke
checks and all 42 real keyboard/mouse music checks passed again. Reviewed the
fresh paused-recording screenshot showing both monsters left of the center line.

The native dialog's initial nested StringBuilder marshalling failed under Mono;
it now uses explicit Unicode unmanaged buffers and passed the actual picker test.
Discard and rerecord now use explicit intent with a full-screen modal blocker.
Original pause/results menu return-button placement is preserved.

Scope: local MP3 and manual single-tap chart recording. Automatic chart generation,
hold notes, timeline editing, cloud publishing and non-Windows packaging are not
implemented or claimed.

Rail presentation and response update (2026-10-25): removed the large translucent
input rectangles, added small rail-colored hints with press feedback, and aligned
the invisible hit surfaces with the actual rails. Character rail travel is now
immediate in survival and chart play; drawing runs after UGUI pointer input.
The runtime targets 240 FPS with VSync disabled and one queued render frame.
This is a same-frame presentation change, not a measured 1 ms device latency.

- Rebuilt Windows successfully with zero errors; all 3162 reference rule checks
  and 70 music checks passed.
- 40 presentation assertions passed, including both characters, 100 alternating
  inputs at each tested time step, 1 ms chart reversals, hold/soul and pause.
- Visible-window smoke passed across 6682 gameplay frames, including 12 same-frame
  rail switches for each character, FEVER cleanup, resize, game over and restart.
- All 42 music input checks and 37 survival input checks passed again.

Natural descent refinement (2026-10-25): upper strikes still reach the upper rail
in the input frame, but idle characters now accelerate downward and land after
about one second. A lower strike lands immediately; another upper strike returns
to the upper rail immediately, including during an existing upper-rail airtime.
Hold/soul behavior and Core gameplay clocks are unchanged.

- Rebuilt Windows with zero errors; 3162 rule checks and 82 presentation
  assertions passed, including frame-rate-independent fall progress, pause,
  natural landing and both interrupt directions for Rin and Zhe.
- Visible-window smoke passed across 6675 gameplay frames, with both characters'
  natural descent, pause, upper re-strike and immediate lower strike checked.
  Reviewed the fresh 18-natural-fall.png capture.
- All 42 real keyboard/mouse music checks passed again after this refinement.

Authored hold and twin extension (2026-10-25): short input records a normal
monster; holding for at least 200 ms records the actual music-clock duration.
The recording UI shows the growing hold duration and has a twin switch that
records one linked pair from either rail. Holds exclude pause time, finish at
their recorded duration, fail on early release and allow opposite-rail soul
proxy. Twins use the existing 180 ms completion window and shared rewards /
self-destruction. Paired undo, optional JSON fields and legacy v1 tap charts
are covered. Automatic chart generation and timeline editing remain out of scope.

- Latest Windows build succeeded with zero errors and one warning.
- All 3162 reference rule checks and 82 presentation assertions passed.
- 172 music assertions passed, covering actual hold lengths from 200 ms to
  5 seconds for both characters, early release, input ownership, pause, soul
  proxy, hold overlap validation, twin boundary / solo / misses, JSON and legacy
  compatibility. Existing survival rules continue to match the browser reference.
- Native MP3 smoke passed 30 checks through mixed recording, pause, save,
  original-audio independence, reload and successful hold / soul / twin playback.
  The six-note mixed chart scored 2500 with zero misses and 165 HP as Rin.
- All 52 real keyboard/mouse music checks passed. Physical 650 ms keyboard and
  450 ms mouse holds retained their durations, one key press authored a twin
  pair, and both metadata types survived saving and a full native process restart.
- Reviewed fresh music-hold.png and music-twins.png captures from the real player.
- All 37 real survival input / rebinding checks passed again on this build.
