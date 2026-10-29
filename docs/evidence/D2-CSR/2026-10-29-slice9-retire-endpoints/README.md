# D2 CSR slice 9: retire the Rule-2-defective CSR endpoints and dead CSR code (2026-10-29)

Launch row: **D2** (CSR end to end, `docs/design/CSR_END_TO_END_2026-10-29.md`, slice 9).
Lane: "AnA builds a CSR end to end" (`docs/work-orders/README.md`). The D5 lane's
tools (`draft_safety_narrative`, `narrate_statistical_result`, `record_endpoint_result`)
and `shared/authoring/csr-scientific-review.ts` were not touched.

## What already exists

Searches run before deleting anything: `grep -rn` over `client/src`, `server`, `shared`,
`scripts`, `tests` for `/api/csr-builder`, `/api/csr/(structure|build|draft-section|compare|safety-signals|generate-narrative|analyze-benefit-risk)`,
`analyzeCSRSafetySignals`, `csr-training-service`, `csr-knowledge-extractor`,
`services/csr/index`, `csr-search-service`; `git log --all --diff-filter=D` on
`*csr-training*`, `*csr-knowledge-extractor*`, `*csr-search-service*`,
`server/services/csr/index*`, `*csr-builder*`, `*benefit-risk*`, `*safety-signal*`,
and `-S'analyze-benefit-risk'`.

| Piece | Path | What it did | Client caller | Outcome |
|---|---|---|---|---|
| `POST /safety-signals` | `server/routes/csr-builder-routes.ts` → `analyzeCSRSafetySignals` in `server/services/csr-builder.ts` | Asked a model for "frequency", "relatedStudies" and a 0–5 "disproportionalityScore" for a drug name, from its own knowledge (RULE 2 defect) | none (the client's `/safety-signals` is `/api/regulatory-programs/:id/safety-signals`, a different router) | **deleted**. Replacement: the engine AE tables of a retained run, read through AnA's `get_csr_section_evidence` (`server/services/csr/cortex-authoring-reader.ts` `loadCsrAuthoringEvidence`, slice 1) |
| `POST /generate-narrative` | `server/routes/csr-builder-routes.ts` | A model-written patient narrative from typed-in facts; template fallback | none | **deleted**. Replacement: the build's narrative job, `POST /api/csr/jobs/:jobId/narratives` (`server/routes/csr-jobs.ts`, slice 7) |
| `POST /analyze-benefit-risk` | `server/routes/csr-builder-routes.ts` | A model-written benefit-risk verdict for §13 from free text | none (the last client wrapper, `client/src/api/csr.js`, was deleted in `fdfb00d33`, 2026-06-05) | **deleted**. Deterministic engines that exist: `server/services/regulatory/benefit-risk.ts` `assessBenefitRisk` (AnA `assess_benefit_risk`) and `server/services/benefit-risk/benefit-risk-knowledge.ts` (AnA `assess_benefit_risk_balance`, `build_effects_table`, `server/services/ana/benefitRiskTools.ts`). Neither is bound to a CSR job's engine tables today; that binding is not built here |
| Second mount `app.use('/api/csr', csrBuilderRoutes)` | `server/bootstrap/register-clinical-intel-routes.ts` | Served every builder route again beside `/api/csr/jobs` (e.g. a second build path `POST /api/csr/build`) | none | **removed**; the builder stays at `/api/csr-builder` |
| `server/services/csr/index.ts` | — | `UnifiedCSRService`: `search()` wrapped csr-search-service, `extract()` threw, `getKnowledge()` returned `{}` | none; only importer was the `server/services/index.ts` barrel, which has none | **deleted** |
| `server/services/csr-knowledge-extractor.ts` | — | CSR → prediction-table extraction | none; re-exported only by the same barrel | **deleted** |
| `server/csr-training-service.ts` | — | HuggingFace "training" on CSRs | none (already in `scripts/ci/unreferenced-modules-baseline.json`) | **deleted**, baseline entry removed |
| `server/services/csr-search-service.ts` | — | CSR corpus search | **live**: `server/routes/public-api.ts`, `server/bootstrap/register-inline-routes.ts` | **kept** (the design listed it as dead; the importer check says otherwise) |

Deletion history: no earlier deletion of any of these names exists, so none of them is
the rebuilt copy of something removed before.

## The two CSR tests red before this lane

| Test | Made red by | Decision |
|---|---|---|
| `csr-project-scope.pglite.test.ts` "keeps genuine organization-wide builds when no target was supplied" | `6f57de780` (2026-10-27) "fix(csr): require resolved project anchor for regulated CSR build jobs", which added `CSR_PROJECT_REQUIRED` in `enqueueCSRBuildJob` | Deliberate product change; the test follows. Now "refuses a build with no project or program anchor before storing a job" (400 `CSR_PROJECT_REQUIRED`, no row) |
| `csr-job-runner.placeholder-gate.test.ts` "retains the existing placeholder refusal for saved target text without redrafting it" (from `b92136fdd`, 2026-10-26) | `46fe0e349` (2026-10-27) "fix(csr): verify saved section hashes and placeholders before resuming", which stopped counting saved placeholder text as finished, so a resume redrafts it (the test's unstubbed drafter then threw) | Deliberate, later product change; the test follows. Now "redrafts saved placeholder target text on resume and keeps the placeholder refusal": a redraft that is still a placeholder fails `unresolved_placeholders`; a clean redraft completes |

## Proof (red first)

- `red-route-test.txt`: before the change, `POST /api/csr-builder/safety-signals` and the other retired paths answered 200 at both prefixes, and `GET /api/csr` answered.
- `red-importer-gate.txt`: the importer gate fails on a probe file importing the deleted modules and calling `analyzeCSRSafetySignals` (and on the barrel line before it was rewritten).
- `green.txt`: 35/35 for the two new tests and the two repaired tests.

Tests:
- `server/routes/__tests__/csr-builder-retired-endpoints.test.ts`: the real `registerClinicalIntelRoutes` (other routers stubbed) plus `csr-jobs` mounted as production does. The three retired paths answer 404 at `/api/csr-builder` and `/api/csr`; `/api/csr`, `/api/csr/structure`, `/api/csr/build` answer 404; `/api/csr-builder/structure` answers 200; `GET /api/csr/jobs/not-a-number` reaches the jobs router (400 from its own validator).
- `server/services/__tests__/csr-retired-modules-have-no-importer.test.ts`: the deleted files are gone and nothing in `server`, `shared`, `client/src`, `scripts` imports them or names `analyzeCSRSafetySignals`.

Neighbours run green: `server/services/csr/__tests__` (all), `server/bootstrap/__tests__`, `csr-draft-source-honesty`, `csr-build-scope-refusal`, `service-registry-names-only-existing-modules`, `csr-builder-e3-outline`, `csr-builder-completeness`, `tests/services/index.test.ts` (39 files, 679 tests). `npm run ci:unreferenced-modules`: 73 (baseline 73), OK. ESLint warnings on every changed file are equal to or fewer than HEAD.

## Not done here

- The `/api/csr-builder` mount has no `authenticateToken` at the mount (its handlers throw without a user, which answers 500, not 401). Not changed in this slice.
- No CSR §13 benefit-risk path runs a deterministic engine over a job's engine tables.
