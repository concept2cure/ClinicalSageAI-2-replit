# D0-17: mono text never reads below the 12px floor (2026-11-09)

**The finding.** `docs/evidence/DESIGN/D0/D0-5/README.md`, "Found in review, for D0":
- `.mono` is `0.8125em` in `design-system/colors_and_type.css`, and the v2 rule `.c2c-v2 .mono` set only the face.
  So at the 14px root, a regulatory code (a CTD section, a sequence number) rendered at 11.4px, under D0 §3's floor:
  no text below 12px.
- Five v2 rules set mono at 10 to 11px outright.

This was the last open item of the D0-5 review's follow-ups.

## What already exists (RULE 3)

- **`design-system/colors_and_type.css`** `code, kbd, pre, .mono { font-size: 0.8125em }`: the design system's own
  proportion. It is unchanged.
- **`client/src/concept2cure/v2/styles/app-v2.css`:**
  - `.c2c-v2 .mono` (the face only);
  - `.scaf-row .mono` 11px;
  - `.gov-mv.mono` 10.5px;
  - `.pv-det-grid .v.mono` 10.5px;
  - `.pv-ver-row .mono` 10px;
  - `.adc-note .mono` 10px.
- **`__tests__/foundationsReadmeClaims.test.ts`** holds the README's "no text below 12px" as a ratchet. It counted
  1,190 sub-12px declarations at trunk, against a baseline of 1,200.

## The change

- **`.c2c-v2 .mono`** is `font-size: max(12px, 0.8125em)`. It keeps the design system's proportion wherever that is
  12px or more (in a heading, prose or a 16px document), and floors at 12px in body and caption text.
- **The five rules** are 12px.
- **The ratchet's baseline** is lowered to the measured count, 1,185. That takes in these five and the ten that other
  sessions had removed since the baseline was set.

**The turn on `app-v2.css`:** taken by the coordinating session for this one commit, after S12 released its `.rpk-*`
turn (S12 told), and released with this commit.

## Red, then green

- **Red at HEAD** (`red-at-head.txt`). Two new cases in `__tests__/d0SpecDecisions.test.ts` fail:
  - the base mono rule had no size;
  - five mono rules were under 12px, named.
- **Green** (`green.txt`). `d0SpecDecisions`, `foundationsReadmeClaims` (at 1,185) and `d0Primitives`: 54 of 54.
  Every test reading app-v2.css passes, except one pre-existing failure in `projectHomeStageCss`, which comes from
  S12's `aebc5dad41` defining `.btn` in the project-page block. It was sent to S12, and this change does not touch it.

**Gates:** `ci:check-css-selector-shadowing`, `ci:undefined-css-classes`, `ci:surface-text-ramp` and
`ci:design-system` pass. ESLint is clean on both tests.
