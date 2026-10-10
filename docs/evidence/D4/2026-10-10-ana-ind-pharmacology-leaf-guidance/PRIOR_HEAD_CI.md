# Prior-head verification — 2026-10-10

Read-only GitHub connector inspection. Repository: concept2cure/ClinicalSageAI-2-replit; canonical branch: concept2cure-v2. At initial capture, remote HEAD was verified as `26b187705e0f6cc38ed4c2ec4ceee8eb149ba596`. All six push workflows for this prior SHA completed; their failed gates did not clear the release. These results do not verify the later pharmacology implementation or a documentation follow-up; see `POST_PUSH_VERIFICATION.md` for the fresh implementation results.

| Workflow/job | Run / job | Observed result |
| --- | --- | --- |
| CI Security Scan | 37999863293 / 114055030447 | Success. Dependency-risk gate PASS at 2026-10-09T22:34:31Z: three reviewed High advisory occurrences (braces GHSA-VFJ7-8CJW-P6XM; image-size GHSA-5P2G-FCMC-QVQQ and GHSA-W3RX-R6R6-PGPR), no Handlebars occurrence. 36 dependency/security tests passed. Trivy filesystem/config steps passed; Helm rendering logged missing chart dependencies, so this is not complete IaC coverage. |
| C2C Validate/Audit typecheck | 37999863316 / 114055030017 | Success. Ordinary stock tsc --noEmit, baseline 0, reported zero errors and exit 0 at 22:36:28Z. ESLint ran through the workflow's nonblocking command. Scientific/regulatory/AI/compliance jobs skipped. |
| Tier 5 authenticated app smoke | 37999863297 / 114055030077 | Success. Migration-order regression step 6, fresh schema provisioning step 8, authenticated browser step 9, governed golden journey step 10 all succeeded. Browser 2 tests passed including unauthenticated negative control. Golden journey 1 passed: export 403 before review and 200 after review, evidence persisted. This development smoke is not production AI or scientific qualification. |
| CI AnA readiness | 37999863293 / 114061644899 | Success: 303 tests, four files. |
| CI stock / beta TypeScript | 37999863293 / 114055030130 steps 127/128 | Both succeeded. Stock TypeScript zero errors exit 0 at 22:56:27Z. |
| CI production image / production RLS boot | 37999863293 / 114061644856 and 114061644878 | Both jobs succeeded, including empty DB provisioning/image health/sign-in and non-superuser NOBYPASSRLS production readiness. |
| Semgrep | 37999863301 / 114055030054 | Failed blocking delta scan: seven findings relative to last green ancestor 661a2c93aff2f7799e8d55f7ab0f92d5ebfcac19. Repaired IND CMC test no longer present. Full advisory scan completed with 687 findings. No waiver or baseline relaxation performed. |
| CodeQL / repo health refresh | 37999863294 / 37999863246 | Both workflows succeeded. |
| Broader CI | 37999863293 | Completed failure. Lint, Integration Tests, Test, Coverage ratchet and Blank DB final purge-coverage failed; build/release-evidence jobs skipped. |

## Actual remaining failed gates

Semgrep seven blockers: dynamic RegExp at docs/evidence/QA-2026-10-08/walk2-majors/walk-2/h.mjs:97; server/services/__tests__/artifact-approval-review-integrity.pglite.test.ts:112; server/services/__tests__/fixtures/artifact-signed-target-harness.cjs:101; server/services/clinical-regulatory-evidence/dataset-profile.ts:140; server/services/part11/__tests__/one-signing-authority-policy.test.ts:96. Path joins at server/services/ana/__tests__/package-ectd-for-region-recorded-identity.test.ts:67 and server/services/tasking/__tests__/task-project.pglite.test.ts:38. This list is observed scanner output, not confirmation that every warning is exploitable.

CI Lint job 114055030130:
- Step 33 proof tier: duplicate sponsor_address (and ind_type) declarations in tests/schema-contract/biopharma-programs-router-columns.contract.test.ts fixture; 120 files passed, one suite failed, 1,366 tests passed, six skipped.
- Step 51 error-envelope gate: concept2cure/components/ana/anaTurnTimeline.ts:214 typeof-error-string.
- Step 58 step-presentation selftest: missing present block review_sop_requirements, 17/20 cases behaved; selftest cases also failed around search_project_documents deletion and convene_drafting_council source detection.
- Step 74 raw SQL tenant-isolation: one new document-chunking-backfill.service.ts#db0501f26bbf document_chunks finding.
- Step 84 requestDb adoption: ana-ri/runs.ts and submissions.ts two new shared-pool route findings.

Blank DB job 114061644922 provisioning, first/replayed deploy, RLS, readiness, post-deploy invariants, live-schema checks all passed. Only final step 18 purge-coverage failed: stats_computation_runs cannot be reached by tenant erasure. Do not characterize the DB provisioning repair as failed on this evidence.

Core / integration job log fetches returned Transport closed, so exact JSON artifacts were downloaded instead; ZIP SHA-256 matches GitHub metadata. Core Vitest reports 26 failing assertions and one failed fixture suite. Relevant IND regression: in-text-references.test.ts lines 168 and 372 expect Module 3.2.P.2.1 to be unresolved but classifier now reports resolved after catalogue expansion. Other failing files: artifact-status-lock-covers-approval (2), report-os-audit-recording (3), report-os-delivery-recording (2), report-os-finalize-signature (3), setup (1), artifact-approval-ceremony.pglite.integration (6 ARTIFACT_CHANGED/expected 500 assertions), document-data-disposition consumers.pglite.integration (3 missing c.catalog_state), newProjectWizardRegulatedChoices (4 undefined indication/productType). These are observed assertion/SQL failures, not diagnosed runtime root causes.

Real-database job 114061644864 step 10 artifact reports 1,645 passed and three failed assertions in document-catalog-toggles.dbtest.ts lines 87/176/198 (expected true to be false). Coverage measurement succeeded and ratchet step failed; log unavailable via connector, numerical delta not confirmed.

## Retrieved immutable artifact pins

| Artifact | ID | ZIP SHA-256 | Local inspection copy |
| --- | --- | --- | --- |
| Core results | 11652722274 | 06dc1ad22997a05afe6d88ec0801ab0da15c4027de3ec50a3f10b3e082c8a320 | /tmp/c2c-ci-11652722274.zip |
| Integration results | 11651563112 | bfc710bbfe978ba02241ef134d62ddb67bc557f31eaa6bb55732fe8a0d452216 | /tmp/c2c-ci-11651563112.zip |
| Real DB results | 11649058406 | 0309cc8ed43b8d1cc4ccdfd9e1e33537bd38ade309d5e9204451b4239d620547 | /tmp/c2c-ci-11649058406.zip |
| Coverage | 11653049361 | 1632e839ea65bca15a007cf695648f550804629da6e3be0c980bc1f481b66c75 | /tmp/c2c-ci-11653049361.zip |
| Tier 5 | 11649295021 | c781854a626e75797bbbc4756412b896a1273f7903548acb14021211625d7787 | Metadata only |
| Lockfile audit | 11647919355 | fb830e00c3dca2c848f75df30a67b6a95578294616426e0856351b1b0a7ffdd9 | Metadata only |

Run URLs: https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37999863293 ; https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37999863297 ; https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37999863316 ; https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37999863301 .

