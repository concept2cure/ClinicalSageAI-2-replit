# AnA consolidation: honest failure counts and per-item isolation

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `43b0f26a228c3c683f8a5cf25d41a7ce874ae5e9`  
Plan: F1; launch row D2 repair evidence, not closure.  
Completes: `server/services/memory-consolidation-job.ts`.

## What already exists

- `server/services/memory-consolidation-job.ts`: the existing stale-memory scan, tenant-scoped promotion, acceptance-gate call, optional embedding, transaction/duplicate guard, result counters and nightly entry point. This is the only production file changed.
- `server/services/ana-ri/memory-acceptance.ts`: the existing gate repaired in the previous batch. Its scoring, decisions and deduplication are not changed here.
- `server/db/withTenantConnection` and `server/db/scheduledOnce.ts`: the existing tenant scopes and cross-process scheduler lease. No replacement connection, queue or scheduler is introduced.
- `server/services/__tests__/memory-consolidation.pglite.integration.test.ts` and `tests/db/scheduler-jobs-under-rls.dbtest.ts`: existing database and scheduler acceptance suites, retained unchanged and not executed in this environment.

Connected searches covered `runConsolidation`, the job and its callers/tests; repository rules, plan ledger and coordination material were reviewed. F1 is the existing repair lane; no file hold on this job appeared in the inspected coordination record. The complete original source was reconstructed from connector reads and verified against Git blob `0bad5540fb8d663267506ef49e426cf2af4f3f39` before testing. Container DNS prevented a clone, dependency installation and deleted-history inspection. This limitation is not a successful history audit.

## Reproduced defects and repair

1. The inner promotion caught parse, comparison-read, gate and persistence errors and returned `skipped`. The cycle counted a harmless skip while `errors` remained zero. It now returns a distinct internal `failed` outcome; the existing public error counter increments, without also counting a skip or promotion.
2. Tenant-scope acquisition/release errors occurred outside that inner catch and reached the batch catch. One failed item could stop the rest of the selected batch. The existing per-item wrapper now accounts for that attempt and allows the next item to acquire its own tenant-scoped connection. No scope is widened or reused across organizations.
3. Exception objects/messages could repeat source text or SQL/provider payloads in logs. These failure paths now log fixed operational messages and the existing memory identifier, not arbitrary exception payloads. Embedding remains best-effort: its failure warns and permits durable storage without an embedding, exactly as before.

Missing profiles, empty content and a concurrently existing summary remain legitimate skips. Gate rejection, contradiction quarantine and successful promotion retain separate counters. A failed scan remains a batch-level error with no invented row results. Scheduler lease skips/errors retain their existing return shapes; acquired runs expose the cycle's actual counts through the existing `value` field.

A COMMIT acknowledgement or scope-release failure can occur after the database has committed. Such an attempt is reported as unconfirmed, not as proof of rollback or a confirmed promotion. The existing duplicate guard remains in place for a later retry. This change does not implement database recovery, rerun jobs automatically or rewrite historical records.

The scan SQL, transaction/duplicate guard, acceptance call and persisted-value mapping are byte-for-byte unchanged; their hashes are recorded. Existing noncontradiction low-confidence `pending_review` verdicts are still mapped to active entries by this caller. That is a separate review-policy/persistence gap, not validated or endorsed by this reporting repair; the preservation test prevents silently changing that policy in this batch.

No new production file, service, route, tool, table, dependency, model, UI, licensing rule or regulatory pathway. This shared job is not conditional on a CSR or industry label.

## Executed verification

The same 32-case Node suite executed the complete original and repaired production job:

| Version | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Baseline | 10 | 22 | 0 |
| Repaired | 32 | 0 | 0 |

Actual job parsing, composition, control flow, SQL construction, transaction calls, counters and scheduler wrapper execute. Database/transaction responses, tenant connection lifecycle, acceptance verdicts, embedding, scheduler lease/cron and logging are explicitly controlled collaborators. No PostgreSQL, RLS, advisory lock, native gate algorithm or provider is exercised by this suite. A simulated committed row is not database proof.

Cases include malformed JSON/dates, read/gate/transaction failures, failed rollback, scope acquisition/release, later-tenant continuation, mixed outcomes, retry, lost COMMIT acknowledgement, scheduler failures and redaction of synthetic private exception payloads. Production TypeScript transpilation had no syntax diagnostics and the Node test runner passed its syntax check. Full semantic typechecking was not run.

`case-results.tsv` records every case. `execution.json` records runtime versions and source/test/log hashes. `raw-results.tar.xz` contains the actual before/after TAP logs, not CI output. Full repository build/typecheck, pre-push hooks, existing PGlite/RLS suites, live nightly scheduling and authenticated/deployed AnA acceptance remain unverified.

## Reproduction and publication

```sh
node --test tests/services/ana/memory-consolidation-outcomes.test.cjs
C2C_CONSOLIDATION_SOURCE_ROOT=/path/to/baseline node --test tests/services/ana/memory-consolidation-outcomes.test.cjs
npx vitest run server/services/__tests__/memory-consolidation.pglite.integration.test.ts
```

The baseline root needs the single original job file. The runner uses installed TypeScript; `C2C_TS_PATH` may name an existing installation. Nothing is downloaded. It does not change the job's SQL or copy the job implementation into a test substitute.

Publish on the current base tree using an expected-head, non-force update of `concept2cure-v2`, followed by changed-file verification and remote readback. No PR or alternate branch. Direct connector writes do not execute local pre-push hooks. This receipt alone does not prove publication. Rollback is an ordinary revert; no migration or backfill is needed.
