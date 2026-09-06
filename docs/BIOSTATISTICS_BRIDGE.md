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
