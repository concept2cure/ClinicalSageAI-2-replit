# The method register offered a phase-appropriate method an Edit the server refuses, and no Retire

**Row:** D4 (CMC / Module 3 governed acts) · **Package:** S7 · **Date:** 2026-11-12

Found by the Part 11 screen audit of 2026-11-12 (read-only; finding CMC-GOV-01), confirmed by reading
`cmcRegisters.tsx` before anything was changed. It is the screen half of a regression this lane introduced with
P-110 and fixed on the server and in the drawer on 2026-11-09 (`../2026-11-09-p110-both-doors-shut/`).

## What already exists

| Path | What it does today |
|---|---|
| `server/services/cmc/signed-record.ts` | `signedStateOf` reads both outcomes of the method signature as signed; `signedRegisterEditRefusal` refuses an ordinary edit of either; `retireSignedRecord` retires either with a reason |
| `client/.../surfaces/cmcRegisterForms.ts` | `METHOD_SIGNED_STATES` (`validated`, `phase-appropriate`); `signedUpdateBlocked`, `retireSignedForm`, `retireSignedBody` — the sentence and the form every signed register uses |
| `client/.../surfaces/cmcRegisters.tsx` `CmMethodLibrary` | The register's row actions: Edit, Validate, Retire |

Nothing new: the two helpers and the list existed; the method card passed them the one word `validated`.

## The defect

On a method signed **phase-appropriate**:

- **Edit was enabled.** The drawer opened, the person typed, and the save answered 409 — the server refuses an
  ordinary edit of a signed record.
- **There was no Retire.** `retireSignedAction(…, 'validated', …)` shows it only on the word `validated`.

So the only door the screen showed out of that record was to sign it again as validated. The server was right
throughout; the screen invited the wrong act and hid the right one.

## The change

`methodSignedWord(status)` in `cmcRegisters.tsx` returns whichever signed word the method holds. Edit's
`disabledReason` and Retire's `when` and form use it, so both read "Phase-appropriate under a recorded signature…"
or "Validated under a recorded signature…" as the record is. **Validate stays** on a phase-appropriate method: the
step up to full validation is the point of that signature, and the server refuses only the step down. The header
line also counts them: "1/3 validated · 1 signed suitable for phase".

`cmcRegisterForms.ts` is held by another session today and is not touched: the change imports its existing exports.

## Verified

- `cmcMethodSignedOutcomes.test.tsx` — 5 cases over the real register component.
- Against the one-word behaviour (the two lines put back): **2 of 5 fail** — `AM-002: expected false to be true`
  (Edit enabled) and `expected null to be truthy` (no Retire). Restored: 5 of 5, and the 6 header-honesty cases.
- `eslint` on `cmcRegisters.tsx`: the same 2 warnings as trunk. The file stays under the 100 kB ceiling (99,663).
- Not yet opened in the running app at the time of this commit; the app walk that follows covers it.
