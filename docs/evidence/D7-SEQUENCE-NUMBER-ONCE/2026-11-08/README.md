# F1 repair A: one live sequence per number (row D7, 2026-11-08)

This is re-plan step 4, from the design `docs/evidence/RIM/2026-11-08-designs/f1-small-repairs-4-8-24.design.md`
(repair A). The coordinating session ordered it after F1 slice 2, (b), the environment binding and (c). Its ruling of
2026-11-08 was to take the identity lock inside a transaction, with a red case for two concurrent creates.

## What already exists (RULE 3), re-anchored on the tree

- `createSequence` (`server/services/submission-service/submission-service.ts`):
  - It checked the market's sequence types and the filed-elsewhere baseline (`filed-sequence-baseline.ts`), then
    inserted.
  - **It took no lock and did not run in a transaction.** The design assumed it already locked through
    `lockSubmissionPackageIdentity(…, { forUpdate: true })`. It did not, so the lock is added here.
- Nothing refused a second **live** sequence holding a number a live sequence of the same submission and region
  already held. There is no unique index on (submission, region, number). The filed fold joins compiles to sequences
  by number, so two live 0000s corrupt what the agency is read to hold.
- `transitionSequence`'s compare-and-set had no `deleted_at IS NULL`, so a sequence removed while its transition was
  in flight still moved.
- `lockSubmissionPackageIdentity` (`server/services/ectd/package-identity.ts`) already locks the submission row
  (`FOR UPDATE`) and is already used by the governed freeze.

## The change

- `createSequence` runs in one transaction:
  1. It locks the submission row exclusively (`lockSubmissionPackageIdentity`, `forUpdate`). A submission gone by
     then is NOT_FOUND.
  2. The baseline check runs.
  3. It refuses a number a live sequence of the same submission and region holds: INVALID_STATE (409, already
     mapped), "Sequence 0000 already exists in this submission. A sequence number is used once. Nothing was created."
     A removed sequence holds no number.
  4. It inserts.

  The audit row is written after commit, as before.
- `transitionSequence`'s compare-and-set adds `deleted_at IS NULL`. A removed sequence loses the compare-and-set and
  gets **the existing INVALID_STATE (409)**: "Sequence N is no longer in state '…' — it changed while this transition
  was being applied…".
- **No unique index or constraint.** A deployed tenant may already hold duplicates, so `ADD CONSTRAINT` would fail
  every deploy (RULE 1, corollary 1). Operators find existing duplicates with the read-only query below.
- Once P-86 lands, the refusal will name the retire act for a sequence that was never filed in production. That
  wording is not added before the act exists.
- No migration and no new non-test file.

## Read-only query: live duplicates already in a database

Run it as the database owner; RLS would scope it to one tenant. Each row is a submission, region and number that more
than one live sequence holds. A person decides which one stands.

```sql
SELECT organization_id, submission_id, region, sequence_number,
       count(*) AS live_sequences, array_agg(id ORDER BY id) AS sequence_ids
  FROM ectd_sequences
 WHERE deleted_at IS NULL
 GROUP BY organization_id, submission_id, region, sequence_number
HAVING count(*) > 1
 ORDER BY organization_id, submission_id, region, sequence_number;
```

## Proof (real PostgreSQL 16, as the non-owner `app_service` role with RLS on, through the routes a person uses)

`tests/db/sequence-number-once.dbtest.ts`. Each race is deterministic: another connection holds the row the act must
lock, writes, and commits. Only an act that takes the lock waits and then sees that write.

| Case | Before (`red.txt`, HEAD `a7f5b4801`) | After (`green-db.txt`) |
|---|---|---|
| a second live 0000 is refused, by name | 201 | 409 |
| two creates of 0000 in flight: the other holds the submission with a share lock and inserts 0000 | 201, so two live 0000s | 409, one live 0000 |
| a removed 0000 does not hold its number | 201 (control) | 201 |
| a sequence removed while its transition is in flight does not move | 200, moved to 'assembling' | 409, still 'draft' |

| Mutation | Result |
|---|---|
| `mutation-1-no-live-number-check.txt`: the check never refuses | the duplicate and race cases fail |
| `mutation-2-no-submission-lock.txt`: a share lock instead of an exclusive one | the race case fails. A first version of the test held the row with `FOR UPDATE`, which blocks a share lock too, and missed this; the holder now takes the share lock any act takes |
| `mutation-3-removed-sequence-transitions.txt`: no `deleted_at IS NULL` in the compare-and-set | the transition race fails |

`green-unit.txt` covers every non-DB test that names `createSequence`, `transitionSequence` or their routes, plus every
`submission-service` test: 588 pass. The one failure is `gateway-selection`'s pre-existing AUDIT_UNCONFIRMED case,
which is with the coordinating session.

Two fixtures were widened for the lock, with no assertion changed:
- `create-sequence-fda-variation.test.ts`: the db mock gains `transaction` and answers the submission lock.
- `ind-filing-flow-pglite.integration.test.ts`: the PGlite schema gains `organizations`.

## Plan

`Plan: F1`, `Completes: server/services/submission-service/submission-service.ts`. The holds are as
`.design/claude-convergence/COORDINATION.md` records them.
