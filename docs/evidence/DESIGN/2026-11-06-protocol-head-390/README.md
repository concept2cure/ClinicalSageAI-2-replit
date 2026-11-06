# The protocol workspace's head at 390 px (2026-11-06)

Reported by R1 (`docs/evidence/DESIGN/R1/2026-11-06-sizing-run-reproduction/03-protocol-workspace-390.png`).
Fixed in `client/src/concept2cure/v2/styles/research-v2.css`, which holds the `.pd-head` rules.

## What already exists

The protocol workspace's head is `ProtocolHead` in `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx`.
It has the kind, title, short title and sponsor line on the left (`.pd-head-l`), and the version line, Ask AnA,
Export and "Open saved draft in editor" on the right (`.pd-head-r`). The rules are in `research-v2.css` (layout) and
`protocol-dev-editing.css` (min-width and the sub-row's wrapping). No other component uses these classes.

## What was wrong

`.pd-head-r` had `flex-shrink:0`, so at 390 px the actions took their full 554 px and the title column was left
with nothing. Measured in the running app:
- the left column was 0 px wide;
- the title was 80 px wide, one word per line;
- the right column ran from x = 44 to x = 598. "Clinical protocol" sat under the version line, and **"Open saved
  draft in editor" was off the screen, so a phone could not reach it** (`before-390.png`).

## The fix

- The head wraps.
- The title column keeps at least 22rem before the actions drop beneath it.
- The actions may shrink, and they wrap among themselves.

After, at 390 px, the title is 342 px wide on three lines, and all three actions are on screen under the version line
(`after-390.png`). At 1440 px nothing moved: the measured boxes are identical before and after (`after-1440.png`).
The page has no horizontal scroll at either width, and the walk had no page errors.

The walk used the running app, in development mode, on the seeded C2C-101-201 protocol.
