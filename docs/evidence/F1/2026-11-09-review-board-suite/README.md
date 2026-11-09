# The Review board's authoring-store suite runs again (F1, 2026-11-09)

**The finding.** RIM (session `011e42…`) reported that
`server/routes/__tests__/review-board-authoring-store.pglite.integration.test.ts` fails 11 of its 20 cases on trunk.
It confirmed this on an unchanged tree. Every review request, verdict and submit was refused INDEPENDENT_CHECK_REQUIRED
(`red-at-head.txt`). It has the same root as the file-to-Vault snapshot suite fixed earlier today
(`docs/evidence/F1/2026-11-09-snapshot-suite-audit-logs/`).

## What already exists (RULE 3)

- **The independent-check ledger read.** `server/services/authoring/workflow-import-governance.ts`,
  `independentLedger`, reads `authoring_audit_trail` with the chained `audit_logs` rows, ordered by
  `audit_logs.chain_seq`. It verifies each chained row's link and seal (`verifySequencedRow`). Any read or
  verification failure is refused.
- **`migrations/20260921_audit_logs_chain_seq.sql`.** It is production's chain position: the column, its sequence
  `audit_logs_chain_seq_seq`, and the trigger `trg_audit_logs_chain_position`, which assigns a chained row its
  position.
- **The suite's database.** It creates `audit_logs` from `AUDIT_LOGS_PGLITE_DDL`, which has no `chain_seq`, and
  applies a list of real migration files.

## Cause, found in turn

1. **No `chain_seq` column.** The ledger read failed. Adding only the column (the snapshot suite's first fix) moved the
   suite from 11 failures to 6.
2. **No chain position.** The real writer's chained rows got no `chain_seq` without the migration's trigger, so the
   CREATE row failed verification. This was found by logging the read's rows once, in a temporary local edit that was
   removed straight after.
3. **A stale assertion.** One case expected the comment's author to be the reviewer's email. The board names a
   commenter by name, falling back to the email (`authoring-review-board.ts:367`, since 2026-09-22), and the comment
   now records the name. The assertion expects `REVIEWER.name`.

## The change

- **This suite.** It applies `migrations/20260921_audit_logs_chain_seq.sql`, the production file, first in its
  migration list. The one stale assertion is updated.
- **The snapshot suite.** Its bare `ALTER … chain_seq bigint` becomes the same migration file, so both suites hold
  production's chain position exactly. It still passes 32 of 32.

No production code changed. The shared `AUDIT_LOGS_PGLITE_DDL` is unchanged: four other suites add `chain_seq` themselves
as BIGSERIAL. RIM checked this and it was decided today (COORDINATION).

## Proof

| Run | Result |
|---|---|
| At HEAD (`red-at-head.txt`) | 11 of 20 fail |
| Column only | 6 fail |
| With the migration and the assertion (`green.txt`) | 20 of 20 pass |

- **The review suites:** 5 files, 73 tests, all pass.
- **The snapshot suite:** 32 of 32 with the migration file.
- **ESLint:** clean.
