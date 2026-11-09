# P-110 left a phase-appropriate method with no way out of its own signature

**Row:** D4 (CMC / Module 3 governed acts) · **Package:** S7 (server), F1 (client form) · **Date:** 2026-11-09

P-110, decided earlier today, made suitability a signed outcome of the analytical-method signature:
a method can be signed `validated` (full ICH Q2(R2)) or `phase-appropriate` (suitable for the stated
development phase). `signedStateOf` and `isSigned` were generalised to read both. **Two places were
not, and they are the two that let a signed record change at all.** Both are my own regression, from
this morning's P-110 commits.

## What already exists

| Path | What it does today |
|---|---|
| `server/services/cmc/signed-record.ts` | `SIGNED_REGISTERS` (9 registers), `signedValue` + `signedOutcomes`, `signedStateOf`, `isSigned`, `signedRegisterEditRefusal`, `retireSignedRecord` |
| `server/services/cmc/__tests__/signed-outcome.test.ts` | P-110's own cases: `resolveSignedOutcome`, the step-down refusal, `signedStateOf` over both outcomes. 21 cases |
| `client/src/concept2cure/v2/surfaces/cmcRegisterForms.ts` | `statusOptionsFor` / `statusDefaultFor`, which re-offer a signed status to a record that holds it; `METHOD_VALIDATION_OUTCOMES`, the pair the Validate drawer signs |
| `client/src/concept2cure/v2/__tests__/cmcRegisterForms.test.ts` | 89 cases over those forms, including the container-closure round trip the one-word version was written for |

Nothing new. Both fixes are inside functions that already generalise on exactly this axis — each had
been widened once before, from a hard-coded word to a per-register one, for the same class of defect
on the manufacturing-process register.

## The defect: both doors shut on the same record

An ordinary edit of a signed record is refused on purpose — `signedRegisterEditRefusal`: *"the
signature would stay on values nobody signed. **Retire it with a reason**, then record and sign a new
one."* Retirement is the one change admitted, and it is the whole escape hatch.

`retireSignedRecord` compared the stored status to `register.signedValue` **alone**. For eight of the
nine registers that is the only signed state there is. For analytical methods it is now one of two. So
for a method signed `phase-appropriate`:

- an ordinary edit → refused, because `isSigned` (correctly) says it is signed;
- retirement → refused `409 NOT_SIGNED`, *"that method is not validated"*, because the one word did not match.

The record could not be changed and could not be retired. Ever. By anyone. A GxP register with a row
that has no lifecycle end is not a register.

The client half is the same shape and was already known: `statusOptionsFor` re-offers a signed status
so a Save does not revert the signature, and it took one word, so a `phase-appropriate` method opened
its Edit drawer on `development` and the server answered 409. That is precisely the
validated-manufacturing-process defect the parameter was added for, one register over — which is why
`signedValues` is now a list and not a word.

## The change

| Path | Change |
|---|---|
| `server/services/cmc/signed-record.ts` | `retireSignedRecord` reads the stored status through `signedStateOf`, which reads every outcome. New `signedStateNames(register)` so the refusal names them all ("validated or phase-appropriate"). The audit row's `details.from` records **which** state was retired, not the register's default |
| `client/.../cmcRegisterForms.ts` | `statusOptionsFor` / `statusDefaultFor` take `signedValues: string \| readonly string[]`; a shared `signedStateHeld` is the client twin of `signedStateOf`. The method form passes the new `METHOD_SIGNED_STATES`, beside `METHOD_STATUSES` |

`METHOD_SIGNED_STATES` is pinned equal to `METHOD_VALIDATION_OUTCOMES`' values by a case in the
client suite: two lists that drift are how the one-word version survived P-110 in the first place.

## Verified by making each check fail

`01-server-mutation.txt` — `retireSignedRecord` put back to the `signedValue` comparison: 2 of 26 fail,
`expected { ok: false, status: 409 } to deeply equal { ok: true }` and the audit `from` undefined.

`02-client-mutation.txt` — `signedStateHeld` narrowed to the first signed value: 1 of 96 fails,
`expected 'development' to be 'phase-appropriate'`.

## Green

- `server/services/cmc/__tests__/signed-outcome.test.ts` — 26 passed (was 21)
- `client/src/concept2cure/v2/__tests__/cmcRegisterForms.test.ts` — 96 passed (was 89)
- `eslint` on both touched files — 0 errors; warning count on the client file unchanged at 17 (checked against HEAD by stash)
- `tsc --noEmit` — no error in either file
