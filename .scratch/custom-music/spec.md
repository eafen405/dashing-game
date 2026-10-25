# Custom music levels

Implement in the existing native Unity game. A player imports a local MP3,
records upper/lower rail taps while listening, stops to review, optionally saves
a self-contained local level, and reopens it from Music Mode after restarting.

First release: tap notes; DSP audio clock; two-second lead-in; pause/resume;
undo last recorded tap; discard confirmation; replay before saving; title;
input offset; local MP3 copy plus versioned JSON; paginated level library;
Perfect/Good/Miss, accuracy, score and maximum combo; recoverable import and
storage errors. Existing survival mode and key bindings remain available.
No automated beat detection or generated chart is claimed in this release.

Recording presentation: hide the character, soul, weapon swing and character
effects. Put upper/lower recording points at screen center. Each accepted tap
immediately spawns one normal monster at its rail's recording point, moving
left to show that the input was captured. Pause freezes that movement.

Both draft audition and saved-level play open character selection before the
two-second countdown. Rin and Zhe use the same combat rules as survival:
initial/max HP, 300 critical / 200 normal base score, combo, healing, Burning,
FEVER, same-rail damage, opposite-rail graze and death. Chart timestamps supply
normal monsters instead of random spawning. A death ends the run and counts
all remaining notes as misses.

User extension (2026-10-25): short presses remain normal monsters. Presses held
for at least 200 ms author hold monsters with their actual music-clock duration;
pause time is excluded, and stopping clips open holds to the recorded song time.
Playback requires the saved duration, supports early-release failure and
opposite-rail soul proxy, and preserves shared head/middle/completion rewards.
Only one body hold can run at a time; overlapping holds are retained as taps with
a warning, and same-rail inputs cannot interrupt a recorded hold span.

A visible twin-recording switch is available before and during recording.
With it enabled, pressing either rail creates one simultaneous linked twin pair.
The pair undoes atomically and replays with the shared 180 ms completion window,
pair score and single-kill self-destruction rules. JSON includes optional monster
kind, duration and pair identifier fields; existing v1 tap charts remain valid.

Verification: deterministic rhythm tests, storage round trips and corrupt data,
Unity compile and Windows build, real MP3 decode and record/save/reload/play
smoke, pause timing and source-file independence.
