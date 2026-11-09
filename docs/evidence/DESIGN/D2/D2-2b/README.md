# D2-2b: the registry picker reads as Claude's (the New project wizard's filing step)

**Plan:** D2 (D2.md §2.4 item 9, §2.6 items 1–2). It was handed over by the coordinating session, which had held it,
on 2026-11-09. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **Turn:** `styles/app-v2.css`, the `.rpk-*` block
only. It is held in `.design/claude-convergence/COORDINATION.md` and released with this commit. **Markup:** none
changed. `RegistryPicker` (`AnaVerbs.tsx`, D1's) is untouched.

## What already exists (RULE 3)

| Piece | Path | Did | Did not |
|---|---|---|---|
| The values | `docs/evidence/DESIGN/D2/D2-2/README.md`, "Deferred" | Every `.rpk-*` value to replace, by rule | Apply them: `app-v2.css` was another lane's turn |
| The picker | `surfaces/AnaVerbs.tsx` `RegistryPicker`; its one caller, `Projects.tsx`, the wizard's step 1 | The filing catalogue | — |
| The look test | `__tests__/newProjectWizardLook.test.tsx` | Pins the wizard's `.npw-*` block as text | Read `.rpk-*` |

## What changed

There is no markup, screen or token change. The values are the D2-2 README's, applied as written.

- **Tabs** (`.rpk-tab`).
  - 36px high, 14px, weight 500, `--text-300`.
  - The chosen tab is `--text-100` text with a `--text-100` underline, weight 500. It was `--accent-200`, weight 600.
  - The counts are 12px `--text-300`.
- **Cards** (`.rpk-type`).
  - Radius 12 (`--radius-xl`), a 1px `--border`, `12px 14px`.
  - On hover, `--bg-050` with `--border-strong`.
  - **The chosen card is `--bg-050` with a `--text-100` border and an inset 1px `--text-100` ring.** It was orange.
  - The name is 14px.
  - The grid's gap is 8px, and it is one column at 720px or narrower.
- **Chips** (`.rpk-chip`). 12px, `--radius-md`, `--bg-100` with `--text-200`. The agency, region, dossier and CTD
  variants were tinted `--ai`, `--success`, accent and `--warning`. They now share the neutral style: they are facts,
  not statuses.
- **Filters and search.**
  - Filter chips are 24px, `--bg-000`, 12px `--text-200`. **A chosen chip is `--text-100` border and text**; it was
    orange.
  - The label is 13px `--text-300`.
  - The search is 36px with a 14px input. Its icon, placeholder and clear are `--text-300`.
- **Notes.** The result note, the empty state and the category heads are 13px `--text-300` or `--text-200`. The
  tier heads use `--fs-section` and `--fs-small`.
- **`surface-text-ramp.css`**, regenerated (`node scripts/design/generate-surface-text-ramp.mjs`). The chips moved to
  `--bg-100` and the filter chips left it.
  - Without the regeneration, `ci:surface-text-ramp` reports the v2 ramp stale (`text-ramp-red.log`).
  - With it, the ramp passes (`text-ramp-after.log`). It passed at HEAD before this change too (`text-ramp-before.log`).

**Not changed.** D0 §4.7 lists `.rpk-tab` among the retired tab names, to converge on `.tabs` and `.tab`. That is a
markup change in D1's `AnaVerbs.tsx`, so it is not done here.

## Red first

- **The pins.** `newProjectWizardLook.test.tsx` gains "the registry picker reads as Claude's", five cases, read from
  `app-v2.css` as text:
  - no accent or status colour anywhere in `.rpk-*`;
  - the ink underline, the ink ring and the ink filter chip;
  - the neutral chips;
  - no text below 12px and no ink below `--text-300`;
  - the one-column grid at phone width, and radius 12.
- **Red.** On trunk's `app-v2.css` the five fail and the existing 17 pass (`look-red.log`). With the change, all 22 pass
  (`look.log`).
- **The related suites.** The 22 suites that render the picker or the wizard, plus the D0 foundations guards, pass:
  287 cases (`tests.log`).
- **Gates.** These pass: `ci:check-phantom-tokens` (no new phantom token), `ci:undefined-css-classes`,
  `ci:check-css-selector-shadowing`, `ci:check-chip-tones`, `ci:token-cascade`, `ci:token-contrast` (131 pairs) and
  `ci:design-system`.

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) opens New project from Projects. It chooses the first filing card
and a filter chip, then measures computed styles at 1440 and 390, light and dark:
- the chosen tab's text and underline are the ink colour;
- the chosen card's border is ink, with an inset ink ring;
- the chosen filter chip is ink;
- no `.rpk-*` element is drawn in the accent colour;
- at 390 there is no sideways scroll.

Screenshots: `filing-step-1440-light.png`, `filing-step-1440-dark.png`, `filing-step-390-light.png`,
`filing-step-390-dark.png`.
