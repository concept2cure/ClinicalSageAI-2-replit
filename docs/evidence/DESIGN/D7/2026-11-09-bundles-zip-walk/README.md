# Reporting Bundles: a saved pack's actions and the legal-companion chooser, walked in the running app (2026-11-09)

**Package:** D7. **Session:** the reporting session (`session_011HLkYC…`, lane L11).
**Why:** CLAUDE.md RULE 4 says a screen is not done until it is opened in the running app and used. The 2026-11-08
re-walk (`../2026-11-08-reporting-rewalk/`) opened the Bundles tab but did not use a pack's actions.

## What was run

The method is the re-walk's, with `capture.cjs` in this folder:
- a `git archive` copy of the commit, on port 5100, with `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on` and dev sign-in;
- the local `clinicalsage` database, migrated forward by the copy's `deploy-migrate` (runtime role `c2c`, not a
  superuser, no RLS bypass);
- `jm.smith@concept2cure.pro`, organisation 1;
- project C2C-101 (`e89b7009-…`), with its pack "C2C-101 readiness review pack" from the re-walk;
- Chromium at 1440×900 and 390×844, light theme.

The script opens Bundles and records every button in the tab panel (class, display, height, border). Then it opens
"Choose legal companions for ZIP" and records the chooser's text, the ZIP button, script errors and the page's
sideways overflow (`#c2c-page` scrollWidth − clientWidth). The filed script differs from the one run only by
`window.` before `getComputedStyle`, which the lint ratchet asks for; in the page the two are the same function.

## Found

1. **Five buttons had lost their style.** `9bd593c346` made `.rl-card-run` placement only. Five buttons used it as
   their whole style, so they rendered unstyled. The re-walk's `found/reporting-bundles-1440-light.png` shows the
   two Export buttons as bare text with the icon stacked above, and the chooser's button in the browser's default
   style. The five were:
   - Export manifest PDF;
   - Export reports PDF;
   - Choose legal companions for ZIP;
   - the two stationery buttons.
2. **At 390 the open chooser pushed the page sideways by 10px** (`found/probes.json`, `"390"…"overflow": 10`).
   - The `found/` captures are from `4720e0bf43`, the fix's first version, which gave the fieldset `min-width: 0` and
     was never pushed. It still measured 10px.
   - A probe of the innermost elements past the form named the ZIP button, a `.btn.primary` with
     `white-space: nowrap`: "Download reports and 0 selected legal originals (ZIP)". D0's `.btn` is a fixed 32px, one
     line.

## Fixed

- **`f4c27a3495`:** each of the five is now `btn ghost rl-card-run`, like the Catalog's Run.
  - A new test in `insightsBundleExport.test.tsx`, "leaves no button in the Bundles view without the .btn class", was
    red first, naming the three Bundles buttons.
  - The six bundle and legal-chooser suites pass 99 of 99.
- **`61498ef0bf`:** in `insights-v2.css`:
  - `.rl-form fieldset{ min-width:0 }`;
  - a `.btn` directly inside the chooser's fieldset may wrap: auto height, min 32px, normal white-space, left
    aligned.

At `61498ef0bf` (`fixed/`):
- 1440 and 390 both measure 0 overflow, with no script errors;
- the three Bundles buttons are `btn ghost rl-card-run`, with a solid border: 32px tall at 1440 and 44px at 390
  (the touch size).

## What the chooser shows here, honestly

- Organisation 1 has no company legal documents in this database. The chooser says "0 accessible registered
  version(s) match this search", and the ZIP button is disabled: `{"disabled": true}`.
- Nothing is attached automatically, and the chooser says so.

## Not covered here

- A ZIP export with real legal originals selected was not walked, because no legal original exists in this database
  to select. `tests/db/report-pack-export.dbtest.ts` covers the export path on real PostgreSQL.
- Only the light theme was captured. The change is layout only and introduces no colour.
- No model key is set, so nothing here exercises AnA.
