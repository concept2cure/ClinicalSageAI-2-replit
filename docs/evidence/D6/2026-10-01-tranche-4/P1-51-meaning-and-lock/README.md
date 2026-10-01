# P1-51 (DP-64, DP-65): a signed act's meaning is the act's, and one record is signed once

Date: 2026-10-01 (evening). Lane: D6 (security tranche 4). Plan row P1-51; register DP-64 (Medium) and DP-65 (Low),
both found by the P0-10 verifiers. Re-read at head and reproduced on PostgreSQL before anything was changed.

## What was wrong

`server/routes/governed-signed-act.ts` is the signing ceremony twenty domain acts run through (the research-
administration finalizations, certifications, executions and determinations; IRB, IACUC and IBC approvals; a RIM
label recorded as approved; consent-form approval; deviation closure; the BLA assessment sign-off; the audit-trail and
access review records).

- **DP-64.** The ceremony checked that a meaning was in the closed vocabulary (`authorship`, `review`, `approval`,
  `responsibility`, `release` and the task board's upper-case four) and nothing more. Any meaning was accepted on any
  act: a biosketch was finalized "as review", or "as release", and the signature row said so. 21 CFR 11.50(a)(3)
  makes the meaning part of the signature's manifestation; a meaning the act cannot have is a false record. (Annex 11
  §14 asks the same.)
- **DP-65.** The domain writes read the record's state without locking it (`finalizeBiosketchTx` reads
  `status`, then updates). Two signs of one record that both read it as a draft both wrote: two
  `electronic_signatures` rows for one act, both answered 201.

Reproduced (`red/signed-act-meaning-and-lock.dbtest.txt`, 3 of 5 failed): `review` → 201, `release` → 201; two
concurrent finalizations → `[201, 201]`, signature ids 1001 and 1002 on one biosketch.

## Decision (product owner and CSO)

Each act declares the meanings it can carry, from four sets in `server/services/part11/signature-meanings.ts`,
named for what the signer does:

| Set | Meanings | Acts |
|---|---|---|
| `DECISION_ACT_MEANINGS` | approval, responsibility | grant closeout, subaward execution, NCE approval, research-agreement execution, export-control determination, committee determination, coverage-analysis finalization, effort certification, Other Support certification, consent-form approval, IRB / IACUC / IBC approval, RIM label approval |
| `AUTHORED_RECORD_ACT_MEANINGS` | authorship, approval, responsibility | biosketch and data-management-plan finalization (the signer may be the author) |
| `SIGN_OFF_ACT_MEANINGS` | review, approval, responsibility | BLA assessment sign-off, deviation closure |
| `REVIEW_ACT_MEANINGS` | review | audit-trail and access review records |

`release` is on no list: none of these acts releases or submits anything. The ids are the sign dialog's, as the
service-level ceremony (`governed-signature-ceremony.ts`, report finalize and protocol signing) already uses them.

## What changed

- `server/routes/governed-signed-act.ts`: `SignedAct` requires `target` and `meanings`.
  - A meaning outside the act's set is refused 400 `MEANING_NOT_ALLOWED`, with the sentence the service-level
    ceremony gives, before the signer's role or password is checked (no guess is spent).
  - After `BEGIN` and the tenant context, the ceremony takes a transaction lock on the act's target
    (`pg_advisory_xact_lock`, keyed by organisation and target) and holds it to `COMMIT`. A second sign of the same
    record waits, then reads what the first left, and its domain write refuses (`INVALID_STATE`, 409).
  - The domain write must return the target it declared; a mismatch rolls back as a 500.
- The twenty call sites in seventeen route files declare `target` and `meanings`.
- `server/routes/audit-compliance-reviews.ts` had its own copy of the rule for review records (400
  `SIGNATURE_MEANING_NOT_REVIEW`, added with P1-25). It is folded into the ceremony (`REVIEW_ACT_MEANINGS`), and the
  now-unused `REVIEW_MEANING` constant is removed. The refusal code for that route becomes `MEANING_NOT_ALLOWED`; no
  client reads the old code (the review dialog offers `review` only), and `tests/db/compliance-review-records.dbtest.ts`
  is updated to the new code.

## Tests

| Test | Red (head) | Green |
|---|---|---|
| `tests/db/signed-act-meaning-and-lock.dbtest.ts` (new, 5 cases, runtime role with RLS on, real biosketch domain write): `review` and `release` refused 400 `MEANING_NOT_ALLOWED` with nothing written; control, `authorship` signs and the row says so; two concurrent finalizations with the row held until both wait → one 201, one 409 `INVALID_STATE`, one signature | `red/signed-act-meaning-and-lock.dbtest.txt`: 3 failed | `green/signed-act-meaning-and-lock.dbtest.txt`: 5 passed |
| The lock is what closes DP-65: the same suite with the ceremony's lock removed | — | `red/mutant-no-target-lock.txt`: 1 failed (the concurrency case) |

The race is deterministic: the owner holds the biosketch row (`FOR UPDATE`) and lets go only once two backends wait
on a lock. At head both requests had read the draft and waited at the `UPDATE`; with the fix the second waits at the
ceremony's lock before it reads anything.

Neighbours: `green/neighbour-dbtests.txt`, six database suites (`research-admin-sign-ceremony`,
`domain-sign-ceremony`, `compliance-review-records`, `compliance-review-fix-round`, `compliance-review-reports`, and
this one), 147 passed. Eleven unit suites that import the ceremony, the meanings or these routes, 194 passed
(`green/neighbour-units.txt`). `ci:sign-ceremony` OK. ESLint per file unchanged from head; the new dbtest has no
warnings. Typecheck 0 errors. A new route cannot leave the rule out: `target` and `meanings` are required, and a copy
of head's `export-control.ts` in the tree failed the typecheck with TS2345 ("not assignable to parameter of type
'SignedAct'"), seen by accident while the ESLint comparison had it in place.

## What remains

- The service-level ceremony (`server/services/part11/governed-signature-ceremony.ts`) is a second implementation of
  the same capability under the same name. Report finalize locks its row; the protocol signing writes were not
  re-checked for DP-65 here. Merging the two ceremonies is the zero-duplication fix and is recorded as a residual.
- The CMC signatures (`server/api/cmc/*`) take their meaning from CMC's own list and do not run through either
  ceremony; not re-checked here.
