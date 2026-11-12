# P-122 — CMC / Module 3: what was hidden comes back, and what was built is reached

Founder decision P-122 (2026-11-10), item 6: "CMC / Module 3 next, from its own inventory". The inventory is
`docs/evidence/DESIGN/P-122/inventory/cmc.md`. The work is ordered the way a paying CMC team ranks it.

Instance for every screenshot: `c2c_rr5_phone_instance`, organisation 5, port 5264, signed in as the rr5 author.
CMC opened on **C2C-201** (the small molecule, the one demo project whose Module 3 composes under P-28), and on
**C2C-101** for the agency-question screenshots (its fictional FDA information request).

## What already exists (RULE 3)

Every item below completes, reaches or fixes something that existed. None is built beside an existing one.

| Item | What already existed, by path | What it did not do |
|---|---|---|
| 1. Visible page | `CmcModule.tsx` `CMC_NAV` (nine destinations with `blurb` and `now`), `CmHalves`; `ProjectStages.tsx` (the project page's "Next: …" wording for its stages) | Showed only the open half's tabs; `now` reached AnA only |
| 2. Demo data | `scripts/demo/launch-demo/packs/work-areas.mjs` `ensureCmc` (7 registers); the 11 register create routes in `server/api/cmc/routes.ts`; the register forms' body builders in `cmcRegisterForms.ts` | Wrote none of the other 11; results without condition or reading; no recorded agency question |
| 3. Stability chart | `server/services/cmc/shelf-life.ts` `estimateShelfLife`; `recorded-stability.ts` `estimateRecordedShelfLife`; `POST /api/cmc/stability-studies/:id/shelf-life` | Returned no band to draw; no chart anywhere in CMC |
| 4. f2, M7, Q3 | `services/cmc/dissolution-comparison.ts` `compareDissolutionProfiles`; AnA `compare_recorded_dissolution` (`AnaToolExecutor.ts`); `services/cmc/impurity-assessment.ts` `assessRecordedImpurity` (Q3A/Q3B, Q3C, Q3D, M7) | No HTTP route; nothing on the registers |
| 5. Batch edit, change create | `PUT /api/cmc/batch-records/:id` (`batchRecordRoutes.ts`, audited since 2026-11-09); `POST /api/cmc-changes` (`cmc-changes.routes.ts`); the reach sweep `cmcWorkAreaReach.test.ts` | No caller; the sweep was verb-blind and did not sweep `/api/cmc-changes` |
| 6. Agency questions | `AgencyResponses.tsx` (the letter's controls, Part 11 approval), `cmcAgencyQuestions.tsx` (read-only index) | CMC could only send the person to Communication |

Searches run beyond the inventory's: `git log -S` on `StageBand`, `CmHalves`; greps for `recharts`, `<svg`, `polyline`
in `client/src` (recharts is declared in `package.json` and imported nowhere; v2 charts are inline SVG:
`RbmSurfaces.tsx`, `Insights.tsx`); every caller of `assessRecordedImpurity`, `compareDissolutionProfiles`,
`estimateShelfLife`; every enforcement site of the composition boundary (below).

## The commits

| # | Commit | Package | What |
|---|---|---|---|
| 1 | `24603881c` | D5 | All nine tabs in one row; each tab's sentence as one quiet line with its next step (first worded "What to do now: … Next step: …"; reworded by the ratchet fix below) |
| 2 | `cb1a07cc6` | DATA | C2C-201 fills the other 11 registers |
| 2 | `aef73a9d1` | DATA | Seeded stability results carry their condition and reading (Q1E had refused every study; the register counted 14 results out of limits) |
| 2 | `7952824e7` | DATA | Characterisation rows record a measured result |
| 3 | `c1985a793` | S7 | `estimateShelfLife` returns `band`; the recorded estimate returns its `observations` |
| 3 | `ac48fe411`, `89d37316b` | D5 | The Stability register estimates on open and draws each fit |
| 4 | `34d66b559` (see below) | R1 | `POST /api/cmc/dissolution-profiles/compare`, `GET /api/cmc/impurity-profiles/assessment`; the AnA tool and the route share `compareRecordedDissolutionProfiles` |
| 4 | `e30adf066` | D5 | "Against the guideline" column on Impurities; "Compare two profiles" on Dissolution |
| 5 | `3aa0e6f34` | R1 | Batch edit with a reason; the reach sweep reads the verb |
| 5 | `fcc2de483` | R1 | The deferred variation assessment records the classified change via `POST /api/cmc-changes` |
| 6 | `9e9bc42ff` | R1 | "Answer here" opens the letter's own `AgencyResponses` inside CMC |
| 6 | `7ea7af0e4` | DATA | The demo IR letter's three questions are recorded with their CTD sections |
| — | `687d0af9d` | D5 | A wide CMC register scrolls inside its section, not the page (found in the after screenshots) |
| — | `a74b223a9` | D5 | On a phone, the per-study tables' Detail column keeps 240 px (rows had stood several hundred px tall) |
| — | `2099ae50b` | D5 | The per-study Q1E tables scroll in place: on a phone, Stability pushed the page 241 px sideways (found in the after screenshots) |
| gate | `a73fb22f3` | R1 | `ci:launch-scope-api` green: the CMC surface claims `/api/cmc-changes`, which refuses itself (409) under launch scope |
| 6 | `23324cc55` | R1 | Fix to `9e9bc42ff`: the letter's controls are given its type (they read "undefined" in five labels and prompts); found by the focused typecheck |
| gate | `7ec909c63` | D5 | Retired-name ratchet green: "Next: …" in place of "What to do now / Next step"; six new `cm-meta` uses replaced |

**`34d66b559`.** The HTTP half of item 4 (`server/api/cmc/routes.ts`, `server/services/cmc/dissolution-comparison.ts`,
`server/services/ana/AnaToolExecutor.ts`, `server/api/cmc/__tests__/register-engines-reached.test.ts`, and
`4-register-engines/red-routes.txt`, `green-routes.txt`) was staged when another session committed, and the sessions
share one git index: it landed inside that session's commit, "The Plan step shows section owners, deadlines and
milestones…" (`Plan: R1`, so the gate passes). The content is exactly what was staged. Every later commit here is
pathspec-limited (`git commit -- <paths>`) so it cannot happen again from this side.

## Two pre-push gates the work turned red, and their fixes

| Gate | Red | Fix | Green |
|---|---|---|---|
| `ci:launch-scope-api` | `5-batch-edit/red-launch-scope-api.txt`: `[unmapped] /api/cmc-changes`, called by `cmc` since `fcc2de483`; `red-cmc-changes-launch-scope.txt`: the route answered under launch scope | `a73fb22f3`. The route's own checks were read first: behind `authMiddleware`, 403 without an organisation, org-scoped rows, editor-only writes, 404 on another organisation's CMC project. A claim admits the path in production, and its answers carry the post-approval FDA/EMA categories P-28 withholds, so the router refuses itself 409 `CMC_VARIATIONS_OUT_OF_SCOPE` while launch scope is on, as `POST /api/cmc/variations/classify` does | `5-batch-edit/green-launch-scope-api.txt` ("none refused"); `cmc-changes-read.test.ts` 14 of 14 |
| Retired-name ratchet (`foundationsRetiredRatchet.test.ts`) | `1-visible/red-retired-ratchet.txt`: `cm-meta` 84 → 90, `What to do now` 0 → 1 | `7ec909c63`. The line keeps its guidance and action, worded as `ProjectStages.tsx` words its stages: the tab's sentence, then "Next: <tab> →". The chart caption and the f2 scope are `p.sec-sub`; the verdict cell's plain states use the cell's ink and a failed read is an error chip; the f2 refusal's list is `cm-f2-needs` | `1-visible/green-retired-ratchet.txt` (with `cmcAllTabsVisible`, `cmcRegisterEngines`, `cmcStabilityChart`: 90 of 90) |

`launch-scope-api-gate.test.ts` "judges a path as Express routes it, whatever its letter case" (`/api/mdx/qms/Readiness`)
fails identically with `HEAD`'s registry before `a73fb22f3`; it is not this work's.

The two ratchet evidence files were staged a moment before another session committed, and landed in its commit
`0b2d79c3d` ("Post-market route: …", `Plan: R1`), unchanged. The code of the fix is `7ec909c63`.

## Red and green, per item

| Item | Red (before the change) | Green |
|---|---|---|
| 1 | `1-visible/red.txt`: `cmcAllTabsVisible.test.tsx` 4 of 4 failed (no single tab row, no "what to do now" line) | `1-visible/green.txt` |
| 2 | `2-demo-data/red.txt` (all 11 registers empty after the seed), `red-stability-readings.txt` | `green-unit.txt`, `green-stability-readings.txt`; seed runs `seed-run-1.txt` (24 rows, 21 sections composed), `seed-run-2-rerun.txt` (0 created: idempotent), `seed-run-3-readings.txt` |
| 3 | `3-stability-chart/red-engine.txt` (5 of 5: no band), `red-chart.txt` (4 of 4) | `green-engine.txt`, `green-chart.txt` |
| 4 | `4-register-engines/red-routes.txt` (6 of 6), `red-registers.txt` (4 of 4) | `green-routes.txt`, `green-registers.txt` |
| 5 | `5-batch-edit/red-1-verb-aware-sweep.txt` (the verb-aware sweep found 5 routes), `red-2-batch-edit-only.txt` (after 4 were confirmed by hand: only `PUT /batch-records/:id`), `red-3-batch-edit-render.txt` (3 of 3), `red-4-cmc-changes-create.txt` (`POST /api/cmc-changes`), `red-5-proposed-change-render.txt` (2 of 2) | `green.txt` |
| 6 | `6-answer-here/red.txt` (2 of 2), `red-green-letter-questions.txt` (0 recorded questions before the seed); `red-letter-type.txt` ("Questions and responses for undefined") | `green.txt` (with the AgencyResponses suites); `green-letter-type.txt` (50 of 50), `typecheck-letter-type.txt` |

Each red was run against the code as it stood before the change (the file at `HEAD`, put back afterwards).

## Screenshots (`screenshots/`)

Before is `5c248bb7a` (the session's start); after is the final commit. 1440×900 and 390×844, light and dark.

- `before-<tab>-<w>-<theme>.png` and `after-<tab>-<w>-<theme>.png` for `overview`, `materials` (Substance & product),
  `stability`, `batch`, `pathway` (Approvals & audit).
  - Before: four or five tabs and the "Module 3 | Study records" toggle; no "what to do now"; empty registers.
  - After: nine tabs in one row with a hairline between the groups; the tab's sentence as one quiet line, then
    "Next: <tab> →".
  - The 390 dark "before" set was re-shot after the first attempt landed on the sign-in page: the four pre-change CMC
    files were put back from `5c248bb7a` in the working tree for three minutes, shot, and restored from `HEAD`. Its data
    is today's seeded data.
- `after-charts-stability-*.png`: the Q1E charts (results, fitted mean, one-sided 95% bound, specification, shelf life).
- `after-impurity-verdicts-*.png`, `after-f2-compare-*.png` (C2C-201 Specifications tab): the verdict column; f2 76.8,
  similar, over 10/15/20/30 minutes, 12 and 12 units.
- `after-answer-here-*.png` (C2C-101 Approvals & audit): the letter's controls opened inside CMC on question 1.

Measured with the probe in each run (sideways page overflow): before — Stability 120 px at 1440; after — 0 px on every
tab at both widths. The after run found Stability at 390 px pushed 241 px sideways by the Q1E fit tables, now on screen
on open; fixed in `2099ae50b` (`3-stability-chart/red-subtable-overflow-390.txt`, `green-subtable-overflow-390.txt`).
The after shots of every tab were retaken after the ratchet wording fix (`7ec909c63`), and Stability's after that.

## Biologic refusals: composition, or capture and analysis?

P-28's boundary (`server/services/cmc/composition-scope.ts`) is unchanged. Where a biologic is refused today:

| Route | Code path | What it refuses | Reading |
|---|---|---|---|
| `POST /api/cmc/module3-os/compile/:projectId` | `module3OperatingSystemRoutes.ts:203` → `module3-compile.ts` `compositionRefusal` | Composing §3.2 | **Composition** — P-28 as decided |
| `POST /module3-os/build-section/:p/:key` | `module3ConvergenceRoutes.ts:152` | Composing one section | Composition |
| `POST /module3-os/sections/:p/:key/refresh` | `module3OperatingSystemRoutes.ts:1018` | Re-composing | Composition |
| `GET /module3-os/build-state/:p` | `module3BuildStateRoutes.ts:166` | The build board | Composition |
| `POST /module3-os/place-into-submission/:p` | `module3OperatingSystemRoutes.ts:1126` → `place-module3-into-submission.ts:486` | Placing Module 3 into a sequence | Composition |
| `GET /api/cmc/quality/qbd/:p` | `routes.ts:2503` `refusedAtCompositionBoundary` | CQA/CPP derivation | **Mixed.** ICH Q8/Q9 are modality-neutral; the analyser derives CQAs from small-molecule specification patterns, so the refusal protects content, not data |
| `POST /api/cmc/ich-compliance` | `routes.ts:2527`, same helper | The ICH check | Composition-adjacent: its rules include Q3A/Q6A, which do not apply to a biologic |
| `POST /api/cmc/control-strategy` | `routes.ts:2591`, same helper | Control strategy draft | Composition-adjacent (a drafted §3.2.S.4.5/§3.2.P.5.6 basis) |
| `POST /api/cmc/stability-studies/:id/shelf-life` | `routes.ts:2651` `studiesRefusedAtCompositionBoundary` → `study-composition-scope.ts` | ICH Q1E regression and shelf life | **Blocks modality-neutral analysis.** The least-squares fit and its bound are not small-molecule specific; ICH Q5C limits *extrapolation* for biologics, which the engine's own Q1E allowance could state instead of refusing the fit. The chart (item 3) therefore says the refusal for a biologic study |
| `POST /api/cmc/stability-studies/poolability` | `routes.ts:2876`, same | ICH Q1E ANCOVA | **Blocks modality-neutral statistics** (batch poolability is an F-test) |
| AnA `estimate_recorded_shelf_life`, `assess_recorded_batch_poolability` | `AnaToolExecutor.ts` (imports `study-composition-scope` at 17898 and 18131) | The same two | Same as above |
| `GET /api/cmc/impurity-profiles/assessment` (new, item 4) | `routes.ts:1739` `refusedAtCompositionBoundary` | Q3A/Q3B/Q3C/Q3D/M7 verdicts | Composition: Q3A/Q3B are small-molecule guidelines, and applying them to a biologic is one of P-28's stated reasons |

**Not refused for a biologic** (data capture and modality-neutral analysis work today): every register's create, read
and edit (`server/api/cmc/routes.ts` registers, `specificationRoutes.ts`, `batchRecordRoutes.ts`, including batch
release); the write-through to the canonical source layer (`services/cmc-write-through.ts` has no boundary); stability
results, close-out under signature, and out-of-trend trending (`POST /stability-studies/:id/trending`); process
capability (`GET /projects/:id/process-capability`); dissolution f2 (`POST /dissolution-profiles/compare`, new); the
agency questions. Nothing was changed at any of these sites.

## Not in scope, found

- **`/api/stability`** (`server/src/routes/stability.router.ts`): 71 handlers, claimed by no surface in
  `shared/constants/ui-surface-registry.ts`, so production refuses it as unmapped. It is a second stability store
  (`stab_*`) beside `stability_studies`. Converging its operations (pull calendar, samples and chain of custody, OOT
  rules, CAPA from OOT, protocol templates, CSV import) onto the CMC study record is the work; claiming the prefix alone
  would ship two stability records.
- **Change classification**: the server classifier (`/api/cmc/variations/classify`, FDA and EMA only) renders only
  where launch scope is off (P-28 withholds post-approval categories from an IND release). An IND customer needs
  IND-amendment classification (21 CFR 312.31), which does not exist. `/api/cmc-changes` remains a second change store
  beside `/api/cmc/change-control`; its create is now reached from the deferred assessment only.
- **Legacy QC, EBR, supply chain**: `/api/qc` storage is mostly stubs (26 `NOT_IMPLEMENTED` in `server/storage.ts`);
  no EBR/MBR or supply-chain router is mounted in `server/bootstrap/` (their UIs were deleted by founder directive in
  `7a144fd1e`/`bb243dfad`). Each is a founder product decision, not restoration.

## Not done

- **ICH Q6A/Q6B reference test sets beside Specifications: done on 2026-11-12**, item 7
  (`7-spec-reference/README.md`). The CMC screen claims the one route it calls,
  `/api/global-ri/cmc/specifications`. Still unreached from CMC, from the same inventory row: the Q1A stability
  zones and the process-validation framework.
- The full-repo typecheck (`tsc -p tsconfig.json`) was killed by the out-of-memory killer three times: the sessions
  share one 14.3 GB memory cgroup with several dev servers and other typechecks. Every changed TypeScript file (53,
  with every `.d.ts`) was typechecked with a focused config instead, run only when no other `tsc` was running. Its
  last run found one real defect, five TS2339 in `AgencyResponses.tsx` (fixed in `23324cc55`); the remaining errors
  are ambient declarations (`*.module.css`, `Request` augmentations) in files this work does not touch.
- Each tab's full grid of AnA suggestions (inventory A4) and the source-upload, interview and open-in-editor reaches
  (B6–B8) were not in this brief.
