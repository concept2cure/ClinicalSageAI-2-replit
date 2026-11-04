# CSR drafting attempt ownership — F1 repair

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Inspected baseline: `7b2d13bef71f3fed1b12dd1aa3534c64ebc5b00b`  
Scope: the existing asynchronous CSR section drafter. No new service, schema,
queue, route, UI or model approval.

## What already exists

- `server/services/csr/csr-job-runner.ts`: enqueues and executes CSR jobs; saves
  section bytes, hashes and evidence lineage; continues dependent submission
  work after a complete saved report.
- `server/services/csr/csr-queue-recovery.ts`: returns stale drafting jobs to
  `queued` and dispatches the same worker as the original requester.
- `migrations/20260628_csr_job_state.sql` and `shared/schema.ts`: existing
  `csr_build_jobs.started_at`, status/heartbeat fields, and section output
  uniqueness. These files are unchanged.
- `server/services/csr/csr-job-evidence.ts` and `csr-output-integrity.ts`:
  current-source admission and saved-output integrity. Their production
  implementation is reused unchanged.

## Diagnosed failure

A slow model call could outlive recovery. Once a replacement worker put the
same job back into `drafting`, the original worker's status-only checks
mistook the replacement's state for ownership. The old response could then
save a section, change progress, fail the new attempt, or complete it and
trigger submission continuation.

There was also a check/write gap between the final status read and the output
upsert. And a failed initial saved-output read after claiming a job occurred
outside the existing catch, leaving the job marked `drafting` until recovery.

## Repair in the existing worker

1. Every claim binds the runnable status AND previous start timestamp read.
   This refuses a stale queued/failed snapshot after another generation.
2. Each successful claim strictly advances the existing start timestamp,
   including same-millisecond retries and a process clock moving backwards.
   `completed_at` is cleared when a real new attempt starts.
3. All post-claim progress, failure and completion writes require organization,
   job, drafting state AND this exact start timestamp. Late responses and
   exceptions cannot write against a replacement attempt.
4. A short database transaction conditionally updates the parent job, then
   upserts its section. The parent-row lock is held through commit, so
   cancellation/recovery cannot slip between the ownership test and save.
   A failed upsert rolls back progress. No model/evidence request runs while
   this row lock is held.
5. All post-claim setup reads are inside the safe failure boundary. The
   worker logs a failure only when its attempt-bound failure write succeeds.
6. Existing requester, project, source-receipt, placeholder, checksum,
   resume-preservation and downstream-readiness controls remain intact.

An already issued model request is not cancelled by this patch and may still
incur provider cost. Its late result is discarded when it no longer owns the
job. This patch is not scientific review or submission approval.

## Exact changed code and tests

- `server/services/csr/csr-job-runner.ts`
- `server/services/csr/__tests__/csr-job-runner.attempt-fence.test.ts` (new)
- `server/services/csr/__tests__/csr-job-runner.placeholder-gate.test.ts`
- `server/services/csr/__tests__/csr-job-runner.evidence.test.ts`
- `tests/unit/csr-job-runner.test.ts`

The three existing fixture drivers now support the worker's transaction
boundary. The state-machine fixture understands null/timestamp predicates
and rollback. Its obsolete expectation of raw provider error text is replaced
with the existing generic refusal and an explicit private-text exclusion.
Existing clinical evidence assertions are not relaxed.

## Executed verification

Node `v22.16.0`, TypeScript `5.8.3`. The exact new TypeScript regression suite
was transpiled and executed using `node:test` through `offline-runner.cjs`.
The adapter binds only the test's declared DB/provider doubles and uses the
actual worker and saved-output integrity implementation. It is NOT the
repository's native Vitest runner. The DB double evaluates every WHERE
predicate, snapshots reads, and simulates transactional rollback; it does NOT
prove PostgreSQL row locks, tenant RLS or the production driver.

| Executed target | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Original baseline worker, same regression suite | 11 | 3 | 8 | 0 |
| Patched worker, same regression suite | 11 | 11 | 0 | 0 |

Captured stdout/stderr: `red-node.txt`, `green-node.txt`. Baseline loading
checks the original Git blob SHA, refusing a different source file.

Cases: transactional section/progress save; late response after recovery;
late provider failure; cancellation; last-check/upsert race; pre-claim ABA;
initial output read failure; write rollback; retained-section resume;
delayed final authorization; placeholder completion refusal.

`transpile.json` records zero syntax/transpilation diagnostics for all five
changed TypeScript files and their Git blob identities. This is not a full
TypeScript type-check. Published blobs must match these identities.

Reproduce the executed narrow check from the repository (Node 22 and the
existing TypeScript dev dependency):

```sh
node --test docs/evidence/D2-CSR/2026-11-03-drafting-attempt-ownership/offline-runner.cjs
CSR_TEST_BASELINE=1 node --test docs/evidence/D2-CSR/2026-11-03-drafting-attempt-ownership/offline-runner.cjs
```

The baseline command intentionally fails eight regression cases. A shallow
clone must fetch the inspected baseline first. For this isolated local
session, `CSR_TEST_BASELINE_FILE` pointed to a connector-retrieved copy whose
Git blob hash was verified; it changes only this evidence adapter's test
source, never application behavior.

## Still required — not passed here

Native Vitest and the existing suites, full TypeScript/build/pre-push checks,
real PostgreSQL concurrency/tenant tests, security checks, authenticated
browser acceptance and live provider/CSR export qualification. Dependencies
for native repository tests were unavailable locally; npm/GitHub DNS failed.
No Neon credentials, database, customer records or model keys were changed.
No GitHub Actions status is implied by these local logs.

```sh
npx vitest run \
  server/services/csr/__tests__/csr-job-runner.attempt-fence.test.ts \
  server/services/csr/__tests__/csr-job-runner.placeholder-gate.test.ts \
  server/services/csr/__tests__/csr-job-runner.evidence.test.ts \
  tests/unit/csr-job-runner.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

A real-database acceptance run must hold an original model promise open,
requeue/reclaim under a separate connection, resume the first promise, and
verify only the new attempt writes. Repeat with cancellation competing for
the job row and with a forced section-write rollback. Use only an authorized
synthetic development project. Full Data Room → biostatistics → AnA → editor
→ independent review → export/reopen qualification remains separate.

## Rollback

Revert the single repair commit through normal change control; there are no
schema changes or data backfills to undo. Reverting restores the known
stale-worker race, so drain active CSR workers first and do not represent
that earlier state as qualified.
