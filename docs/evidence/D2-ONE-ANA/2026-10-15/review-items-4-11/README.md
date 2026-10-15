# Filing-spine design review, items 4 and 11: the half-field pair and the motion token

Launch row **D2**. Both were open in `.design/filing-spine/DESIGN_REVIEW.md` as global changes. Each is held by a check that was seen failing first.

## Item 4: two half-width fields are a pair, whatever precedes them

**What was wrong** (`client/src/concept2cure/v2/styles/journey-v2.css`).
- `.de-field.half:nth-of-type(odd)` gave the 12px gap. `nth-of-type` counts every `div` in the drawer body, so a pair after an odd number of fields lost its gap.
- The halves were `inline-block` on the baseline, so a field with a hint line dropped its partner.

**What changed.** The gap goes on the second of two adjacent halves (`.half + .half`); a third consecutive half starts the next row; the halves align to the top. The 6 half fields in the repository (4 files) are all pairs.

**The check.** jsdom does no layout, so `measure-half-fields.mjs` renders the real stylesheet in Chromium. It puts two halves (one with a hint line) after 0, 1, 2 and 3 fields, and measures their gap and row.
- `red/half-fields-red.txt`: 4 of 4 layouts fail. The tops never line up, and with 1 or 3 fields before, the gap is 0.
- `green/half-fields-green.txt`: 4 of 4 pair on one row with a 12px gap.
- Run: `node docs/evidence/D2-ONE-ANA/2026-10-15/review-items-4-11/measure-half-fields.mjs client/src/concept2cure/v2/styles/journey-v2.css`.

## Item 11: `--ease` is the ease-out its comment says

**What was wrong** (`design-system/colors_and_type.css`). `--ease` carries the calm-motion rule into 277 transitions. Its comment says "200ms ease-out, no overshoot", but its value was `cubic-bezier(0.4, 0, 0.2, 1)`, which `.claude/skills/motion-discipline/SKILL.md` names as its in-out curve, for crossfades.

**What changed.** The value is `cubic-bezier(0, 0, 0.2, 1)`: it decelerates and does not overshoot. The change is noted in the file.
- `documentCanvasPolish.test.tsx` cited the old value in a comment. The comment is updated, and its ease-out check passes on the new curve.

**The check.** `tests/ui/motion-token.test.ts` holds three properties: the curve starts at or above the diagonal, comes to rest at 1, and never leaves [0, 1].
- `red/motion-token-red.txt`: it fails on the old value.
- `green/motion-token-green.txt`: it passes, with `token-authority` and the canvas polish suite.

Gates: shadowing, text ramp, undefined classes, token cascade, design system, shell collisions, phantom tokens and class vocabulary are all green. Nearby suites (placement dialogs, send for review, `tests/ui`): 188 pass.
