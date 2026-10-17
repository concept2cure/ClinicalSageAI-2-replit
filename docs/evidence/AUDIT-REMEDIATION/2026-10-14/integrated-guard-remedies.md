# Integrated source-guard remedies — 2026-10-14

This local working-tree check found additional integration defects while validating the audit remedies. Initial and final command results are preserved in `integrated-guards.txt`. Source guards supplement the behavioral, native database, browser, build, and typecheck evidence; passing a baseline does not qualify the remaining baselined debt.

## Active runtime inventory

The Node runtime guard previously used `git ls-files`, which includes deleted workflows until commit. Removing two broken staging workflows therefore caused an ENOENT crash. It now inspects the active workflow directory, checking both committed and newly added YAML workflows. The actual filesystem self-test removes a retired workflow, retains a new `.yml` and `.yaml` workflow, ignores a text artifact, and rejects a Node 20 downgrade in the new workflow. All nine simulated runtime drifts remain rejected.

## CSR readiness attribution

The new program-scoped CSR readiness disclosure was called by Compile & export eCTD but absent from its API registry, so production launch enforcement would refuse it. The registry now claims only `/api/submission-orchestrator/csr/readiness` through the existing `ectd-compile` module. A real prefix-map and launch-policy regression test proves that this endpoint is available while six standalone CSR/Module 2 builders and a lookalike path remain outside launch scope. The positive case failed before the registry correction.

## Synthetic QMS harness recognition

The tenant SQL scanner mistook canonical QMS PGlite membership seeds for request-serving production reads. Only the exact `server/services/qms/__tests__/qms-authoring-harness.ts` helper is recognized as a fixture, matching the existing named submission fixture policy. Its three imports are test files; it accepts PGlite and does not open a deployed database connection. The scanner self-test proves that a production copy with the same basename and an unnamed helper under the same nested test directory still fail on an unscoped project delete. No blanket nested-test exclusion or tenant-baseline expansion was introduced. The new self-test case failed before the exact fixture recognition.


The successful tenant scan also proved all eight old baseline entries obsolete, so the existing fingerprint baseline was reduced to zero. The subsequent strict scan passes at current zero / baseline zero.

## Dropped-store purge inventory

A previously unwired dead-store guard found an obsolete dropped extraction-log entry in the tenant purge list. The stale entry was removed; the underlying dead-store migration remains unchanged and still retains nonempty audit tables or tables with live dependencies. The inventory guard, actual PGlite drop/refusal/replay test, 30 purge-coverage self-tests, and 36 existing offboarding/purge unit tests pass. This does not execute tenant deletion against the native verification database.

The additional native-schema read-only purge check detected three newly added tables whose purge/retention behavior was not integrated. That failed checkpoint remains in the raw evidence and was sent to the owning workstreams; its remediation must pass before final integration is reported complete.


The three new-store coverage omissions were subsequently resolved with explicit, content-aware behavior: ordinary notification receipts/notices are child-purged, while actual controlled QMS versions and frozen submission inputs atomically block erasure pending governed retention review. See `tenant-retention-preflight.md` for the six real PGlite cases, native concurrent-FK insertion proof, response contract, and remaining erasure-policy limits. The final source/release batch passes 82 commands; initial failures remain preserved separately.
