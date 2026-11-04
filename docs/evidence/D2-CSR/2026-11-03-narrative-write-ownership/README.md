# Patient-safety narrative write ownership — F1 repair

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `0441fa1bec707cfb4d61d448dd2b49195199c280`  
Launch workstream: D2/W1, existing CSR-to-authoring pipeline.

## What already exists

- `server/services/csr/csr-narrative-run.ts`: the established queued narrative
  worker, claimed under `csr_narrative_runs.attempt`; heartbeat and completion
  writes already check that attempt. Uses the requester's tenant connection.
- `server/services/csr/csr-narrative-store.ts`: existing per-subject persistence,
  saved-hash verification, approved ADaM source readers, and transactional
  streaming of sections 14.3.3 and 12.3.2.
- `server/services/csr/csr-narrative-job.ts`: composition, per-subject resume,
  data-gap refusal, and section streaming. Reused unchanged.
- `migrations/20260628_csr_job_state.sql`: existing parent/run rows and attempt
  field. No migration or table added.
- The baseline already fixes the separate section-drafting worker's ownership
  race. That implementation is not replaced or duplicated here.

## Confirmed defect

The narrative worker's progress/finish checks did not protect its stored prose.
`saveNarrative` checked only parent cancellation; final section landing did not
recheck the parent or narrative attempt. A slow model response could save old
text AFTER a replacement worker claimed the run. Cancellation after the last
heartbeat could also be followed by final section writes.

## Repair

The worker now passes the exact claimed run ID and attempt through the existing
`buildCsrNarratives` function to the SQL store. Each queued subject save locks
and checks the tenant-scoped parent, then the exact running narrative attempt,
and holds those locks through commit. An obsolete/requeued attempt returns
false without modifying saved text. The final section transaction performs the
same admission check before streaming; a stopped attempt raises the existing
`CSR_NARRATIVE_BUILD_NOT_RUNNABLE` refusal and rolls back.

A failed save rolls back its content. A failed final stream leaves previous
sections intact. Separately authored section 12.3.2 remains protected by its
existing compositor condition. Progress and completion updates additionally
carry explicit organization and parent-job predicates.

No model call or source retrieval runs inside a write transaction. Final
section streaming already used a transaction; the new parent/run locks last
for that streaming transaction and may delay cancellation until it commits.
A model request already sent may still incur cost; its stale result is refused.

Direct non-queued store callers remain compatible and obtain the parent lock.
Their optional attempt argument is not treated as an authorization mechanism;
the production queue supplies it internally. Existing tenant/access, source,
scientific review, signature and submission gates remain unchanged.

## Exact changes

- `server/services/csr/csr-narrative-run.ts`
- `server/services/csr/csr-narrative-store.ts`
- `server/services/csr/__tests__/csr-narrative-write-ownership.test.ts`
- `server/services/csr/__tests__/csr-narrative-write-ownership.pglite.test.ts`
- This evidence directory. No UI, route, service, dependency or schema added.

## Executed tests

Node 22.16.0 / TypeScript 5.8.3. `offline-runner.cjs` executes the actual
TypeScript regression suite and the actual worker/store implementation through
`node:test`. It replaces ONLY the test's declared collaborators: SQL boundary,
clinical composer, source adapters and logger. The SQL double checks query
scope, records locks until commit, and simulates rollback; it is not PostgreSQL.

| Same executable suite | Tests | Pass | Fail | Skip |
|---|---:|---:|---:|---:|
| Hash-verified baseline source | 17 | 2 | 15 | 0 |
| Patched source | 17 | 17 | 0 | 0 |

`execution.json` records each result and the raw-log hashes. The baseline
adapter verifies both original Git blob identities before executing them.
`transpile.json` records syntax/transpilation diagnostics and tested blob
identities. Zero transpilation diagnostics is not a whole-repository type-check.

Reproduce the isolated test (existing TypeScript dev dependency, Node 22):

```sh
node --test docs/evidence/D2-CSR/2026-11-03-narrative-write-ownership/offline-runner.cjs
CSR_TEST_BASELINE=1 node --test docs/evidence/D2-CSR/2026-11-03-narrative-write-ownership/offline-runner.cjs
```

The second command intentionally fails 15 baseline regressions. A shallow
checkout needs the baseline commit. The local run used connector-retrieved
copies in `CSR_TEST_BASELINE_DIR`; hashes are checked, not trusted by filename.

## Native qualification still required — NOT passed here

The repository dependencies and native PostgreSQL were unavailable in this
session; npm/GitHub DNS failed. Five actual PGlite migration/SQL regressions
are authored but not executed. Native Vitest, the full TypeScript check,
local pre-push gate, security/browser CI, real multi-connection row-lock tests,
Neon, live model and CSR export acceptance remain open. Queued CI is not a pass.

```sh
npx vitest run \
  server/services/csr/__tests__/csr-narrative-write-ownership.test.ts \
  server/services/csr/__tests__/csr-narrative-write-ownership.pglite.test.ts \
  server/services/csr/__tests__/csr-narrative-run.pglite.test.ts \
  server/services/csr/__tests__/csr-narrative-store.pglite.test.ts \
  server/services/csr/__tests__/csr-narrative-memory.pglite.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

For native PostgreSQL acceptance, use two authorized synthetic connections:
keep a model promise pending, requeue/reclaim, then resolve the old promise and
check no old subject or section is saved. Race cancellation against each write,
force a failed stream, and verify only the accepted attempt's hashes survive.
No live customer records, model keys or Neon settings were changed.

## Rollback

Revert this single commit through ordinary change control; no schema/data
backfill exists. Drain narrative workers first. Reversion restores the known
late-narrative write race; it does not qualify the earlier behavior.
