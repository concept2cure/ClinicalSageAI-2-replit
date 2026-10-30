# Resume CSR expertise contracts, 2026-10-30

W1 / D2, canonical `concept2cure-v2`, synchronized to `47ce1d3d95eff4a6b3614146cc79b670d7b20645`. Continue the published `docs/design/CSR_EXPERTISE_IMPROVEMENTS_2026-10-30.md` contracts. The user supplied a newer Claude continuation URL; its unauthenticated page exposes no transcript. The latest canonical checkpoint supplies the concrete continuation contract; this inference is disclosed to the user. No claim of reading the private session.

## What already exists

- `server/services/csr-builder.ts` is the sole drafter; existing `csr-e3-writing.ts`, `csr-e3-sections-plan.ts` and the registered `ana/intelligence-questions/flows/csr-report.ts` own expertise and interview transitions. Extend their actual message/acceptance path; no alternate engine or editor.
- `server/services/csr/csr-job-runner.ts`, `cortex-authoring-reader.ts` and `cortex-authoring-context.ts` already load retained run evidence, save outputs, resume and conditionally complete persisted jobs. Complete actual target identity and current-source admission after long calls and on populated resumes. Preserve stored work for explicit recovery.
- `server/services/csr/project-scope.ts` already resolves tracking/program/workspace identity and current actor access; its Drizzle actor branch lacks SQL active-user/tenant predicates, and its scope policy omits edit-vs-read propagation. `server/services/report-os/project-access.ts` already owns `forWrite` project policy, including read-only review assignment exclusion from editing. Reach that policy, do not recreate it.
- Existing PGlite CSR project/worker/source tests, builder captured-message tests and registered-flow tests provide qualification seams. Models remain mocked; local SQL is not native PostgreSQL RLS or human scientific validation.
- Incoming canonical CSR generation, review, signature, assembly/placement and UI controls remain owners. The previous unfinished A3 source is paused, not deployed or declared complete. `paused-a3.patch.gz` preserves every tracked and untracked change with its original base and uncompressed hash in `paused-a3-manifest.json`. Earlier filing work remains preserved by the parent evidence packet.

Discovery refreshed exact owner/caller/test searches and `git log --all --diff-filter=D` for CSR/cortex-authoring names. Retired legacy CSR/model-figure paths remain retired; the existing contract credits incoming capabilities. The root and two workers retain disjoint source scopes. All test/lint/build/compiler/publication jobs are serialized by root.

## Qualification

In progress. The older A3 seventy-test run was on the prior base and does not qualify these CSR contracts. Historical temporary logs from the earlier environment were unavailable; only retained or newly captured results will be credited.

## Incoming changes during qualification

Fast-forwarded disjoint canonical changes from `47ce1d3d9` to `fc1ece8d9` while preserving all CSR-owned edits. Incoming prompt intelligence (`84520c3f1`), oncology dose guidance (`e5fc8fc20`) and catalog/tasking contract (`4c4a27daf`) retain their owners and evidence. The incoming A3 implementation is distinct from the older paused patch; the pause is not a claim that canonical A3 has not advanced. Final CSR checks will use the synchronized source.

## Permission repair

The existing `readCsrProjectActor` now uses its SQL policy through the existing Drizzle adapter too, preserving current active user/tenant and explicit pending-deletion retained-read rules. `resolveCsrScope` forwards edit-vs-read to `canAccessReportProject`; read-only members and review assignments retain reads but cannot start builds. The existing job-access helper accepts an explicit edit requirement and actual POST cancellation reaches it; its pre-fix route capture returned 204 for a read-only actor, then correctly refused with 403 without changing the queued job. Existing minimal SQL fixtures now include the real active-user/tenant prerequisites, and write fixtures name an actual owner/editor rather than relying on the old read-policy defect.

## Implemented drafting and generation behavior

- Both existing drafting paths now consume `csrWritingBrief(csrWritingGuidance(section), null)`. Study fields and retained tables are quoted user data, with instructions to treat embedded text as data. No second expertise bank or engine was introduced.
- Every explicit retained pack remains present. Empty/unavailable packs produce a deterministic needs-data template with source digest, missing/omitted tables and limitations in lineage, without a model call. This conservatively stops source-bound headings whose required evidence is unavailable, including unmapped headings, until explicit recovery.
- Existing ethics/consent/GCP/SAP guidance now depends on records; supported sentence patterns distinguish superiority, noninferiority, equivalence and Bayesian decisions. A bounded acceptance guard rejects the representative unsupported conduct/timing assurances exercised by the tests, including misleading missing-record prefaces. This is a pattern guard, not exhaustive semantic or clinical validation.
- The registered interview reaches sensitivity questions after successful and unsuccessful primary outcomes, preserving oncology/vaccine branches and separating same-estimand sensitivity, supplementary and post hoc work. Nonzero adverse-event counts generate neutral denominator-aware review information, rather than an uncomputed high-rate conclusion.
- Existing enqueue admission binds the retained program to the actual numeric project; matching protocol text alone is insufficient. The existing worker revalidates current edit access, source approval/version and evidence digest before/after asynchronous drafting and before completion, including populated resumes. Missing saved provenance refuses completion and retains saved work. State predicates preserve concurrent cancellation during setup as well as after long drafting.

## Evidence boundaries

Models are mocked in captured-message, acceptance and asynchronous route/worker tests. PGlite exercises actual SQL and the existing sharing policies; it is not native PostgreSQL RLS/concurrency qualification. Historical retained-source reads keep their existing meaning. No live provider, deployment, agency, human acceptance or clinical validation is claimed. Partial nonempty packs retain the existing cell checks and human scientific-review requirements; those checks do not validate every qualitative interpretation. Existing scientific review, signatures and release gates remain owners.

Initial generation RED logs are genuine, but their input hashes were reconstructed afterward and explicitly labelled as such; the root scope input at that moment was not frozen. Cancellation RED inputs were frozen before execution. Earlier root/expertise RED logs have known canonical production baselines and retained test inputs/representative diagnostics, but no claim of a complete pre-run transitive freeze. Final integrated inputs are pinned independently in `final-source-freeze.json` and checked after the run. Intermediate failed qualification logs remain separate from final passing results; totals overlap and are not additive.

## Final local qualification

On the frozen code inputs (`fc1ece8d9` plus this work), Node 22 ran **436 tests across 43 files: all passed, zero skipped**. `test-files.txt` is the exact nonoverlapping file set; `csr-final-tests.log.gz` and its structured JSON retain the actual run. `final-source-freeze.json` was unchanged after that run. The changed 25 source/test files have **zero ESLint errors and zero net warning increase** against the canonical base, with both versions compared; no baseline was changed. The Vite client, server and audit-chain verifier builds pass.

The earlier integrated attempt had 428 passes and eight failures in the old unit database double, which lacked `execute` after the canonical actor adapter was reached. Its fixture now supports that exact SQL seam with organization/actor filtering; the separate PGlite controls exercise actual policy. The repeated final 43-file run is fully green. The initial lint found six new warnings (test globals and one complexity count); scoped global references and a small private evidence helper remove them. These failed attempts are retained and are not counted as final passes.

Key failing checks before repair: root permission admission 10 failures/12 passes; read-only cancellation returned 204 (one failure/15 passes); initial expertise 30 failures/3 passes; adversarial conduct claims six failures/21 passes; generation admission/source checks 17 failures/23 passes; corrected cancellation-race check two failures/three passes. The pending-deletion retained-read regression check separately caught a regression in the first local actor repair (one failure/22 skipped) and was corrected before final qualification. The first cancellation-race attempt had a fixture/schema omission and is explicitly not guard evidence. Totals overlap; only the final 436-test set is the integrated qualification.

A later fast-forward to `9c4085a39` brought only incoming IND/core-owner publication evidence; it changes no production/test input in this CSR freeze. Normal direct canonical commit/push and compiler gates remain the final publication step.
