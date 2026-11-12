# Launch screens at phone width and in dark mode, in the running app (2026-11-12)

F1 audit, read-only on source. Taken from the lead's open list ("phone width and dark across the launch screens").
The 39 launch screens of the registry were each opened signed in, as the runtime role (`app_service`,
`RLS_ENFORCE=on`, launch gate on), in three views: 390 light, 390 dark, 1440 dark. Dark is the app's own setting
(`c2c-v2-prefs.dark`, the `.c2c-v2.dark` class), not the browser's colour scheme. Nothing is changed by the run.

    node docs/evidence/HUMAN-TEST/PHONE-DARK/2026-11-12/audit.cjs [base-url]

Results: `results.json` (per screen and view: sideways overflow, the elements that stick out, text below WCAG AA,
page errors, API calls answered 5xx). Screenshots: `screenshots/<screen>-<view>.png`. The run was made twice; both
gave the same findings.

## What already exists (RULE 3)

| Existing | What it does | What it does not |
|---|---|---|
| `scripts/visual-qa/check-contrast.mjs` (`npm run visual-qa:contrast`) | WCAG AA contrast, light and dark, measured in a real browser | Measures captured fragments with fixture data at 1440, not the signed-in app; states that only appear with live data (an empty list, a recorded date) are not in the captures |
| `scripts/visual-qa/check-overflow.mjs`, `check-live-overflow.mjs` (`visual-qa:overflow`, `visual-qa:live`) | Sideways overflow, fragments and the running shell at desktop pane widths, light | Not 390, not dark |
| `scripts/ci/check-token-contrast.mjs` (`ci:token-contrast`) | Token pairs meet their stated ratios | Says nothing about which token a rule uses on which background |
| Per-lane walks (J1–J5, D3-4, MDX journey, S11) | Their own screens at 1440 and 390, some in dark | No one pass over every launch screen |

`audit.cjs` is evidence for this pass (live, signed in, 390 and dark together), not a new gate. If the findings below
are to stay fixed, the place for that is the existing `visual-qa:live` (a 390 and a dark run), by its owner.

## Result

- **No screen scrolls sideways at 390**, in light or dark (overflow 0 on all 39).
- **No page error** on any screen in any view.
- **One API failure:** `device-510k` reads `/api/predicate-intelligence/candidates` and `/se-matrix`, both 503
  ("predicate universe not configured or stale") on this local database. Fail-closed by design; whether the screen
  says so plainly is for its holder to confirm on a database with the universe loaded.
- **Text below AA (4.5:1; 3:1 for large text).** Local database is sparse, so states that need data were not seen.

| Screen | Class (stylesheet) | Text seen | Light | Dark |
|---|---|---|---|---|
| tasks | `tb-empty` (`styles/app-v2.css`) | "No tasks" | 2.02 | 2.58 |
| project-home | `pj-act-n` (`styles/app-v2.css`) | activity date, "Nov 10" | 2.11 | 2.76 |
| ind-checklist | `indl-proj` (`styles/coverage-v2.css`) | "FDA receipt has not be…" | 2.02 | 2.58 |
| ind-checklist | `indl-h-x` (same) | "— 21 CFR 312.23(a)(1)" | 2.11 | 2.76 |
| ind-checklist | `indl-place` (same) | "eCTD m1.2" | 3.66 | 4.00 |
| device-510k | `status-pill` (`styles/surface-text-ramp.css`, `admin-access.css`) | "empty" | 1.91 | 2.41 |
| device-510k | `estar-num` (`mdx/app.css`) | "§" | 3.90 | 4.29 |
| audit-trail | a bare `span` | "--" (an empty cell) | 2.02 | 2.58 |
| home | `landing-eng-ana` (`styles/surfaces-v2.css`) | "AnA" | 3.12 | 4.24 |
| home | `landing-eng-mode` (same) | "Standard" | passes | 3.93 |
| home | `landing-mark` (same) | "✻" (large; needs 3) | 2.96 | passes |
| admin-console | `adm-avatar`, `adm-drawer-avatar` (`styles/admin-access.css`) | the initial | passes | 2.96 |
| document-authoring | `ed-spark` (`styles/authoring-v2.css`) | "✻" | 2.96 | passes |
| submission-center | `sp-row-s` (`styles/journey-v2.css`) | "·" | 4.23 | passes |
| dispatch-readiness | `ped` (`styles/coverage-v2.css`) | "Registry" | 4.49 | passes |

The first six rows are text a person has to read (an empty state, a date, a regulation cite, a status) at about
2:1 to 2.8:1: these are the ones worth fixing before GA. Most come from one cause, the faintest text token on a
page or tinted background (`app-v2.css` itself records `--text-400` at 3.37:1 light, 4.27:1 dark); one step up the
ramp clears them. The marks and separators (✻, ·, §) are decorative or near the line.

S11's own screens (the Plan step, a task's sheet, Projects' line, the global schedule) have no finding in any view:
`../../../SPINE/S11/2026-11-11-ga-readiness/README.md`, "Dark mode, 2026-11-12".

## Not covered

Drawers, dialogs and menus (only each screen's first view was measured); states needing data this database does not
have; focus rings and non-text contrast; widths between 390 and 1440.

## Who each finding goes to

No source file is edited here: every stylesheet above is another lane's. Addressed in
`.design/claude-convergence/COORDINATION.md` (this lane's row) to the holders it names: the shell lane (L7, named
rules in `app-v2.css`) for `tb-empty` and `pj-act-n`; the IND lifecycle lane (L4) for the `indl-*` rules; the device
lane (K510, `mdx/app.css`) for `status-pill` and `estar-num`; client administration for `adm-*` and the audit
trail's empty cell; D4's holder for `ed-spark`; the design lead for the landing page.
