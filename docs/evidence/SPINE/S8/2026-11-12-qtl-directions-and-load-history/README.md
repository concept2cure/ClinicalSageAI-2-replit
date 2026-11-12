# Risk-based monitoring: two gaps closed by reaching what the server already had (2026-11-12)

Launch row D2. Plan package R1 (reach: a server capability with no screen), over S8's files. The founder,
2026-11-12, after the gap map in `../2026-11-12-ana-lead-and-site-indicators/README.md`: *"Get to work on closing
the identified gaps that we have."* Under the same day's *"Do not build a new module ever, this is building out what
we have"*, this closes the gaps that needed nothing new. No screen, route file, service, table, mount, engine or AnA
tool is added.

## What already exists (RULE 3)

Searches run: `direction`, `threshold_lower`, `two_sided`, `qtlStatus`, `qtlRangeError`, `rbm_data_runs`,
`rbm-data-runs`, `supersedes_run_id` across `server/`, `shared/`, `migrations/`, `client/src`.

| Path | What it did | What it did not do |
|---|---|---|
| `migrations/20260930_rbm_qtl_direction.sql` (in the deployed set) | `rbm_qtls.direction` (`upper`, `lower`, `two_sided`), `threshold_lower`, `secondary_limit_lower` | — |
| `server/services/rbm/rbm-engine.ts` `qtlStatus`, `qtlRangeError` | Bands a value in the limit's own direction; refuses a range with a missing or inverted bound | Its refusals named fields before words |
| `server/routes/mdx-rbm.ts` `POST`/`PATCH /rbm-qtls` | Accept and store the direction and the lower bounds; recompute the status | — |
| `shared/schema.ts` `rbmQtls` | The table as the ORM reads it | Did not carry the three columns, so the board, which reads through it, could not send them |
| `server/routes/mdx-rbm-board.ts` | The board the screen renders | Sent no direction: a lower limit set through AnA or the API reached the screen as an upper one |
| `client/…/RbmSurfacesA.tsx` `RbmQtls`, `RbmSurfaces.tsx` `ThresholdGauge` | The limits tab | Could set only an upper limit, drew every limit as one, and said "lower-bound and two-sided QTLs are not supported yet" |
| `migrations/20260726_rbm_metric_ingestion.sql`, `20260930_rbm_ingest_idempotency.sql` | `rbm_data_runs`: every load, its feed, cut-off, counts, outcome, what it replaced and why | — |
| `server/routes/mdx-rbm-data.ts` `GET /rbm-data-runs` | The study's load history, admitted per project (`rbm-access.ts`) | No screen called it, and no surface claimed its path, so a release would have refused it |
| `client/…/RbmIngest.tsx` | "Load extract…": the load and its outcome | Showed nothing of earlier loads; the overview said only how old each feed's newest load was |

## What changed

**Lower limits and ranges** (`shared/schema.ts`, `mdx-rbm-board.ts`, `rbmBoard.ts`, `RbmSurfaces.tsx`,
`RbmSurfacesA.tsx`, `rbm-v2.css`, `rbm-engine.ts`).
- The ORM definition carries the three columns; the board sends `direction`, `thresholdLower`, `secondaryLower`.
- The form asks which way the limit bites (at or above, at or below, outside a range) and takes a range's lower
  bound and lower early-warning limit. For a one-sided limit the lower bounds are sent as null.
- The bar draws the breach and early-warning zones where the limit bites, with a mark at the value. The mark's tone
  is the engine's status; the screen does not band the value. An upper limit is drawn as before. A limit not yet
  measured says its limits in words.
- The note says the three kinds, and that a range with one bound is not evaluated.
- The engine's two refusals lead with words ("The lower bound of a range must be below its upper limit …").

**Load history** (`RbmIngest.tsx`, `ui-surface-registry.ui-v2.ts`, `rbm-v2.css`). "Load extract…" lists the study's
earlier loads, newest first: run, when, feed and file, data cut-off, rows accepted and rejected, outcome, what it
replaced and why, and whether a later load replaced it. A failed or malformed read says so; it is not an empty
history. The monitoring screen claims `/api/mdx/rbm-data-runs`.

## Verified

Red first: `red/new-tests-against-the-old-code.txt`, the 13 cases of the two new client files fail against the code
before this change.

| What | Where | Result |
|---|---|---|
| The limit in words, the bar for each kind, the tab, create, edit, the refusal | `client/…/__tests__/rbmQtlDirections.test.tsx` (9 cases) | Pass |
| The history as recorded, empty, failed, malformed; the registry claim | `client/…/__tests__/rbmLoadHistory.test.tsx` (4 cases) | Pass |
| The refusals' words | `server/services/rbm/__tests__/rbm-engine.test.ts` | Pass |
| The load dialog's own suite | `rbmExtractReadOwnership.test.tsx`: its request mock counts the load; the history read is answered apart | Pass |
| Every RBM client suite, the engine, the board route suites | 17 files | 186 pass |
| Gates | `ci:launch-scope-api`, `ci:column-reachability`, `db:sync-manifest:check`, `ci:undefined-css-classes`, `ci:surface-text-ramp`, `ci:one-product`, the lint warning ratchet | Pass |

**In the running app**, as the Lumen lead on LMN-201, 1440 and 390 (`qtl-directions-*.png`, `load-history-*.png`):
- "New QTL", at or below, limit 90, warning 93, current 82: the row reads "82 — limit 90 or below — warn at 93",
  **Breached**, the mark in the breach zone, "Document breach" offered.
- "New QTL", outside a range, 0.8 to 1.2, warnings 0.9 and 1.1, current 1.15: "range 0.8 to 1.2 — warn below 0.9 or
  above 1.1", **Approaching**.
- A range with its bounds the wrong way round: refused in the form with the server's sentence; nothing saved.
- "Load extract…": 13 earlier loads for LMN-201, run 13 first (EDC subject-level extract, cut-off 2026-11-10, 48
  accepted).
- No page error; the page does not scroll sideways at 390 on any of the ten tabs.

The two limits created here are in this container's demo database only.

## Still open against CluePoints, and what each needs

Unchanged from the gap map, less the two closed here (QTL kinds; load provenance on screen).

| Gap | Why it is not closed here |
|---|---|
| Central monitoring over subject-level clinical data | A new engine and a decision on its tests. The subject metrics that exist (`rbm_patient_profiles.metrics`) carry no site for a subject loaded by extract, and LMN-201 has 12 subjects over 8 sites: a per-site comparison on that would flag noise. It changes which sites are flagged, so it is also the validation lane's to weigh (RBM has no URS or OQ, GA-D4-09). |
| Subject timeline in patient profiles | No store holds a subject's visits, exposure, adverse events and medications for RBM; needs a read of the data room's study data. |
| Structured QTL breach record | `rbm_qtls.metadata` could hold it without a new table; it needs the fields decided (participants, estimand impact, effectiveness check, sign-off) and a governed close-out. |
| Readings by country | Country rows are stored by a load (`rbm_metric_observations`, scope `country`) and read by nothing; reaching them is a board change, not yet done. |
| Limits derived statistically | An engine change. |
| Site risk trend over time | Site rows are kept per load, so a site's indicator history can be read; the snapshot table keeps no history. Not yet done. |
| Duplicate-patient detection, audit-trail review | New engines; no demographic or audit-trail data is loaded for RBM. |
| Medical & safety review, medical coding, query detection | New modules, which the founder's instruction rules out. |
| `GET /rbm-patient-profiles`, `GET /rbm-site-oversight/:programId` | The board already delivers both outcomes on the Patient profiles and Site oversight tabs. Retiring a route is a founder decision. |

## Open

- AnA's answers were not exercised: no AI provider in this container.
- Dark theme was not re-walked.
- The retired-name ratchet is red on trunk for `cm-meta` (85 against 84), from another lane's file; not this change.
- HawkScan did not run: no `HAWK_API_KEY`.
