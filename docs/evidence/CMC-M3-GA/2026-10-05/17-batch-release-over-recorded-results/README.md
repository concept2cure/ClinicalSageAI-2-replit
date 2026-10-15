# A batch release is signed over the batch's recorded QC results

Row **D2**, with D5 for 21 CFR Part 11 §11.50 and §11.70, and 21 CFR 211.22,
211.165 and 211.192. Found by the GA client-surfaces review (2026-10-05),
`tab-batch` (P0).

## The defect

`POST /api/cmc/batch-records/:id/release` evaluated `releaseTesting` from the
**request body**. The board sent `{}`. Zero tests evaluated counts as "all tests
passed", so a §11 release signature landed on a batch with no result recorded
against it.

- The button was gated by a client-side rule: deviations = 0 **and yield ≥
  90%**. No regulation states the yield rule.
- Any other caller could send whatever results it liked, and the release record
  carried them.

## The fix

**`server/services/cmc/batch-release-evidence.ts`.** A disposition is evaluated
over the **qc_testing** rows recorded against this batch number, in the
batch's program:

| Decision | Needs |
|---|---|
| Released | At least one recorded result; every one **reviewed** by a second person; none failing |
| Conditional release | At least one recorded result; none failing. A result may still await review, which is what makes it conditional |
| Rejected | Nothing. A rejection can always be signed |

A refusal is 409 `RELEASE_EVIDENCE`. It names what is missing (no result,
failing samples or unreviewed samples) and comes **before** the signer is asked
for anything.

- The evaluation decides the signature's meaning, as before.
- The signing transaction locks the batch (`FOR UPDATE`) and re-reads the
  results. If they changed while the signer re-authenticated, it refuses with
  409 `EVIDENCE_CHANGED` and nothing is signed.
- The release record carries the **recorded** results (QC id, sample, method,
  result, criterion, verdict, reviewed). A `releaseTesting` in the body is
  ignored.
- `pending-review` is no longer a release outcome. An approval over a failing
  result is refused, not signed and parked.

**Screen.** The release button no longer applies the yield rule. Open
deviations still block it, under 21 CFR 211.192. The card and the release form
say what a release is signed over. The server says what is missing.

Also in this change: `app.use('/api/cmc', authenticateToken)` is now the
**first** `/api/cmc` mount, ahead of the write-role gate, so the gate reads a
role established in every boundary mode. `cmc-write-role-gate.test.ts` pins
that order. On the previous order (authenticator below the core router) it
fails with "the bare /api/cmc authenticator: expected 6573 to be less than
3750".

## Red, then green

- **Route** (`cmc-sign-signature-row.test.ts`).
  - Against the previous route (`red-unit-before.txt`), 5 of 26 fail. It
    signed:
    - an approval over a failing result;
    - a release with nothing recorded;
    - a full release over an unreviewed result.

    It also carried the request's made-up results, and signed over results
    that changed mid-signature.
  - After (`green-unit-after.txt`), 26 of 26 pass.
- **Real PostgreSQL, under RLS, as `app_service`**
  (`domain-sign-ceremony.dbtest.ts`). The batch fixture now records one
  reviewed, passing QC result: **53 of 53 pass** (`green-dbtest-rls-after.txt`).
- **Staff simulation, real server** (`green-simulation-after.txt`). Step 26 now:
  1. tries to release B-001 with nothing recorded against it: 409
     `RELEASE_EVIDENCE`, whatever the request claims;
  2. records B-001's release assay, which a second person reviews;
  3. releases it under a signature.

  **153 passed, 0 failed.** The run includes the retirement of the routers
  nothing called (`15-retired-cmc-routers`).
- **Wider runs.** Every CMC route suite, CMC service suite, bootstrap suite and
  CMC client suite pass: 72 files, 1,178 tests.
