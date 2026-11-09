# The composer beside the canvas fits its column (J3 R6, rechecked 2026-11-09)

**The finding.** J3 human test R6 (`docs/evidence/HUMAN-TEST/J3/README.md`, screenshot `x-20-draft-with-ana.png`):
with the canvas open, the controls under the conversation's composer crowded and clipped at 1440 px.
- "AnA drives" ran under the rail.
- "Engine" ran past the column.
- "Between steps" was squeezed into a 179 px stack.

## What already exists (RULE 3)

- **The controls.** `surfaces/ConversationThread.tsx` renders the composer's foot (`.ct-comp-foot`):
  `LiveDriveSwitch`, `RunPolicySwitch variant="foot"`, `ComposerSkills` and the engine pill.
- **The fix, already on trunk.** `dbc080553` (2026-11-06, R1's demo-day sweep) made `.ct-comp-foot` wrap into centred
  rows inside the column (`styles/app-v2.css`). It landed after the J3 walk took its screenshot, and J3's table was
  never updated.
- **The split.** `styles/authoring-v2.css` sets the conversation to `clamp(340px, 34%, 520px)` beside the open canvas,
  and hides it at 1100 px and below.

Nothing was changed for this recheck.

## The recheck in the running app

The probe is `r6-composer.cjs`, run on the walk stack.
- **The stack.** A git archive of `aba641b533`. Trunk differs from it here only in Submission Center's tab rules;
  `ConversationThread.tsx`, `RunPolicySwitch.tsx`, `LiveDriveSwitch.tsx`, `ComposerSkills.tsx` and
  `authoring-v2.css` are byte-identical to trunk.
- **The walk.** Project C2C-101, then Author, then Open on the first document, then "Draft with AnA". The conversation
  opens beside the canvas.
- **The measure.** Each foot control's box against `.ct-conv`, and `elementFromPoint` at its centre, because a box
  alone reads a clipped element as visible.

| Case | Conversation column | Every control inside the column | Every control visible |
|---|---|---|---|
| 1440 light | 264–664 px (400 wide) | yes | yes |
| 1440 dark | 264–664 px (400 wide) | yes | yes |
| 1280 light | 264–609 px (345 wide) | yes | yes |

The measurements are in `r6-composer.json`; the screenshots are `r6-1440-light.png`, `r6-1440-dark.png` and
`r6-1280-light.png`.

## Seen on the way, for D4-5

The conversation is 400 px at 1440 and 345 px at 1280. The D4 spec (§D4.A acceptance, §D4.K) asks for
`clamp(420px, 38%, 560px)`, and D0's layout grid says the same. The canvas still draws two stacked bars: its own
`.dcv-bar` ("Documents", "Back to conversation", the title, "Esc") above the workbench's bar.

Both are D4-5, "the two placements" (§D4.A), which is not yet built. Changing only the width would narrow the editor's
page at 1280 without D4-5's single bar, so it waits for D4-5.
