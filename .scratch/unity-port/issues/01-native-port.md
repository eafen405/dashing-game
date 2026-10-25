# Native Unity 2D migration

Type: task
Status: resolved

## Work

Implement the native project, import assets, verify core mechanics, compile and
build a playable Windows version. Keep existing web changes untouched.

## Comments

- Confirmed Unity 2022.3.62f3c1 and Windows standalone module on this computer.

## Answer

Implemented the native project in `unity/` and built the Windows player.
Pure C# rules match 408 snapshots from eight ~100-second TypeScript replays;
3162 rule assertions pass. A real Windows player validates rendering, hold/soul,
pause, FEVER exit, character presentation, resize, game over and restart.
Actual keyboard/mouse checks exercise the native menu and control bindings.

See `../validation.md` and `unity/README.md` for commands and explicit presentation
differences. The original web version and its uncommitted fixes are preserved.
