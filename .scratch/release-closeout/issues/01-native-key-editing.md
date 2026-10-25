# Native key editing

Type: task
Status: resolved

## Answer

Implemented `RailKeyBindings` and a separate native `KeyBindingsPanel`: 1–3 keys
per rail, duplicates/reserved keys, removal/defaults/presets, persistent JSON with
legacy preset migration, and cancellation before game shortcut handling.

Unity checks pass 36 assertions. The extended actual Windows keyboard/mouse
script passes 37 checks; screenshots confirm readable default/conflict/custom
and paused layouts. Probe mode never saves user key preferences.
