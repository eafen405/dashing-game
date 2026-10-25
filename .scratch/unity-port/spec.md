# Native Unity 2D port

Create a playable, native Unity 2022.3.62f3c1 Windows project in `unity/`.
Preserve the web project and all existing local fixes. No WebView wrapper.

## Scope

- Pure C# gameplay core matching the TypeScript rules and deterministic PRNG.
- Native 2D camera, renderers, pooled feedback, keyboard/mouse/touch input and UI.
- Both characters, four difficulties, twins, hold/soul, burn and FEVER.
- Convert existing Rin WebP frames to Unity-compatible PNG without new art.
- Include frame blending and derive FEVER presentation from current rule state.
- Generate the playable scene, validate rules and build a Windows executable.

## Validation

Compile with the installed Unity Editor, run deterministic rule checks and a
native player smoke test. Document any remaining differences honestly.
