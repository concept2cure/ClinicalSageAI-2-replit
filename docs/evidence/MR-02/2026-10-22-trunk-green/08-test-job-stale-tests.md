# 08 — Test job: unit, route and PGlite tests that trailed deliberate product changes

**Gate:** `ci.yml` → Test (`npm test`), red on push run 39533094089 (job 119021936447,
58 files / 165 tests). **Row:** MR-02 Stage 1 (trunk green). **Date:** 2026-10-22.

## What already exists

Nothing was built. The CI log only showed its last 5,000 lines, and the full log and
artifacts were not reachable through the proxy. So the full suite was run locally on a
frozen `git archive` of `769d8e096`. That left 50 red files in 16 causes
(`scratchpad/testjob-diagnosis.json`). Each cause had one fixer, who recorded the red at
the current tree, followed by an independent reviewer, who re-ran the file and looked for
loosened assertions, skips, refusals mocked away, raised timeouts, or a fixture that
encodes a bug. All 19 groups were reviewed as sound except the lineage group, which was
finished by hand (below).

## Causes → fix (all red before, green after)

| Cause (introducing commit) | Files | Kind |
|---|---|---|
| Submission read-session guard uses `authService` (5bf4aef01, ccd509c06) | documentCanvasLive, indLifecycleProgramScope | partial mock, real guard runs |
| Builder leaf read scoped to the submission (db0d0a218) | submissionCenterOpensOnSequence, submissionRequiredDeliverables | already fixed by 88b068b37 |
| Handoff outcome announced twice, as a notice and a toast (eceb747d3) | BiostatWorkbench.tsx, biostatWorkbench, biostatWorkbenchFreshness | **product fix** (WCAG 4.1.3): announced once |
| Drawer setter named `open` read as dead nav targets (e1f3fd425) | ProtocolDevDesign.tsx (navTargets) | **product rename** |
| Persisted project-membership admission (e1f3fd425) | cer-mdr-routes, ai-editing ×2, export-pptx, exports-record-the-review-assertion | real membership row; new revoked/read-only refusal cases |
| Request-scoped executor required (e1f3fd425) | bla-workbench-read, document-catalog-program-binding (+ fixture) | new fail-closed cases |
| AS2 is a real CMS envelope, TLS CA split out (e1f3fd425) | mdx-esg-transmit-gateway, icsr-delivery-outcome | real X.509, agency-signed MDNs; payload must verify after decryption |
| Unsourced gateways refused before the adapter (e1f3fd425) | refused-before-wire, gateway-accounts | in-adapter refusals moved to EMA CESP; MHRA pinned as guard-refused |
| Stale query/contract stubs (e1f3fd425) | entitlements-acceptance-not-assumed, autoExtractionPipeline.governance, billing-credits-not-metered, reviewer-simulation-run, consistency-audit-outcome, mdx-surfaces-interactive-smoke | stubs match the current statements; Analytics button floor → exact set |
| eSTAR 510(k) templates replaced with FDA's current versions (e1f3fd425) | pdf-object-store, pdf-attach | object numbers re-measured, method in the header |
| Complaint requires harm and severity (8303a7c17) | capa-governed-service-handoff | values supplied and asserted to reach the service |
| Recorded applicant identity (ccd509c06) | founder-path-lineage (world, test, baseline), package-ectd-for-region-withdrawal | applicant recorded through the real routes; baseline **shrinks** by `transmit-record-names-bundle` (the check now passes) |
| PGlite/hand schemas lag migrations (ad372567d, 8dcedc2fc, 67d96c060, 338fda664) | authoring-market-document-binding, unifiedTasks-governed, context-enrichment-claims-coverage, mdx-qms-labeling-search-analytics-routes | real migrations replayed |
| Deliberate regulatory/AnA/seed changes (352ca5aae, c98ae947f, 2cf92bdd5, 327bc9fb6, 19087b9f0, 0308ee257, 969d1e727) | submissionTypeBridge, submittabilityCoverage, assemble-technical-file, consistency-deterministic, ana-launch-scope-execution, chat-upload-to-memory, chat-governed-upload, ga-demo-haq, seed-admin | see below |
| Registry and CI (0308ee257, bcf3190e5 vs 67d96c060, 7df89f4f7) | ui-surface-registry(.ui-v2), company-documents-launch-claim, trivy-steps-run-after-failures, ci.yml, deploy-aws.yml | see below |
| New since the CI head (1354c0f5f, 9b5a2a24f, cf07e244c) | mdx-imports-routes, concept2cure-governed-upload, governed-decision-db-integration, drop-draft-safety | stricter; draft header follows |

## Decisions worth a reviewer's eye

- **haq-manager claims no API prefix.** That was the founder's decision (0308ee257, P-32/P-36). The
  registry test now admits an empty claim only when the entry gives a written reason of
  more than 40 characters. A surface that claims prefixes and also gives a reason fails.
- **NCA and registered-certification-body filings** are admitted by a narrow predicate that
  requires exactly the "not modelled" channel, following `isNotifiedBodyFiling`. They have no blanket exemption.
- **chat-governed-upload** no longer asserts 400 `GOVERNED_CONTRACT_INVALID`. That refusal
  guarded the `concept2cure_artifacts` copy, and 19087b9f0 deliberately removed the copy
  (document store, step 3). The governed act is now filing the source into the data room,
  and the test asserts that instead.
- **admin-console** no longer claims `/api/client-branding/company-documents` or
  `/api/c2c/templates/extract`; company-documents is `LAUNCH_PLATFORM_API`.
  `ci:launch-scope-api`: 421 paths, none refused.
- **Trivy:** the gstack `skip-files` entry is removed from ci.yml, deploy-aws.yml and
  `ALLOWED_SKIP_FILES`. The submodule is never checked out, so the entry named nothing.
  `.trivyignore` records why.

## Verification

All changed test files, the lineage test and navTargets were run together: 33 files and
324 tests passed. company-documents-launch-claim, `tests/ci` and `tests/ui-readiness`:
20 files and 241 tests passed. ESLint: 0 errors on the changed files.

Follow-up outside this lane: `PvCockpit.tsx:281` repeats the notice-plus-toast double
announcement that this change fixed in Biostat.
