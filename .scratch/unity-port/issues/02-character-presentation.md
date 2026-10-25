# Restore character presentation omitted in the Unity migration

Status: resolved
Type: task

## Request

The native port loses many original presentation details and Rin no longer uses
her walking / scythe-riding animation on the ground.

## Scope

Restore the source ground riding condition and frame timing, jump / falling /
landing and twin-smash poses, hold waiting, health ring, character shadow and
ground light, hurt flash, FEVER arcs and layered burning wisps / embers. Reuse
the existing Rin frames and keep gameplay rules and web fixes unchanged.

## Validation

Build the native Windows player, keep deterministic replay parity, exercise
movement / pause / hold / twin / burn states and inspect captured native frames.

## Answer

Fixed the inverted ground / upper-lane riding condition and restored the source
frame timing / hold waiting behavior. `PlayerMotion` now owns the independent
presentation clocks, parabolic jump, interrupted gravity fall, touchdown and
twin-smash curves. `CharacterEffects` restores reusable HP arcs, shadow / ground
light, landing rings, FEVER arcs and layered burn / scythe effects. Native hit
zones regain fills, pulsing double strokes, labels, center and direction arrow.

The final Windows release rebuild succeeds with zero errors. Validation passes:
18 motion assertions, 12 actual renderer / pose checks, 3162 rule assertions
including 408 snapshots across 8 TypeScript replays, and 16 actual keyboard /
mouse checks. Native screenshots for ground riding at two times, jump apex,
twin jump, burning ride / attack, paused hold and portrait layout were inspected.
The final smoke report has `passed: true` and FEVER cleanup passes.

Playable output remains `unity/Builds/Windows/Dashing.exe` via `unity/Play.cmd`.
See [validation](../validation.md#character-presentation-follow-up-2026-10-25).
Menus, enemy artwork and other scene details still have native styling; complete
pixel parity is not claimed. Existing web fixes and rule values are preserved.
