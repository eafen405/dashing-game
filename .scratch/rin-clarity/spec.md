# Rin native sprite clarity

Preserve Rin's identity, colors, outfit, scythe, poses and game rules while
improving fine-detail readability and reducing double contours in animation.
Work in the Unity project; preserve the existing source WebP / PNG originals.

Investigate source resolution, cutout edges, sampling and temporal blending.
Use deterministic local processing / rendering first. Image generation is not
available in this session, and API-based redrawing has not been authorized.

## Acceptance

- All 26 frames use exact 2x canvases, unchanged normalized anchors / world size.
- Face, hair and weapon stay recognizable in idle, ride and attack.
- Improved rendering is compared with the previous version at fixed poses.
- Pause, hold, soul, burn and FEVER cleanup remain correct.
- Native Windows build, presentation / rules and targeted player checks pass.
