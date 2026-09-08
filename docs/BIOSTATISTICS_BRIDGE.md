# Biostatistics bridge — study design ↔ engines ↔ filings ↔ tasks

_Added 2026-09-06. Owner: biostatistics / study design. Status: shipped, feature-flag free (read paths are additive; both write paths are governed)._

## Why

The platform carried three statistical models that never met:

| Model | Where | Used by |
|---|---|---|
| `StatisticalPlan` on `StudyDesign` | `server/services/study-design` → `cdisc_prm_studies.metadata` | protocol / SAP / SoA / registration projections, `/api/study-design` |
| `StatisticalInput` | `server/services/ana-biostats` | the computation + judgment engines, `/api/ana-biostats`, the Biostatistics surface |
| `StudyDesignInput` | `server/services/biostatistics-judgment` | `/api/biostat/judgment/*` |

Consequences, all measured before this change:

- the Biostatistics designer took its study from four hard-coded presets; a persisted design had to be retyped;
- a sample size the engine computed never reached the design record, so the protocol, SAP projection and registration record kept the old number;
- the protocol workspace (`protocol_documents`) has **no statistical column at all** and no view of the study's statistics;
- biostatistics work only ever raised `concept2cure_review_tasks`, which the canonical board (`unified_tasks`) does not read;
- every statistical document was filed under `M5`, DSMB charter and Module 2.7.3 efficacy summary alike;
- `POST /api/ana-biostats/workflow` accepted `autoAttachToDossier` but never read `dossierSectionId`, so the attach step could not run over HTTP.

## What it is

`server/services/biostatistics-bridge/` — one canonical translation layer, pure modules first:

| Module | Purpose |
|---|---|
| `design-adapter.ts` | `studyDesignToStatisticalInput(design)` → `{ input, gaps, mapped }`; `computationToPlanPatch` + `applyPlanPatch` (write-back); `statisticalReadiness(design)` (the checklist every list row shows). **Never invents a number**: a missing effect size / event rate / NI margin / primary endpoint is a `blocking` gap and `input` is `null`; an applied engine default is a `defaulted` gap; a lossy translation is a `note`. |
| `filing-placement.ts` | `placementFor(deliverable, applicationType)` — total over 14 statistical document types × 9 application types (`ind nda bla anda maa 510k de_novo pma cta`, pinned to `APPLICATION_TYPES`). Returns backbone (eCTD / eSTAR / CTIS), section code, heading, CTD module and requirement grade; internal working papers are `not_applicable` everywhere. `authoringModuleFor` replaces the surface's blanket `M5`. |
| `task-blueprint.ts` | `tasksFromAssessment(...)` — verdict, escalation, fragility, method fit, frame obligations, blocking gaps and the filing checklist become de-duplicated `TaskBlueprint`s keyed for idempotent re-runs. |
| `bridge-service.ts` | DB-facing. Reads `cdisc_prm_studies`, `regulatory_programs`, `projects`, `concept2cure_artifacts`, `unified_tasks` (all tenant-scoped). Writes only through the platform's existing writers: `persistStudyDesignTx` + `recordGovernedAction` on one transaction; `unifiedTaskService.createUnifiedTask` + `auditTaskAction`. |

`server/routes/biostat-bridge.ts`, mounted at `/api/biostat-bridge` behind `authMiddleware` (`register-inline-routes.ts`, beside `/api/study-design`):

| Endpoint | Kind | Does |
|---|---|---|
| `GET /designs?program_id=` | read | this tenant's designs (optionally one program) with statistical readiness |
| `GET /designs/:studyId/assessment` | read | adapter input + gaps, engine result + judgment (provenance-stamped), program filing context, placements, proposed tasks, keys already on the board |
| `POST /designs/:studyId/apply-sample-size` `{ reason }` | governed | writes the engine's N / power / assumptions onto the design's statistical plan with a bridge evidence stamp; audit row commits with the write; `422 CANNOT_SIZE` with the blocking gaps when the design cannot be sized |
| `POST /designs/:studyId/tasks` `{ keys[], reason? }` | governed | raises the chosen blueprints on `unified_tasks` (`moduleType: 'Biostatistics'`, `sourceEntityType: 'study_design'`, `metadata.blueprintKey`), skipping keys already open |
| `GET /filing-placements?applicationType=` | read | the placement catalog for one filing type |

## The statistical review (added 2026-09-06, biostatistics-engine pass)

The assessment now carries the design gates' report (`validation`) and a reviewer-shaped `review`: one row per statistical element — primary endpoint, design framework, sample size, multiplicity, analysis methods, missing data, populations, interim analysis — with a risk level (low / medium / high / critical), the finding, the action, and the gate codes the row rests on; plus a defensibility verdict (challenge likelihood, most vulnerable element, recommended actions). `server/services/biostatistics-bridge/statistical-review.ts` assembles it; the engine's judgment can only raise a row's risk, never lower a gate finding.

Four gates were added to `server/services/study-design/design-gates.ts` to cover the review's §III–§IV rules the spine did not enforce:

| Gate | Codes | Catches |
|---|---|---|
| `populationGate` | POP-001..004 | no analysis populations; no primary analysis set; superiority primary on per-protocol; no safety population |
| `methodEndpointGate` | MTH-001..003 | no planned analysis for a required endpoint; method that does not fit the endpoint type (t-test on survival, chi-square on ordinal); ANOVA without baseline |
| `missingDataGate` | MIS-001..004 | no missing-data strategy; LOCF as primary (major without sensitivity analyses); complete-case primary; censoring under a treatment-policy estimand |
| `interimAnalysisGate` | INT-001..005 | interims with no spending function (critical); invalid information-fraction schedule; no boundaries; no DMC; DMC without a statistician |

Critical and major findings become proposed tasks keyed `finding:<code>`, so they reach the board with the standard cited.

## Client

- **Biostatistics designer** (`surfaces/Biostatistics.tsx` + `surfaces/biostatBridge.tsx`): a *Study design* card lists the open program's designs (org-wide when none is open); picking one seeds the engine from the server adapter's input and shows the assessment — server sizing with provenance, readiness, gaps by severity, the filing type, the governed *Apply sample size to design* (reason required) and *Raise tasks* (checkbox list, already-open keys excluded) forms, and links to the protocol workspace, task board and submission center. The document bar states where the current document files (`5.3.5.1 (M5) · required — …`), and the authoring hand-off uses that module. The governed-documents list is narrowed to the open program (`?programId=`).
- **Protocol workspace** (`surfaces/ProtocolDev.tsx`): a *Statistics* tab shows each design's readiness, planned N / power / alpha, the failing checks with their fixes, and *Open in Biostatistics*, which hands the design over on the navigation channel.
- **Navigation contract**: `biostatistics` accepts `studyId`; AnA can `biostatistics.load-design` (a read; the writes stay human acts).
- **Task board**: `Biostatistics` module colour (`TB_MOD`) matches the server `MODULE_CONFIG`.

## Also fixed on the way

- `POST /api/ana-biostats/workflow` now forwards `dossierSectionId` to the integrator, so `autoAttachToDossier` can attach.
- `GET /api/ana-biostats/governed-documents` accepts `programId` (the shell's `regulatory_programs` UUID) and resolves it to `projects.id`, tenant-scoped.

## Verification

- `server/services/biostatistics-bridge/__tests__/*` — 40 tests. The adapter is round-tripped through the **real** computation and judgment engines; the placement test walks every deliverable × application pair and pins the vocabulary to `APPLICATION_TYPES`. Shown failing: filing the internal risk memo under Module 5 for an NDA and giving the CTA SAP a CTD module fail two totality/honesty assertions (`× cta: every deliverable…`, `× internal working papers are never filed`).
- `client/src/concept2cure/v2/__tests__/biostatBridge.test.tsx`, `protocolStatisticsTab.test.tsx` — the designer seeds from the design (not a preset), loads the nav-channel design, disables the write-back on a blocking gap, files under the placement module, requires a reason and reports only what the server confirmed, posts exactly the chosen task keys; the tab shows readiness, links with the id on the channel, and renders empty and failed reads as what they are.
- Contract suites re-run green: `shared/navigation`, `tests/ui`, `tests/ci/no-ghost-globals`, `tests/ci/unreferenced-modules`, `server/services/ana-biostats`; gates: microcopy, catalog-copy, compliance-claims, drizzle-tenant-scope, ban-new-pool, gateway-bypass, insert-columns-declared, session-scoped-rls-bypass.

## Not done (deliberately)

- The designer's in-browser engine (`BiostatEngine`, a verbatim port of `ana-biostats/computation-engine`) is still the source of the on-screen document; the bridge shows the server's sizing beside it. Collapsing the two onto the server is a separate change with its own UX decision (live-as-you-type recompute vs. a round trip).
- `biostatistics-judgment/StudyDesignInput` and `power-sample-size-service.ts` remain unconnected duplicates; the adapter targets `ana-biostats` because that is what the surface and the workflow route consume.
- No new tables or migrations. The bridge stamps the design's own `powerAssumptions.evidence` and uses `unified_tasks.metadata`.

---

## Exercised against a real migrated schema — 2026-09-08

Until this date the bridge had unit tests over its pure modules and mocked-DB
route tests; the route had never run against a migrated database. It was run
here against a local database built by the repo's own applier (all
`C2C_MIGRATION_FILES`, 226 of them applying; the 27 failures are downstream of
pgvector, which cannot be installed in this container, and none touch this
path), with a study design persisted through `persistStudyDesignTx` — the same
write the product uses.

| Call | Result |
|---|---|
| `GET /designs?program_id=` | the program's designs with live statistical readiness (60% and 90% on the two seeded designs) |
| `GET /designs/:id/assessment` | adapter gaps, filing context (program type `ind`), six filing placements, eight proposed tasks including the estamand and missing-data gates, and the statistical review |
| `POST /designs/:id/apply-sample-size` (no reason) | 400 `REASON_REQUIRED` |
| `POST /designs/:id/apply-sample-size` (design with blocking gaps) | 422 `CANNOT_SIZE`, naming the exact field and design path |
| `POST /designs/:id/apply-sample-size` (sizeable design) | 200 — 302 subjects written back, with an action id and a sealed `sha256` audit-chain row |
| `POST /designs/:id/tasks` (no keys / unknown keys) | 400 `INVALID_BODY` / 409 `NO_TASKS` |
| `POST /designs/:id/tasks` (real keys) | three `unified_tasks` rows, each carrying its blueprint key and trigger |
| the same call again | 0 created, 3 skipped — idempotent |

Measurements: `docs/reports/evidence/ana-ui-2026-09-06/biostat-bridge-live-2026-09-08.json`.

### What this found

`POST /designs/:id/apply-sample-size` answered **500** on every call, and always
would have. `recordGovernedAction` writes `command: 'apply-sample-size'` to
`c2c_ana_actions`, whose CHECK constraint — created by
`migrations/20260527_mutation_primitives.sql` — enumerates only twelve universal
mutations. The INSERT raised 23514 and rolled back the whole governed
transaction, so the sample size was never written and no audit row was created.
`command: 'task.create'` had the same exposure.

The fix already existed and had never run.
`db/migrations/20260730_c2c_ana_actions_command_vocab.sql` replaces that
allow-list with a length bound, documents the same defect across roughly fifty
endpoints (`create`, `update`, `review`, `approve`, `reaffirm`,
`transmittal_rollback`, …), and was **left out of `C2C_MIGRATION_FILES`** — so it
ran on no database. No gate caught it: `ci:migration-reachability` asks whether a
**table** the server queries is created by something an applier runs, and this
migration creates no table, it replaces a constraint.

It is now in the set, positioned after the migration that creates the constraint
so the replay order is create-then-widen (CLAUDE.md RULE 1). Re-applied: the
constraint is now `c2c_ana_actions_command_bounds`, and the write-back returns
200 with the design updated to 302 subjects and its audit chain sealed.
Pinned by `tests/schema-contract/governed-command-vocabulary.contract.test.ts`,
shown failing on the un-wired set first.

**Observation, not fixed here:** 254 of the 551 `.sql` files under `migrations/`
and `db/migrations/` are on no applier. Most are legacy and correctly dead, so a
blanket "every file must be applied" gate would need a 254-entry baseline and
would be noise rather than enforcement. The narrower lesson stands: a migration
that alters a constraint rather than creating a table is invisible to every
current reachability guard.

### The surface, against the same live data

The API section above exercised the route. The Biostatistics surface itself was
then rendered in a browser against the same database — its first run on real
rows. Walks: `biostat-surface-walk-2026-09-08.mjs`,
`biostat-surface-writes-walk-2026-09-08.mjs`; measurements and screenshots in
the same evidence directory.

| Step | Measured |
|---|---|
| Open `/concept2cure/biostatistics` with a program open | the program's three designs listed with live readiness chips (100% / 90% / 60%) and the engine's verdict chip; the list read is program-scoped |
| Select a design | the assessment loads (200), the statistical-review table renders, and the two governed actions appear: "Apply sample size to design" and "Raise tasks (6)" |
| "Raise tasks (6)" → reason → confirm | `POST /tasks` 200; six tasks created; toast: *"6 tasks raised on the board — each carries the design as its source."*; the button relabels to "Raise tasks", because the panel reloaded and none is open any more |
| "Apply sample size to design" → reason → confirm | `POST /apply-sample-size` 200; toast names the number and the audit record: *"Sample size 302 written to … — the write and its audit record committed to…"* |
| Page errors | none across both walks |

Both governed actions open a reason form before anything is written — nothing
fires on the click itself — and the surface's own state is refreshed from the
server after each write rather than being assumed.
