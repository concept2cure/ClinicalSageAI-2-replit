# P-122: the IND registers are reached on the IND screen (2026-11-10 and 11)

Three registers the IND lifecycle routes already kept, with no screen, are now sections of the IND screen in
Submission Center (`IndLifecycle.tsx`, "Forms and letters", P-32). Production serves them, and each route admits the
submission's project before it answers.

## What already exists (Rule 3)

| Piece | Path | Before this work |
|---|---|---|
| Cross-reference and letter-of-authorization register, with LOA-coverage QC | `server/routes/ind-lifecycle/registers.routes.ts` | Built; no screen; unclaimed, so production refused it |
| Annual-report tracker (21 CFR 312.33): due date, open sections, overdue feed | same file, `ind-annual-report-persistence.ts` | Built; no screen; refused |
| Amendment tracker (312.30, 312.31): the server's plan of classes, leaves and advisories | same file, `ind-amendment-persistence.ts` | Built; no screen; refused |
| The IND screen | `client/src/concept2cure/v2/surfaces/IndLifecycle.tsx` | Showed the filing work, not the registers |
| Exact `:param` claims | `server/services/entitlements/api-prefix-map.ts` (`01eaa6669`) | Available since Sequence QC |
| Safety-report and ICSR registers | `registers.routes.ts` | Kept shut by P-32; still unclaimed (`ind-launch-claim.test.ts`) |

Nothing was built beside these. The sections are in one new file in the same folder, `SubmissionIndRegisters.tsx`,
mounted by `IndLifecycle.tsx`. No screen, mount or table was added.

## What changed

- **`9e0a084da` cross-references and letters of authorization.** Every file the IND relies on, the server's
  coverage verdict, and the routes' own actions: record one, file its letter as the m1.4.1 leaf of a new sequence,
  mark a letter on file or not, remove one.
- **`6f8f42c9e` annual reports.** Each tracked report with its period, due date or "Not known", open sections and
  state; the server's overdue feed; tracking one.
- **`906a3114b` amendments.** Each tracked amendment with its kind in words, the leaves the server planned, its
  advisories and state; tracking one from a changed document.
- **Access.** The routes answered for any submission of the organisation. Each now admits the submission's project
  first, and a change needs write permission on it. With the claim alone, the DB test showed another organisation
  answered 200, a colleague who does not edit the project recorded a row, and a colleague off a private project
  read its register. Those runs are filed as `red-db-claim-only.txt` in each folder.
- **Buttons.** The sections came in with the retired `btn sm` (19 uses), which took the D0 ratchet from 14 to 31.
  They now use `btn small`, the canonical class; both resolve to one CSS rule, so nothing looks different.
- **The gate test.** `launch-scope-api-gate.test.ts` compared claims with called paths as plain strings, so a claim
  with `:id` never matched the walker's `:p`. It now compares parameter segments as one.

## Red and green

Per register, in `1-cross-references/`, `2-annual-reports/` and `3-amendments/`: the claim test and the DB test
before the claim, with the claim alone, and green; the client test before the section and green.

On the tree of this commit:
- `tests/db/p122-ind-registers.dbtest.ts`: 58 of 58, as `app_service` with RLS on and the production gate;
- `submissionIndRegisters.test.tsx` and the retired-name ratchet: 94 of 94;
- `launch-scope-api-gate.test.ts`: 43 of 43;
- `ci:launch-scope-api` (666 paths, none refused), `ci:undefined-css-classes`, `ci:class-vocabulary`,
  `ci:sql-interpolation`: OK.

## Not done

- **Screenshots.** The session that built this was cut off before its browser walk, so there are no before-and-after
  screenshots here. The sections are covered by the client and DB tests above; the walk is owed.
- **Readiness snapshots and portfolio drift** (the inventory's items after these three) are not reached.
- **One report and one amendment by id** have no caller and stay unclaimed.
