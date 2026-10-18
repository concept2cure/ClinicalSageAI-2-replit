# MR-11 — Submission Readiness: deterministic verdicts and one transmit spine

| | |
|---|---|
| Phase | Phase 1 (Stages 1–2) · Phase 2 (Stages 3–4) · Phase 3 (Stages 5–6) · Backlog (Stage 7) |
| Highest open severity at head | P1 |
| Human testing | Degrades: Submission Center governed-transmit journey. Gateway Transmittals' Transmit never consults Submission Readiness (CAT2-09). Dispatch cannot clear in an environment with no AI provider, and an imported eValidator report never reaches the gate (CAT2-16). Submission Twin (device and diagnostics nav) shows a readiness number seeded with a made-up 50 (AI-04). Legacy and seeded Shadow Review runs show an unlabelled or mislabelled score (CAT2-15). Not observable in testing: CAT2-17. |
| Owner | engineering (founder and regulatory inputs gate Stage 5 and one deletion in Stage 6) |
| Effort | XL in total: M + M + M + M + S + M + S. The pilot path (Stages 1–4) is M + M + M + M. |
| Depends on | MR-10 (CAT2-05 real transport, CAT2-10 eSTAR bundle, CAT2-11 PDF preflight); MR-12 (CAT2-21, for Stage 6 step 8); MR-09 and MR-14 (coordination on Stage 3 deletions); F-9, F-10; two NEW decisions |
| Findings | 5 total — open 0 · partially fixed 5 · fixed 0 · refuted 0 · unverifiable 0 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

## Goal

Every agency transmission leaves from one place: a sequence whose Submission Readiness dispatch gate has cleared. That gate is computed in code from the sequence's content, the imported external validator report bound to the exact package being sent, and a completed review. No readiness percentage, confidence, pass mark or risk score anywhere in the submission path is a number a model chose. An auditor who asks "why was this sequence allowed to go to FDA?" gets one deterministic answer, from one engine, for every Transmit button in the product.

## Why it matters

- **Two Transmit buttons, two standards.** Submission Center's "Package and transmit" refuses until the dispatch gate clears. Gateway Transmittals' Transmit, also a launch surface (`shared/constants/launch-scope.ts:107`), and AnA's k510 transmit reach `executeGovernedTransmit`, which never calls `assessSequenceDispatchReadiness`. On a staging environment with FDA ESG test credentials, a package whose readiness is blocked can be signed and sent. The product's "Submission Readiness" claim is false for one of its two Transmit buttons.
- **The external validator report does not count.** A writer imports a LORENZ eValidator report with errors in eCTD Compile, and the dispatch gate still reads "not assessed". The report is not bound to the package hash, so nothing proves the report checked the package that was sent. The pilot deliverable is one FDA-valid v3.2.2 sequence, and this is the evidence a reviewer will ask for.
- **Dispatch needs an AI.** A tenant with AI disabled, or a test environment with no provider key, can never clear dispatch, because the gate requires a completed LLM Shadow Review run and there is no signed human substitute.
- **Model figures are still shown as facts.** Submission Twin's readiness falls back to 50 when no snapshot exists and ranks claims by model-assigned confidence. Several mounted, authenticated routes (sentence traceability, drafting, ana-cortex, snowglobe, csr-builder safety signals, indCopilot) store or return model scores, one with a pass mark of 70. That breaks CLAUDE.md Rule 2, and no CI gate stops the next prompt from asking for a number.
- **Seven readiness engines and six validators drift apart.** Each disagreement is a future inspection finding of the form "screen A said ready, screen B said blocked".

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| CAT2-09 | PARTIALLY_FIXED | P1 | Degrades | `GatewayTransmittals.tsx:482` POSTs `/api/mdx/gateways/${region}/${gateway}/transmit` → `executeGovernedTransmit` (`governed-transmit.ts:476-700`), no dispatch gate; AnA k510 at `mdx-command-handlers.ts:827` the same |
| AI-04 | PARTIALLY_FIXED | P1 | Degrades | `submission-twin-service.ts:897` `readinessSnap?.readinessPercent ?? 50`; model confidence at `:1159`, `:1193`; no `ci:model-figure` script |
| CAT2-16 | PARTIALLY_FIXED | P2 (P1 once the pilot relies on Readiness instead of the separate eValidator report) | Degrades | No caller passes `externalValidationReport` (e.g. `submission-service.ts:2109`); report stored only on `ectd_compilations.external_validation` (`ectd-compile.ts:1627-1650`); `evaluateShadowPresenceGate` (`assess-dispatch-readiness.ts:357-367`) needs an AI run |
| CAT2-17 | PARTIALLY_FIXED | P2 | No | `/api/ectd-submissions` still mounted (`register-document-routes.ts:23,109-113`); `buildECTDZip` imported at `submission-ops.ts:53`; `computePackageReadiness` and six other readiness engines remain |
| CAT2-15 | PARTIALLY_FIXED | P3 | Degrades | `SubmissionSeqWorkspaces.tsx:1380-1381` renders `r.rtfRiskScore.toFixed(2)` for v1.0 runs with no basis label; `ga-demo.d/107-shadow-review.mjs:206` tags deterministic seed runs `shadow-review@v1.0` |

## Already done at head — do not redo

No finding in this order is fixed or refuted at head. These partial deliveries are in place; build on them.

- **A gated sequence transmit exists (`0e50993c5`, 2026-10-08).** `SubmissionSeqWorkspaces.tsx:1672-1700` TransmitPanel and `SubmissionCenter.tsx:844-870` `runTransmit` POST `/api/submissions/sequences/:seqId/transmit` (`server/routes/submissions.ts:1887`) → `transmitSequence` (`submission-service.ts:2035`), whose Gate 2 (`:2106-2111`) refuses with `DISPATCH_BLOCKED` unless the dispatch gate has cleared. Stage 1 makes this the only spine; it does not rebuild it.
- **Shadow Review scores are deterministic for new runs (`5cce2ae46`, `72264e368`).** `shadow-review-service.ts:248-250` stores only `aggregateRisk(findings)`; prompt `shadow-review@v1.1` asks for no score. The dispatch gate reads critical-finding counts and run presence only (`assess-dispatch-readiness.ts:740-758`). Only the legacy display remains (Stage 7).
- **Vault classification proposes only (`c3f2b287a`).** `ingestion-service.ts:357-405` writes nothing to the document.
- **Snowglobe's artifact score comes from findings (`0a366dc8b`).** Its engine scores do not yet (Stage 3).
- **A missing required Module 1 section is a blocking error (`d155ef099`, `aac603a1b`, `613e24e70`, `4ad6118fc`).** `readinessOptionsForSequence` (`assess-dispatch-readiness.ts:138-175`) and `requiredSectionFindings` (`dispatch-readiness.ts` ~`:655-697`). A cover-letter-only FDA IND 0000 yields six errors. Keep that regression test green.
- **`/api/qms` is gone (`157950309`)**, pinned by `server/routes/__tests__/qms-legacy-api-retired.test.ts`.

## Work, in order

### Stage 1 — One transmit spine (Phase 1 · M · engineering) — closes CAT2-09

1. Re-confirm CAT2-09 at the current head (statuses here are from 94b4f9238).
2. Failing-first server test. Add `server/services/submission-gateways/__tests__/governed-transmit-dispatch-gate.test.ts`, modelled on `governed-transmit-unapproved.test.ts` (pglite or mocks). Assemble an FDA `ectd` package for a program whose `ectd_sequences` row has no completed Shadow Review and no release signature. Call `executeGovernedTransmit` (`governed-transmit.ts:476`) with a valid `reauthVerifiedAt`. Assert it throws `GovernedTransmitRefusal` with code `USE_SEQUENCE_TRANSMIT` and that `gw.transmit` is never called. Run it at head and record the failure.
3. Refuse the package spine. In `governed-transmit.ts`, immediately after the descriptor-trust check (~`:500-509`), when `bundleTrustEnforced()` is true and `input.packageId != null`, throw `new GovernedTransmitRefusal('USE_SEQUENCE_TRANSMIT', 'Agency transmission runs from the sequence, after its Submission Readiness gate clears. Nothing was sent.', 409)`. No environment-variable bypass. Dev and test keep current behaviour only where `bundleTrustEnforced()` is false.
4. One client implementation. Extract `runTransmit` (`SubmissionCenter.tsx:848-870`) and TransmitPanel's transmit logic (`SubmissionSeqWorkspaces.tsx:1677`, governed-precheck at `:1684`) into `client/src/concept2cure/v2/surfaces/submission/sequenceTransmit.ts`. Both existing callers use it.
5. Gateway Transmittals. In `client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx`, replace the package transmit (callback `:470-502`, button `:869`, dialog `transmit`) with a sequence transmit through the shared module:
   1. list the organisation's dispatched sequences via `GET /api/submissions/:id/sequences` (`server/routes/submissions.ts:927`) per submission, or add one org-scoped list route;
   2. run the governed-precheck `{step:'transmit'}` (`submissions.ts:1823`);
   3. sign with `POST /api/c2c/actions/sign`, intent `transmit`, target `ectd-sequence:<id>`;
   4. `POST /api/submissions/sequences/:id/transmit`.
   Keep the log, status, ACK, rollback and technical-rejection actions; they read `submission_transmittals`, which `transmitSequence` also writes (`mdx-submission-gateway.ts:178-181`).
6. AnA. In `server/services/ana-ri/mdx-command-handlers.ts` (k510 transmit, ~`:700-860`, call at `:827`), stop calling `executeGovernedTransmit` for a package. Refuse with the same `USE_SEQUENCE_TRANSMIT` message, or route to `transmitSequence` by sequence id.
7. Update `client/src/concept2cure/v2/__tests__/gatewayTransmittals.test.tsx` case "transmits with the governed reason + §11 re-auth…" (`:110`): the POST goes to `/api/submissions/sequences/:id/transmit` and never to `/api/mdx/gateways/*/transmit`. Add a case where the server answers `DISPATCH_BLOCKED` and the toast shows the server's words with "Nothing was sent".
8. Deletion rule. The package Transmit control is a user-facing capability. Name its replacement in the commit message — `SubmissionSeqWorkspaces.tsx` TransmitPanel and the new Gateway Transmittals sequence transmit → `POST /api/submissions/sequences/:seqId/transmit` — and the reachability gates `client/src/concept2cure/v2/__tests__/submissionCenterLifecycleQa.test.tsx` and the updated `gatewayTransmittals.test.tsx`. Run and quote `git log --all --diff-filter=D -- 'client/**/*Transmit*'`.
9. Once no production caller remains, delete `POST /gateways/:region/:gateway/transmit` (`mdx-submission-gateway.ts:278-363`) and the package branch of `executeGovernedTransmit`, or keep both dev-only behind `bundleTrustEnforced() === false`. Device bundles share this spine; coordinate with CAT2-10 in MR-10 before deleting.

**Acceptance**

- The new `governed-transmit-dispatch-gate` test fails at head (it reaches `gw.transmit`) and passes after step 3, with no gateway call.
- With `bundleTrustEnforced()` true, `POST /api/mdx/gateways/fda/esg/transmit` with a valid `packageId` and re-auth returns 409 `USE_SEQUENCE_TRANSMIT`, and no `submission_transmittals` row is written.
- Gateway Transmittals posts only to `/api/submissions/sequences/:id/transmit` (UI test, red first).
- For a sequence with no Shadow Review, transmit is refused with `DISPATCH_BLOCKED` from both Submission Center and Gateway Transmittals.
- `grep -rn "/api/mdx/gateways/\${region}/\${gateway}/transmit" client/src` returns nothing.
- AnA k510 transmit of a package id is refused with `USE_SEQUENCE_TRANSMIT` (handler test, red first).

### Stage 2 — Submission Twin honesty and a model-figure gate (Phase 1 · M · engineering) — advances AI-04

Submission Twin is the only model-figure surface a pilot tester can reach (device and diagnostics nav, `registryModel.ts:638`, `:670`; `surfaceViews.ts:583`; AnA tools at `AnaToolExecutor.ts:7247-7330`). The gate lands now so that Stage 3's paths are tracked in a reasoned baseline and nothing new joins them.

1. Re-confirm AI-04 (Submission Twin and CI-gate parts) at the current head (statuses here are from 94b4f9238).
2. Failing-first tests. Add a server unit test: no `c2cReadinessSnapshots` row for the package, `readinessScore` must be `null`. Add a case to `client/src/concept2cure/v2/__tests__/submissionTwin.test.tsx` for the empty state. Run both at head; they fail (head returns 50).
3. Readiness without a snapshot. In `server/services/submission-twin-service.ts:897`, replace `readinessSnap?.readinessPercent ?? 50` with an explicit no-snapshot branch returning `readinessScore: null`, `fragilityScore` computed as now, and reason `'no_readiness_snapshot'`. Type `readinessScore` as `number | null` in the return type (~`:775-780`). In `client/src/concept2cure/v2/surfaces/SubmissionTwin.tsx` (interface `:33`, memo text `:175-195`), render "No readiness snapshot for this package; run Submission Readiness first" when the score is null.
4. Claim figures. Remove "Assign a confidence score (0-1)" from the prompt at `submission-twin-service.ts:1159` and `relevanceScore` from `:1193`. Compute support in code: an assessment is `direct` only if its `evidenceText` occurs verbatim in the retrieved document context (reuse the span check in `server/services/clinical-regulatory-evidence/lineage-gate.ts`), otherwise `unsupported`. Order claims by section and position instead of confidence at `:280` (drives `:234`, `:280-305`). Keep the existing confidence column and write null; do not drop it (Rule 1).
5. Add `scripts/ci/check-model-figure.mjs` and npm scripts `ci:model-figure` and `ci:model-figure:selftest`; wire both into `.husky/pre-push` and the CI workflow. Scan string literals in `server/**/*.{ts,js}` and `server/services/ai-gateway/prompts/**/*.md` for JSON-shape requests of numeric figures with `/"?(\w*(score|confidence|likelihood|probability|percent|count|days|impact)\w*)"?\s*:\s*(number|<number>|<integer[^>]*>|0(\.0)?-1(\.0)?|\d+-\d+)/i`.
6. Create `scripts/ci/model-figure-baseline.json`. Every entry carries a written reason and the stage that removes it; the Stage 3 paths go in with "removed by MR-11 Stage 3". An entry without a reason fails the check.
7. Selftest: the gate fails on a fixture copied from `prompts/shadow-review/v1.0.md` (`rtfRiskScore`) and on a fixture of the head csr-builder safety-signal prompt (`server/services/csr-builder.ts:772-840`).

**Acceptance**

- `GET /api/submission-twin/readiness/:pkg` for a package with no readiness snapshot returns `readinessScore: null` (red at head), and `SubmissionTwin.tsx` renders the empty state.
- No Submission Twin prompt asks for confidence or relevance; a test with a model mock returning `confidence: 0.99` for an assessment whose `evidenceText` is absent from the context yields `unsupported`.
- `npm run ci:model-figure:selftest` exits non-zero on both fixtures; `npm run ci:model-figure` passes with a baseline whose every entry has a reason; deleting one reason makes it fail.

### Stage 3 — Remove model figures from the remaining mounted routes (Phase 2 · M · engineering) — closes AI-04

None of these routes has a client caller, so testers will not see them; they are mounted and authenticated, so an inspector will. Prefer unmounting where the instruction allows it. Each removal also deletes its `model-figure-baseline.json` entry.

1. Re-confirm AI-04 (items b–g and the display-only figures) at the current head (statuses here are from 94b4f9238).
2. Sentence traceability. In `server/services/sentenceTraceabilityService.ts:579-580`, ignore `mapping.needsReview`. Set `needsReview` when `claimType` is `statistical`, `safety` or `efficacy`, or when no source's excerpt occurs verbatim in that source's text. Set `isSupported` only when such a verbatim excerpt exists with `linkType 'supports'`. Remove the `needsReview` instruction at `:499-501`. Route: `POST /api/audit-services/traceability/map` (`server/routes/audit-services.ts:162-195`).
3. Drafting routes. Unmount `server/api/drafting/routes.ts` (mount at `server/api/gcc/index.ts:31`; `bootstrap/register-document-routes.ts:70-71`) and delete the file; its tables are not in `C2C_MIGRATION_FILES`. Run the working-agreement history search and quote it. The commit names the canonical replacements: Authoring AI drafting via `server/routes/c2c/ai-editing.ts` and AnA drafting via `server/services/ana/AnaDocumentDraftingService.ts`. Coordinate with MR-09. If unmounting is refused: drop citations whose `sourceId` matches no retrieved chunk, take page only from `matchingChunk.page_number` (`:432`), and remove the 0.5 and 0.8 confidence defaults (`:244`, `:592`).
4. ana-cortex. Unmount `server/routes/ana-cortex.ts` (mounts `/api/ana-cortex` and `/api/ana-1-0-ri-cortex`, `bootstrap/register-inline-routes.ts:137-139`), or remove `regulatory_readiness_score`, `projected_delay_days`, `total_financial_impact`, `compliance_score` and `confidence_score` from both JSON shapes (`:33-50`) and the response. Name the deterministic replacement for readiness as `GET /api/submissions/sequences/:seqId/dispatch-readiness` (`server/routes/submissions.ts:1772`, engine `server/services/ectd/assess-dispatch-readiness.ts`). Do not name `/api/submission-readiness/assess`: `shared/constants/launch-scope.ts:111-122` defines Submission Readiness as the dispatch gate, and Stage 6 deletes `/api/submission-readiness`.
5. Snowglobe. In `server/routes/snowglobe.ts:270-323`, remove `score` and `confidence` from the prompt shape and compute each engine's score from its findings' severities with a pure function, as `0a366dc8b` did for the artifact score. Add a test that a model-returned score is ignored.
6. csr-builder safety signals. Delete `POST /api/csr-builder/safety-signals` (`server/routes/csr-builder-routes.ts:281-300`) and the function at `server/services/csr-builder.ts:772-840`. The commit names the data-backed replacement: `/api/regulatory-programs/:id/safety-signals`, consumed by `client/src/concept2cure/mdx/surfaces/cer/SignalsTab.tsx`.
7. indCopilot. In `server/services/indCopilot.js` (`:624`, `:981`, `:1168-1204`), remove `score`, `completeness_score` and `passed: score >= 70`. Return issues only, with `passed: null` ("not determined by a model"). Update `server/services/__tests__/ind-copilot-compliance-check.test.ts` so it fails first on the old behaviour.
8. Label as "model-assessed", or drop, the display-only figures at `server/services/predictiveSectionService.ts:199` and `server/routes/c2c/ai-editing.ts:1677`.

**Acceptance**

- Traceability: a model mock answering `needsReview: false` for an unsupported statistical sentence yields `needsReview: true` (red at head).
- Snowglobe: a model-returned score of 99 is not stored, and the engine score equals the severity-derived value (red at head).
- `/api/gcc/drafting` and `/api/csr-builder/safety-signals` return 404, and the commit messages name the replacement paths.
- No response from ana-cortex, snowglobe or indCopilot contains a model-produced numeric score; the indCopilot test fails on the old `score >= 70` rule.
- `scripts/ci/model-figure-baseline.json` holds no Stage 3 entries, and `npm run ci:model-figure` passes.

### Stage 4 — The imported validator report reaches the gate, bound to the package (Phase 2 · M · engineering) — advances CAT2-16

This is the evidence path for the pilot deliverable. It depends on Stage 1, so that the gate governs every transmit, and on F-9 for the validator licence that produces the report.

1. Re-confirm CAT2-16 (external report part) at the current head (statuses here are from 94b4f9238).
2. Failing-first test. A pglite test imports an eValidator report with one error against a compilation for sequence 0000 and calls `assessSequenceDispatchReadiness`. Expect the external gate not cleared, with a blocker naming the report's error. It is red at head (the gate is not assessed or cleared).
3. Bind the import to a package. In `server/routes/ectd-compile.ts`, add `packageSha256` to `ImportedExternalValidation` (`:1531`) and set it in `importDraft` (`:1590`) from the compilation's compiled-package sha256, read inside `storeImportedReport` (`:1627`) under the existing `FOR UPDATE` lock. If the compilation has no recorded package sha256, refuse with 409 `NO_COMPILED_PACKAGE`. If no column holds the compiled package sha256 today, add one in a new `IF NOT EXISTS` migration appended to `C2C_MIGRATION_FILES` (`scripts/db/migration-set.mjs`) before the final tenant-sweep pair; `ci:migration-set-order` enforces the position.
4. Feed the gate. In `server/services/ectd/assess-dispatch-readiness.ts`, before `evaluateExternalValidationGate` (~`:766`), add `loadImportedExternalReport(sequence, organizationId)`. It reads the newest `ectd_compilations` row for `(organization_id, submission_id, sequence_number)` with `external_validation` set and maps its findings to an `ExternalValidationReport` (`server/services/ectd/external-validator` types). Pass it as `report` when `params.externalValidationReport` is absent. Every existing caller (`submission-service.ts:750,1448,1982,2109`; `routes/submissions.ts:1176,1779`; `mcp/tools/readiness.ts:34`; `AnaToolExecutor.ts:10485`) then gets it without change.
5. Close the binding at transmit. In `transmitSequence` (`submission-service.ts` ~`:2109`, after the bundle is assembled), when an imported report was used, refuse if `bundle.sha256 !== report.packageSha256`, with a blocker naming both hashes ("the eValidator report covers a different package"). Do the same in the dispatch path (~`:1982`) if it assembles.

**Acceptance**

- Regression, already green: an FDA IND 0000 with only a 1.2 leaf yields `MISSING_REQUIRED_SECTION` severity `error` for 1.1.
- The step 2 test is red at head and green after steps 3–4.
- A report whose `packageSha256` differs from the assembled bundle is refused at transmit (red first).
- An import against a compilation with no package hash returns 409 `NO_COMPILED_PACKAGE`, and no report is stored.

### Stage 5 — Pinned validation criteria and a dispatch path without AI (Phase 3 · S · mixed) — closes CAT2-16

1. Re-confirm CAT2-16 (rule corpus and Shadow Review presence) at the current head (statuses here are from 94b4f9238).
2. Pin the corpus. In `server/services/ectd/validation-rule-corpus.ts`, add `export const FDA_VALIDATION_CRITERIA = { title: 'Specifications for eCTD Validation Criteria', version: '<version>', effective: '<date>' }`. Regulatory affairs supplies version and date from the FDA spreadsheet (NEW decision below). Reference it from every `fda`-region rule (today sources are cited as families, e.g. `FDA_CRIT` at `:84`), and expose it on the dispatch gate view (`DispatchGateView` rule). Add a test that every `fda` rule cites `FDA_VALIDATION_CRITERIA.version`; it is red first.
3. Shadow Review substitute, only if the founder approves (NEW decision below). Add `POST /api/submissions/sequences/:seqId/shadow-review/attest` in `server/routes/submissions.ts`. It requires `requireRole(AUTHOR)` and a Part 11 signature bound to the sequence (reuse the freeze/dispatch signing in `submission-service.ts` ~`:1274-1289`); it is allowed only when the AI gateway reports no provider or the organisation has AI disabled. It records a `shadow_review_runs` row with model `human`, `prompt_version 'human-attestation@v1'`, status `complete`, null scores, and an audit row. Count it in `countCompletedShadowRuns` (`assess-dispatch-readiness.ts:499-514`). No new table.
4. If the founder declines, change the Dispatch blocker text from `evaluateShadowPresenceGate` (`:357-367`) to say that dispatch requires a completed AI Shadow Review and that this organisation has AI disabled or no provider, and record the decision in the readiness rule corpus.

**Acceptance**

- The corpus test is red before step 2 and green after.
- If step 3 is approved: a sequence with zero AI runs and a signed attestation clears `shadowPresence`; an unsigned attempt is refused with no row written; an attempt while a provider is configured and AI is enabled is refused. All red first.
- If declined: the blocker text names the AI requirement (UI test, red first).

### Stage 6 — One readiness engine, one validator per object, no parallel submission paths (Phase 3 · M · engineering) — closes CAT2-17

Before each deletion, run `git log --all --diff-filter=D -- <path>` and name, in the commit message, the replacing file and the gate that proves it reachable.

1. Re-confirm CAT2-17 at the current head (statuses here are from 94b4f9238).
2. Failing-first gate. Add `scripts/ci/check-no-parallel-submission-paths.mjs`: it fails on any import of a deleted module path below, or a mount of `/api/ectd-submissions`, `/api/submission-readiness` or `/api/dossier-readiness`. Wire it into `.husky/pre-push`. Run it at head (it fails), and again after the deletions with one import temporarily re-added (it fails).
3. `/api/ectd-submissions`. Remove the mount (`server/bootstrap/register-document-routes.ts:23`, `:109-113`). Delete `server/routes/ectd-submission-agent.routes.ts`, `server/services/ectd-submission-agent.ts` and `server/services/__tests__/ectd-submission-agent-*.test.ts`; update references in `server/services/audit/domain-history-link.ts:145` and `server/services/ectd/pdfa-detect.ts:7`. Replacement: `/api/submissions` (`server/routes/submissions.ts`, `server/services/submission-service/submission-service.ts`). Leave its tables. If they are to go, amend their creating migration in place with a dated header note (see `scripts/db/migration-set.mjs:618`); never append a DROP.
4. Dead Submission Center family. With founder sign-off (NEW decision below), delete `server/routes/submissionCenter.routes.ts` and the `void submissionCenterRoutes` import (`server/bootstrap/register-governance-routes.ts:9`, `:64`). Replacement: `/api/submissions`.
5. Delete `ectd-stubs/` with `scripts/validate-ectd-stubs-bundle.ts`, and `infra/ind_mock/`, after grep confirms no other reference in `package.json` scripts or CI workflows.
6. Package readiness engine (after Stage 1). Delete `server/submission-ops/readiness-engine.ts` `computePackageReadiness` and its callers (`routes/submission-ops.ts:48`, `submission-ops/automation-runner.ts`, `services/orchestration/*`). `assess-dispatch-readiness.ts` + `dispatch-readiness.ts` is the one sequence gate. Delete `/api/submission-readiness` (`server/routes/submission-readiness.ts`, `server/services/regulatory/submission-readiness.ts`; mount `server/bootstrap/register-advanced-platform-routes.ts:136`) and `/api/dossier-readiness` (`server/routes/dossier-readiness.ts`; mount `register-inline-routes.ts:279`; client `Dossier.tsx:64`). Both sit outside the launch boundary in `shared/constants/launch-scope.ts` (`:99-106` records that the dossier map left the app). Replacement: `GET /api/submissions/sequences/:seqId/dispatch-readiness`.
7. `buildECTDZip` (after CAT2-10 in MR-10). In `server/routes/submission-ops.ts:3071-3080`, `estar` gets the official filled eSTAR PDF from `server/routes/510k-estar-routes.ts`; `eudamed_register` is refused under F-10. Then delete `server/src/services/ectd.ts` and the import at `submission-ops.ts:53`.
8. Validators. Keep `submission-gateways/ectd-structural-validator.ts` for the package and `dispatch-readiness.ts` for the sequence. Move any rule in `ectd/ectd-validator-hardening.ts` that neither covers into one of them, with a `validation-rule-corpus.ts` entry, then delete the hardening module and repoint its three importers (`submission-package-orchestrator`, `submission-sign-release`, `submission-orchestrator`). `ectd4-validator.ts` stays as the v4 library (CAT2-14).
9. AnA QMS writes (with CAT2-21 in MR-12). Extract create, revise and acknowledge from `server/routes/mdx-qms.ts` into `server/services/qms/` functions; make the routes and the `AnaToolExecutor.ts` handlers (~`:14218-14400`) call them. Delete the inline SQL and the model-supplied `quiz_score` write.

**Acceptance**

- The new CI check fails at head and passes after steps 3–7; it fails again when one deleted import is re-added.
- `grep -rn "buildECTDZip\|ectd-submission-agent\|submissionCenterRoutes\|computePackageReadiness" server client/src` returns nothing beyond comments the check explicitly allows.
- `GET /api/ectd-submissions` returns 404 in a non-production boot, not 200 or 403.
- `server/routes/__tests__/qms-legacy-api-retired.test.ts` stays green.
- Gateway Transmittals transmit of a sequence with an open critical Shadow Review finding is refused by `assessSequenceDispatchReadiness`.
- AnA `create_qms_document` writes through the same service function as `POST /api/mdx/qms` (test spying on the service).

### Stage 7 — Label legacy and seeded Shadow Review scores (Backlog · S · engineering) — closes CAT2-15

Only visible on a database holding pre-2026-10-05 runs or the GA demo seed. A fresh pilot production database has neither.

1. Re-confirm CAT2-15 at the current head (statuses here are from 94b4f9238).
2. Failing-first test. A pglite test inserts a `shadow_review_runs` row with `prompt_version 'shadow-review@v1.0'`, `rtf_risk_score 0.95` and one open `minor` rtf finding, and asserts `listShadowReviewRuns` returns `rtfRiskScore 0.275` with `scoreBasis 'model_reported'` and `storedScoreSuperseded: true`. Red at head (returns 0.95).
3. In `listShadowReviewRuns` (`shadow-review-service.ts:294-306`), add `scoreBasis: scoreBasisOf(row.promptVersion)`. For `model_reported` rows, replace `rtfRiskScore` and `crlRiskScore` with `aggregateRisk()` over the run's persisted findings, fetched in one org-scoped query on `shadow_review_findings` with the filters of `getShadowReviewFindings` (`:309`), and set `storedScoreSuperseded: true`. Do not UPDATE the stored columns.
4. Apply the same rule in `server/services/shadow-review/shadow-review-view-assembler.ts` (`:53-98`).
5. In `SubmissionSeqWorkspaces.tsx`, add `scoreBasis` and `storedScoreSuperseded` to `ShadowRunRow` (`:1168-1178`), and at `:1380-1381` render a visible "recomputed from findings" marker with an accessible title when superseded.
6. In `ShadowReview.tsx:137` and `:196-203`, a v1.0 run reads "recomputed from the findings' severities; the score this run recorded under prompt v1.0 is not shown".
7. In `scripts/seed/ga-demo.d/107-shadow-review.mjs:206`, write `shadow-review@v1.1`; `scoreDims` (`:135-141`) is the severity aggregate. The seed is laptop-only; no migration.

**Acceptance**

- The step 2 test is red at head and green after; the same assertion holds for the view assembler; a v1.1 run is returned unchanged.
- No client file renders `rtfRiskScore` or `crlRiskScore` without reading `scoreBasis` (grep).
- The seed file contains no `shadow-review@v1.0`.

## Definition of done

- Every agency transmit in the product — Submission Center, Gateway Transmittals and AnA — goes through `transmitSequence` and is refused unless `assessSequenceDispatchReadiness` has cleared; the package spine refuses with `USE_SEQUENCE_TRANSMIT` wherever bundle trust is enforced.
- An imported external validator report is bound to the package sha256, counted by the dispatch gate, and checked against the bundle actually transmitted.
- `npm run ci:model-figure` runs in pre-push and CI with an empty or fully reasoned baseline, and no submission-path surface or mounted route stores or shows a model-chosen readiness, confidence, pass mark or risk score as fact.
- One readiness engine (`assess-dispatch-readiness.ts`) and one validator per object remain; `check-no-parallel-submission-paths` enforces it.
- FDA rules cite a pinned validation-criteria version, and dispatch behaviour with AI disabled is decided and either supported by a signed attestation or stated in the blocker.
- All five findings are FIXED in `docs/work-orders/MR-findings-2026-10-13.json`, with failing-then-passing evidence under `docs/evidence/MR-11/`.

## Founder decisions this order needs

- **F-9 — external eCTD validator licence.** Blocks Stage 4's end-to-end proof: without a licensed LORENZ (or equivalent) report there is nothing real to import. The code can land against a fixture report.
- **F-10 — regions and formats at launch.** Stage 6 step 7 refuses `eudamed_register` and keeps eSTAR only if the pilot is medtech.
- **NEW — human Shadow Review attestation.** May a signed human review substitute for the AI Shadow Review when the organisation has AI disabled or no provider? Blocks Stage 5 step 3 or 4. Recommendation: approve, Part 11 signed, AI-unavailable only; otherwise any customer that disables AI cannot dispatch.
- **NEW — FDA validation-criteria version.** Regulatory affairs names the FDA "Specifications for eCTD Validation Criteria" version and effective date the corpus is pinned to. Blocks Stage 5 step 2.
- **NEW (small) — delete the voided `submissionCenter.routes.ts` family.** Its own comment calls removal a product call. Blocks Stage 6 step 4 only.

## Do not

- Do not add an environment-variable or role bypass to `USE_SEQUENCE_TRANSMIT`, and do not "fix" Gateway Transmittals by calling the dispatch gate from the client while the package route stays open; the server refusal is the control.
- Do not add a third transmit implementation or copy `runTransmit` into Gateway Transmittals; extract `sequenceTransmit.ts` and have every caller use it.
- Do not replace a model figure with a different default (50, 0.5, 0.8) or a model "rationale" score; the honest value is null with a reason, or a figure computed in code from findings.
- Do not drop the Submission Twin confidence column, the `/api/ectd-submissions` tables or stored Shadow Review scores by appending a DROP or an UPDATE; write null going forward, amend the creating migration in place if a column must go (Rule 1), and keep stored scores as the audit record of what was shown.
- Do not treat the CMC / Module 3 composition path or Reporting & analytics as out of scope while deleting duplicates in Stage 6; the boundary is the one in `shared/constants/launch-scope.ts`. Do not open work on `services/innovation/submission-readiness-twin-service.ts`, the regulatory digital twin Rule 2 excludes.
- Do not name `/api/submission-readiness/assess` as the replacement for anything; it is deleted in Stage 6. The launch Submission Readiness is the sequence dispatch gate.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-11/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
