# Rule 2 · S1: a submission run takes no clinical or nonclinical figures from the request

**Rule:** CLAUDE.md Rule 2: "Numbers, verdicts and governed content come from
deterministic engines; the model narrates." Also the working agreement: "fail
closed, never fabricate".
**Audit:** the Rule 2 audit of tools and routes that compose from supplied figures (`../design.md`), slice S1.
**Date:** 2026-10-26.

## The defect

`POST /api/submission-orchestrator/runs` and `POST /runs/:runId/regenerate` are launch-scoped routes. Outside
development they refused only an inline `cmcSources`, a fix from GA plan item 1 on 2026-10-05. A request body could
still carry the rest:

- **`csrInputs`, `nonclinicalStudies` and `clinicalStudyData`.** These came in Mode B, and `clinicalStudyData` in Mode A
  too. The run turned them into Module 2.4, 2.5 and 2.7 and the CSR tables. `package.assemble` derives the run's leaves
  from that content, and `package.sign` can sign them. Every figure in the result was whatever the caller typed: no
  record held it and nobody approved it.
- **A Mode A `ctdProgramId`.** The run composed Module 2.4 from `ctd_nonclinical_studies`. That table is where the
  model-run preclinical extractor lands its output (`preclinical-extraction-schema.ts`), so it is not a governed record.
- **A Mode A regenerate.** It runs no loader (the route passes the parsed body straight to `regenerateAffected`), so it
  re-ran every step over empty inputs. The red shows a regenerate with `{projectId}` completing.

## What already exists (Rule 3)

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The CMC refusal | `server/routes/submission-orchestrator.ts` `refusedInlineCmcSources` (GA plan item 1) | Refuses inline `cmcSources` before parsing, on both run routes, and names the governed path | Judged CMC only; its own comment said the other arrays "belong to their own lanes" |
| The governed start | `POST /api/submission-orchestrator/runs/for-program` | Reads the project's completed CSR inputs and the chosen approved CSR Vault source (`clinicalSource`); carries `nonclinicalStudies: []` | — (this is the route every refusal names) |
| Its client | `client/src/concept2cure/v2/surfaces/OrchestratorRunControls.tsx` | Calls `/runs/for-program`, `/runs/:id/resume` and `GET /runs` | Never calls bare `POST /runs` or `/regenerate` |
| Mode A loaders | `load-csr-inputs-for-project.ts`, `load-approved-cmc-sources-for-project.ts`, `load-nonclinical-studies-for-project.ts` | Read the project's records | The nonclinical loader reads the extractor's table |
| Tests | `orchestrator-module3-governed.test.ts`, `orchestrator-foreign-ctd-program-is-refused.test.ts` | The CMC refusal and the foreign-program 422 | Nothing refused the other arrays |
| OQ | OQ-008 OQ-CMC-30 (`tests/validation/oq/cmc/steps-surface.mjs`) | Observes the CMC refusal under the W3 posture | — |

**Searches run:**
- `refusedInlineCmcSources`, `INLINE_CMC_SOURCES_REFUSED`;
- `nonclinicalStudies`, `csrInputs`, `clinicalStudyData` and `ctdProgramId` across `server/routes`, `client/src`, `tests`
  and `scripts`;
- `submission-orchestrator/runs` in the client (only `/for-program`, `/:id`, `/:id/audit`, `/:id/resume`,
  `/:id/clinical-tables` and `GET /runs` are called);
- `ctd_nonclinical_studies` writers;
- `git log --all --diff-filter=D -- 'server/routes/submission-orchestrator*'` (no earlier generation).

## The change

The work is **extend**: the existing CMC refusal is generalized, not rebuilt.

- **`refusedInlineRunInputs(rawBody, res, organizationId, route)`** (`server/routes/submission-orchestrator.ts`).
  - It runs the CMC refusal first, which keeps `INLINE_CMC_SOURCES_REFUSED`.
  - Outside development, it then refuses:
    - a non-empty `nonclinicalStudies`, `csrInputs` or `clinicalStudyData`: 400 `INLINE_RUN_INPUTS_REFUSED` with `field`;
    - a `ctdProgramId`: 400 `CTD_PROGRAM_INPUTS_REFUSED`;
    - on regenerate, a `projectId`: 400 `REGENERATE_MODE_A_UNSUPPORTED`.
  - Each refusal names `POST /api/submission-orchestrator/runs/for-program`, and none echoes the refused figures.
  - It is checked on the raw body before parsing and before any read, on both routes.
  - Empty arrays are not refused, and development keeps the fixture door.
- **The `clinicalStudyData` schema comment** now says it is for development fixtures only. It used to say "Accept it in
  BOTH modes for now".
- **Validation.**
  - URS-004 v0.4 adds URS-SUBC-014.
  - OQ-004 v0.6 adds OQ-SUBC-16, scripted, to the protocol table and to `tests/validation/oq/submission-center/run.mjs`.
  - On a development server the step records a deviation, never a pass, as OQ-CMC-30 does. **Not yet executed.**

**User-visible:** none in the UI. The client starts runs only through `/runs/for-program`.

## Proof

`server/routes/__tests__/orchestrator-inline-run-inputs-refused.test.ts`:

| Case | Trunk | After |
|---|---|---|
| Inline `csrInputs` / `nonclinicalStudies` / `clinicalStudyData` on `POST /runs`: 400 with `field`, names `/runs/for-program`, does not echo `ORR 42%` / `50 mg/kg/day`, nothing read, no run | **fail**: 200, a run started | pass |
| `clinicalStudyData` in a Mode A body: 400 | **fail**: 200 | pass |
| Mode A `ctdProgramId`: 400 `CTD_PROGRAM_INPUTS_REFUSED`, nonclinical loader not called | **fail**: 200 | pass |
| Regenerate with each array, and with `projectId`: 400, `regenerateAffected` not called | **fail**: 200, regenerated | pass |
| Empty arrays; a plain Mode A run; development with every input | pass | pass |

- `red/before.txt`: 9 of 9 refusal cases fail on `b5b44678b`.
- `green/after.txt`: the new test, the foreign-program test and the Module 3 suite pass, 30 tests in all.
- The 12-file orchestrator neighbourhood passes, 128 tests. It covers:
  - the continuation, CSR-readiness, program-start and submission-FK route tests;
  - tenant isolation;
  - the sign-release route;
  - the release-signature journey;
  - saved clinical tables.

**Pin moved.** `orchestrator-foreign-ctd-program-is-refused.test.ts` now runs on a development server. Outside
development a `ctdProgramId` is refused before the loader can throw `CtdProgramNotFoundError`.

**Gates:**
- `ci:typecheck-no-regression`: 0.
- ESLint ratchet: no file changed its warning count.
- `ci:unreferenced-modules`: OK.
- `check-validation-traceability`: every URS citation resolves, and every OQ step carries its protocol's kind. Its
  `--self-test` (17 mutations) catches every one.
