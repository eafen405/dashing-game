# Improve Rin image clarity and animation contour stability

Status: resolved
Type: task

## Request

The user asks to make Rin clearer and more refined in the native game.

## Approach

Keep original art and pose timing; improve texture treatment and subframe
reconstruction. Save processed assets separately so the originals remain
available, and inspect fixed-time before / after native captures.

## Answer

Completed on 2026-10-25. Added 26 separate, locally enhanced 2x textures,
cleaned translucent white edges, and adjusted Unity texture sampling. Original
art, normalized anchors, character size, pose timing and gameplay are preserved.
Offline motion maps align breathing and riding transitions to reduce doubled
facial and weapon contours. Padded transparent sampling prevents blade-edge
streaks. F8 switches between the original and enhanced rendering in the player.

The Windows build succeeds with zero errors. Local pipeline, Unity asset,
motion, rule replay, real input and full native player smoke checks pass.
Fixed-pose native comparisons were visually reviewed, including riding
midpoints and burn. The final full player smoke also verifies FEVER cleanup,
hold/soul, pause, resize, game over and restart.

See [validation results](../validation.md). The native comparison is
`unity/TestResults/RinClarity/rin-ride-before-after.png` (original left,
enhanced right); launch with `unity/Play.cmd`.

This is faithful local processing, not a redraw. Additional true artwork detail
remains limited by the original source resolution.
