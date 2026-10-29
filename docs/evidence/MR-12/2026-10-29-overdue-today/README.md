# MR-12 Stage 1, CAT2-22: the SOP register judges review-overdue against today

Row: D2 (W1). This is slice G1 of `docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md`.

## What already exists

- `client/src/concept2cure/quality/data.ts`:
  - `isReviewOverdue`, `deriveReviewDue` and `reviewRowOf` defaulted "today" to the constant `TODAY = '2026-06-04'`, a leftover of the fixtures removed on 2026-10-14.
  - Those three feed the register's overdue mark (`SopRegister.tsx` `isReviewOverdue(d.nextReviewDate)`) and the row passed to Record review (`reviewRowOf(d)`).
- The server's review-due read (`server/routes/mdx-qms.ts`) computes its own `overdue` and was right. The client derivation was wrong whenever it was used.

## What changed

- `todayUtc()` takes the UTC day at each call, so the three functions are judged against the day they run.
- The constant is gone.

## Proof

- `client/src/concept2cure/quality/__tests__/reviewOverdueToday.test.ts` sets the clock to 2026-10-29.
  - A review due 2026-07-01 is overdue, both in the register mark and in the Record review row.
  - A review due 2026-11-30 is not.
- **Shown failing first:** the test fails at HEAD with `data.ts` stashed (1 failed) and passes with the fix.
- The other Quality suites pass (236 tests), except `ControlledDocumentWorkbench.integration.test.tsx`. Its 3 cases fail identically with this change stashed, so they are already red at HEAD and not this change's.
