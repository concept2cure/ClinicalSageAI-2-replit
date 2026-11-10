# D7-D evidence: Reporting & analytics and Audit & compliance reports, in the running app

**Package:** D7 (`docs/design/one-design-plan.json`), step D7-D, `.design/claude-convergence/D7.md` §D. **Lane:** L11,
the reporting session (`session_011HLkYC…`). **Date:** 2026-11-02 UTC. CLAUDE.md RULE 4: "A screen is not done until
it was opened in the running app and used." This folder is that opening.

## What already exists (RULE 3)

Nothing in D7-D is new. It finishes existing surfaces and puts them on the D5 §WA work-area pattern.
- `client/src/concept2cure/v2/surfaces/Insights.tsx` is the Reporting & analytics canvas (registry `insights`).
- `InsightsCatalogPanel.tsx` and `insightsLibraryShared.tsx` are its Catalog and its views.
- `ComplianceReports.tsx` is Audit & compliance reports (registry `compliance-reports`).
- `styles/insights-v2.css` is the stylesheet.

The primitives used are D0's: `.ph`, `.pj-back`, `.c2c-input`, `.btn`, `.sp-starters`, `.tabs`, `.seg`, `.pj-card`,
`.pj-sec-h` and `.pj-more`. Search run: `rg -n "data-work-area|pj-back|sp-starters" client/src/concept2cure/v2`.
No new screen, route, service, table, mount or component file was added.

## What was run, and against what

- **Commit:** `9bd593c346a3117ce9ee53de52b70f12f0f5e351`. It is the head of this lane's local `concept2cure-v2`
  when the run began, and it carries every D7-D commit:
  - `f58089a336`: steps 1–2;
  - `209a8964bf`: steps 3 and 5;
  - `fc9dbb57a7`: steps 6–7;
  - `002ab41e13`: steps 4 and 8;
  - `44f574f70e`: step 9;
  - `9bd593c346`: the fixes this run found; see below.

  A first pass at `09f8a3869b` found four defects. They were fixed in `9bd593c346`, and every capture here was
  retaken from it.
- **Copy:** the tree came from `git archive 9bd593c346`, extracted into an empty scratch directory, so the shared
  working tree was not touched.
  - `node_modules` was symlinked to the main tree's.
  - The copy's `vite.config.ts` was given its own `cacheDir` (`.vite-cache`).
  - `.env` was copied in.

  This is the method of `docs/evidence/DESIGN/D0/after/README.md`.
- **Database:** this container's local Postgres 16 (`/var/lib/postgresql/c2c-local`, port 5432), database
  `clinicalsage`. It is not the instance the D0 run used: that one held `c2c` with the demo already seeded.
  - It began single-role, at 214 of 461 migration files. The runtime role `c2c` owned everything and lacked
    CREATEROLE, so the copy's `scripts/db/deploy-migrate.mjs` stopped at
    `db/migrations/20260617_audit_logs_immutability.sql` ("permission denied to create role").
  - It ran again as split roles: `DATABASE_OWNER_URL` = `postgres` over the local socket, runtime `c2c`
    (`RUNTIME_DB_ROLE=c2c`). It applied all 461 files. Its readiness contract then refused once, because `c2c` owned
    the 30 append-only tables, which would let the runtime role update or delete audit rows. Those 30 tables were
    moved to `postgres` (`ALTER TABLE … OWNER TO postgres`), which is the re-provision the refusal names.
  - The third run passed:
    - "Schema migration complete — safe to roll services";
    - grant audit 1215 of 1215 for `c2c`;
    - nothing beyond the audit ceiling.

  `c2c` is not a superuser and has no BYPASSRLS, so tenant policies applied to every request.
- **Demo data:** `scripts/demo/launch-demo/seed.mjs --pack biotech`, run through the product's API on the server
  below, as `jm.smith@concept2cure.pro` (organisation 1, enterprise plan).
  - It created 197 records, among them the project "[Demo · Biotech] C2C-101 anti-IL-23p19 mAb — plaque psoriasis
    (IND)" (`e89b7009-bb05-4060-8bc0-6da509648e95`), its IND submission and sequence 0000, the vault documents and the
    CMC records.
  - The overview read for it is `state: lead`, `readiness: 0`, `criticalBlockerCount: 4`, `status: missing`.
  - Shadow Review and the dispatch narrative did not run: no model provider is set, and the seed records both as
    "not executed".
- **Server:** `tsx server/index.ts` in the copy, with:
  - `PORT=5100 RLS_ENFORCE=on LAUNCH_SCOPE_ENFORCE=on NODE_ENV=development ALLOW_DEV_AUTH=1
    ALLOWED_ORIGINS=http://127.0.0.1:5100`;
  - random `JWT_SECRET`, `JWT_SECRET_DEV`, `REFRESH_TOKEN_SECRET` and `SESSION_SECRET`.

  `/readyz` showed database, schema and storage `ok`, and `ana` `down` (`no_provider`). Reporting is computed by
  deterministic engines and does not need AnA. Each server was stopped by killing only its own processes, checked by
  `/proc/<pid>/cwd` being under the copy. Postgres was left running.
- **Identity:** `jm.smith@concept2cure.pro` through `POST /api/auth/dev-login`. The session was stored the way
  `scripts/visual-qa/check-live-overflow.mjs` stores it.
- **Browser:** Playwright with Chromium 141.0.7390.37, at **1440×900** and **390×844** (`isMobile`, `hasTouch`),
  light and dark. Dark is `localStorage` `c2c-v2-prefs` with `dark: true`. The rail is expanded and the AnA panel
  closed. Screenshots are full-page.
- **Script:** `capture.cjs` in this folder, run as `node capture.cjs <outdir>`.

## Screens and files

Every file is `<screen>-<width>-<theme>.png`: 4 screens × 2 widths × 2 themes = 16. `probes.json` holds the in-page
measurements for each, and the back link's result per size and theme.

| Screen | File key | How it was reached |
|---|---|---|
| Reporting & analytics, the Reports view | `reporting` | `/concept2cure/insights?program=<id>` |
| A find, run from the first suggestion | `reporting-find` | Reporting, then **How ready is C2C-101 to file?** |
| The Catalog, previewing Standard | `reporting-catalog-preview` | Reporting, then the **Catalog** tab, then **Preview plan → Standard** |
| Audit & compliance reports | `compliance-reports` | Reporting, back on **Reports**, then the header's **Audit & compliance reports** |

After each `compliance-reports` capture, the run clicked its back link. All four (2 sizes × 2 themes) returned to
`data-work-area="insights"`.

## Against D7.md §D.6 (acceptance), from `probes.json`

| Acceptance | Measured | Result |
|---|---|---|
| One column at every width | The work area's children share one left edge in all 16 captures. In order: `.pj-back`, `.ph`, `.rc-find`, `.sp-starters`, the result, the views, the `pj-more` footer | holds |
| The find field directly after the header | `.rc-find` is the next child after `.ph`, with the suggestion row under it (D.3's drawing; §D.4 step 3) | holds |
| A suggestion runs the router and shows the result under it | `reporting-find-*`: the result region holds text, and the digest it ran is open in the views | holds |
| "Preview plan" changes the locks and says it is a preview | `reporting-catalog-preview-*`: Standard is pressed; "Previewing Standard. Your organization's plan is Enterprise." with **Back to Enterprise** sits above the views | holds |
| Orange fills: 1 (the preset) | Reports view: 1 (**Build the BLA assembly pack**), on all 4. Catalog: 1, on all 4 (19 before this run's fix). Audit & compliance reports: 1 (**Run attestation**) | holds; see "Seen, not changed" for an open report |
| At 390 the reports are reachable without scrolling past a builder column | `reporting-390-*`: Standard packs are on the first screen. No page overflow (`#c2c-page` scrollWidth − clientWidth = 0, document 0) on any capture | holds |
| The facts stay stated (§D.4 step 4 note, HS-1008-1) | The sub reads: "Governed reports for C2C-101. C2C-101 scores 0% on submission readiness, with 4 critical gaps outstanding. Every value is computed from the governed record; nothing is estimated." No "ready" | holds |
| Back link | Reporting names the project ("[Demo · Biotech] C2C-101 anti-IL-23p19 mAb — plaque psoriasis (IND)"). Audit & compliance reports reads "Reporting & analytics" and returns there | holds |
| No script errors | `pageErrors` is empty on all 16 | holds |

## What the first pass found, and what changed (`9bd593c346`)

The first pass at `09f8a3869b` used the same stack and script.

1. **The back link read "Project".** A project opened from `?program=<id>` reaches the shell as an id with no title.
   The link now names the project from the canvas's read, then from the shell's name for it. It says "Project" only
   when neither exists. A new test in `insightsOpenProgram` was red without the change (`expected ' Project' to
   match …`) and is green with it.
2. **At 390, Find fell under the field.** `.c2c-input` is `width:100%`, which takes a whole line in a wrapping row.
   The field now takes what Find leaves.
3. **The Catalog showed 19 orange fills:** the header's primary, plus a filled **Run** on each of the 18 runnable
   cards. Each card's Run is now D0's `btn ghost`.
4. **Audit & compliance reports scrolled sideways by 4px at 390.** One basis tag, "21 CFR 820 (QMSR: ISO
   13485:2016 by reference)", was `white-space: nowrap`. It now wraps inside its card.

## Seen, not changed (outside D7-D's steps)

- **An open report has a second orange fill.** It is the report's own **Export PDF** (`.sp-primary`), in
  `reporting-find-*`.
- **"Build the BLA assembly pack" is offered on an IND.** The preset is `roPresetsForSeg(seg)[0]`, chosen per client
  segment (Biotech), not per filing. Its card says what it is for ("For closing gaps before a BLA is filed").
  Choosing packs by filing type is a behaviour change, not a D7-D step.
- **The digest prints a raw enum.** In `reporting-find-*`, the Executive Readiness Digest's "Readiness level" tile
  reads `not_ready`, not words. The value comes from the report renderer's block data, not from D7-D's markup. The
  figure beside it ("0%") and the summary line ("Submission readiness 0% (not ready)") are worded.
- **At 390 the suggestion row and the tabs scroll sideways inside themselves.** That is the shared row and tab
  design, which CMC also uses. The page does not overflow.

## Not run here

- No model provider is set, so nothing here exercises AnA. D7-D removed AnA's look from the reporting pane; it did
  not add AnA behaviour.
- The other D7 steps (A–C) are other lanes'.
