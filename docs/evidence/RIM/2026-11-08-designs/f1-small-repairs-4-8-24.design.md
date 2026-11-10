# F1 small repairs: one live sequence per number; readiness only for a live sequence; IND routes answer the service's status

Three repairs of shipped behaviour, from the re-plan `designs/rim-replan-2026-11-01.md` (steps 4, 8 and 24). They are
built after F1 slice 2 is committed, one commit per repair. The files are disjoint, so each commit takes only its own
files.

- Repair A (step 4): `submission-service.ts`.
- Repair B (step 8): `assess-dispatch-readiness.ts`.
- Repair C (step 24): `ind-lifecycle/shared.ts`.

The founder's decision P-86 (retire an unfiled sequence, freeing its number) is built later. This design must leave
room for it, as stated under A.

## What already exists (re-anchor on the tree; lines are from 609ef94c7)

- `server/services/submission-service/submission-service.ts`:
  - `createSequence` already checks under `lockSubmissionPackageIdentity(…, { forUpdate: true })`. The import is near
    :98.
  - Beside it is the filed-elsewhere baseline check (88229a87d, `filed-sequence-baseline.ts`): a number at or below
    the declared filed one is refused.
  - Nothing refuses a second live sequence with the same number in the same submission and region. Verified: there is
    no unique index on (submission, region, number). The filed fold joins compiles to sequences by number, so two live
    0000s corrupt what the agency holds (launch row D7).
  - `transitionSequence`'s compare-and-set has no `isNull(deletedAt)`. A soft-deleted sequence (the baseline's removal
    of drafts) can still be transitioned.
- `server/services/ectd/assess-dispatch-readiness.ts` (~:778-779): the sequence read has no `isNull(deletedAt)`. So a
  sequence the filed baseline removed can still be assessed, and reported ready, for AnA, MCP and the IND route.
  - `3cacf2e15` (AI architecture session, 2026-11-01) edited this file. Fetch first. That session has been asked
    whether it is still in the file.
- `server/routes/ind-lifecycle/shared.ts`: `fail()` answers the service's coded errors (GOVERNED_REQUIRED,
  DISPATCH_BLOCKED and the rest) as 500.
  - The canonical code→status map is `SUBMISSION_ERROR_STATUS`. Find where it is defined (`server/routes/submissions.ts`
    ~:102-110 maps codes to 422 and others). Reuse it by import; never copy it (zero duplication).
  - If it is not exported, export it from where it lives. If it lives in a route file and importing route-to-route is
    against a repo gate, move it to the submission service folder (a split stays in its folder) and import it from
    both places.

## The repairs

### A. One live sequence per number (`Plan: F1`, `Completes: server/services/submission-service/submission-service.ts`)

1. `createSequence` refuses a number that a **live** sequence (`deleted_at IS NULL`) of the same submission and region
   already holds.
   - Check under the existing identity lock, beside the baseline check, so two concurrent creates of 0000 cannot both
     pass.
   - The refusal is a coded SubmissionError the routes already map, with a sentence like: "Sequence 0000 already
     exists in this submission. A sequence number is used once."
   - The design says now that, once P-86 lands, this sentence names the retire act for a sequence that was never filed
     on production. Do not add that wording before the act exists.
2. `transitionSequence`'s compare-and-set gains `isNull(deletedAt)`. A removed sequence cannot change state. The caller
   gets the existing not-found or conflict outcome, whichever the code already uses for a lost CAS. Say which.
3. **No unique index or constraint.** A deployed tenant may already hold duplicates, so `ADD CONSTRAINT` or
   `CREATE UNIQUE INDEX` would fail every deploy (CLAUDE.md RULE 1, corollary 1). The evidence carries a read-only count
   query an operator runs to find existing duplicates.
4. **Tests** (pglite, failing first):
   - two concurrent creates of 0000, one refused;
   - a removed 0000 does not block a new 0000;
   - a removed sequence cannot transition;
   - the baseline check still refuses at or below the declared number.
5. **Mutations:**
   - drop the live-number check → the concurrent and duplicate tests go red;
   - drop `isNull(deletedAt)` from the CAS → the removed-transition test goes red.

### B. Readiness answers only for a live sequence (`Plan: F1`, `Completes: server/services/ectd/assess-dispatch-readiness.ts`)

1. The sequence read gains `isNull(ectdSequences.deletedAt)`.
2. A removed sequence is answered as not found, by name ("Sequence 0002 is not in this submission"), never as ready or
   not ready. AnA, MCP and the IND route read the same function. Check each caller still renders a not-found answer
   honestly, not as an empty or failed read.
3. **Test** (pglite): a sequence removed by the baseline's removal of drafts is answered as not found.
4. **Mutation:** drop the filter, and the test goes red.

### C. IND lifecycle routes answer the service's own status (`Plan: F1`, `Completes: server/routes/ind-lifecycle/shared.ts`)

1. `fail()` maps a SubmissionError's code through `SUBMISSION_ERROR_STATUS`, reused and never copied. An uncoded error
   stays 500 with no internal detail.
2. **Test:** `server/routes/ind-lifecycle/__tests__/routes.contract.integration.test.ts` (or the nearest existing
   contract test). GOVERNED_REQUIRED and DISPATCH_BLOCKED answer their mapped status, and an unknown error answers 500.
   Show it red first.
3. **Mutation:** revert the mapping, and the test goes red.
4. P-87 later deletes some routes in `ind-lifecycle/sequence.routes.ts`. This repair touches only `shared.ts` and its
   test, so the two do not overlap.

## Plan and coordination

- Allowed files:
  - A: `submission-service.ts`, a new pglite test in `server/services/submission-service/__tests__/`, and evidence
    `docs/evidence/D7-SEQUENCE-NUMBER-ONCE/2026-11-01/`.
  - B: `assess-dispatch-readiness.ts` and a test in `server/services/ectd/__tests__/`.
  - C: `server/routes/ind-lifecycle/shared.ts`, its contract test, and, only if needed, the file that exports
    `SUBMISSION_ERROR_STATUS`.
- Forbidden:
  - a migration, `shared/schema*` or `migration-set.mjs`;
  - any client file;
  - D0-locked files;
  - any new non-test file, except the evidence README files.
- Holds: A is inside slice 2's `submission-service.ts` hold. B and C need holds recorded by the coordinator before the
  build starts.
