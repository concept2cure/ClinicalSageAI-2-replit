# The file-to-Vault snapshot suite runs again (F1, 2026-11-09)

**The finding.** RIM (session `011e42…`) reported that
`server/services/authoring/__tests__/authoring-file-to-vault-snapshot.pglite.integration.test.ts` fails all 32 of its
cases on an unchanged tree. Every filing was refused INDEPENDENT_CHECK_REQUIRED where the suite expects it filed, or
refused for a different reason. RIM confirmed this by stashing its own change and re-running. The suite is the real
filing orchestration on PGlite, so while it was red nothing exercised the filed snapshot, its compensation, or its
header-drift refusals.

## What already exists (RULE 3)

**The independent-check ledger read.** `server/services/authoring/workflow-import-governance.ts`, `independentLedger`:
- It reads `authoring_audit_trail` joined to the chained `audit_logs`, ordered by `audit_logs.chain_seq`.
- Any read error becomes `independentRefused()`. That is right in production, where a ledger that cannot be read
  must not release.

**`audit_logs.chain_seq` in production.** `migrations/20260921_audit_logs_chain_seq.sql` adds it as `bigint` with no
default. The writer assigns it.

**The shared DDL.** `server/db/pglite-harness.ts`, `AUDIT_LOGS_PGLITE_DDL`:
- It holds every column `writeChainedAuditRow` writes.
- It lacks `chain_seq`.
- It is imported by 91 test files.

**The origin rule.** `bb999f25b6` (2026-11-06) requires an AnA-drafted document's release to carry its retained
creation receipt (WORKFLOW_ORIGIN_UNVERIFIED). That refusal is already held by
`draft-source-identity.pglite.integration.test.ts`.

## Two causes, found in turn

The cause was found by logging the swallowed error once, in a temporary local edit that was removed straight after and
never committed.

1. **No `audit_logs` table.** The suite's database had none, so the ledger read failed:
   `column a.chain_seq does not exist` once the shared DDL was added. Fix: the suite creates the table from
   `AUDIT_LOGS_PGLITE_DDL`, then adds `chain_seq bigint` exactly as the migration does.
2. **An AnA-drafted seed.** With the ledger readable, filings were refused WORKFLOW_ORIGIN_UNVERIFIED: the suite seeds
   an AnA-drafted document with no creation receipt. Fix: the suite is about the filed snapshot, not machine origin.
   Its own comment already avoids a CSR for the same reason. So the seed is a person-written document
   (`source: 'manual'`). The provenance-drift case now drifts to a different value, `moduleDefaulted: false`, so it
   still tests drift.

No production code changed.

## Red, then green

| Run | Result |
|---|---|
| At HEAD (`red-at-head.txt`) | 32 of 32 fail, INDEPENDENT_CHECK_REQUIRED |
| With both fixes (`green.txt`) | 32 of 32 pass |
| Mutation 1: no `chain_seq` | 32 of 32 fail |
| Mutation 2: the AnA seed restored | 30 fail with WORKFLOW_ORIGIN_UNVERIFIED |

The mutation results are in `mutations.txt`. Both fixes are load-bearing.

## Owed, for the holder of `server/db/pglite-harness.ts`

`AUDIT_LOGS_PGLITE_DDL` should carry `chain_seq bigint`, as production does. Then this suite's extra `ALTER` can go,
and any other suite that reaches the independent-check read stops failing the same way.

RIM holds that file for P-86 C1 (granted 2026-11-09), so the shared change was not made here. It was passed to RIM.
