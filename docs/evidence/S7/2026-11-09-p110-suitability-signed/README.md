# Suitability is a signed act, and the unsigned word is refused

**Package:** S7 (CMC / Module 3). **Date:** 2026-11-09.
**Completes:** `server/services/cmc/signed-record.ts`.
**Decision:** P-110 item 1, `docs/LAUNCH_DEFINITION_OF_DONE.md`, decided 2026-11-09 by the coordinating session
(`01JbQU…`) under the founder's delegation of 2026-11-08 (P-107). Option **(b)**; option (a) refused.

## The finding this lane raised, and what was decided

The specification approval gate honours a **validated or a suitable** method — `METHOD_SUITABLE`, which
`q2Expectation` relies on before phase 3. But **no form could record suitability**, so in practice every limit
needed a fully validated method (`docs/evidence/S7/2026-11-09-demo-cmc-methods/`). A phase-1 programme had to claim
full validation or leave every specification unapprovable.

Two options were put. The decision took (b) — extend the existing signed act — and refused (a), an unsigned
`qualified` status, **including as an interim**: *"a word typed into a GxP register must not unlock an approval
that validation reaches only by signature."*

## What already exists (RULE 3)

| Path | What it does today | Used here |
|---|---|---|
| `api/cmc/routes.ts` `qualifyRegisterRecord` | the one signing ceremony for every CMC register — authority, re-auth, row lock, the status write, the governed-action ledger and the §11.50 row | **extended.** No second endpoint, no second ceremony |
| `services/cmc/signed-record.ts` `SIGNED_REGISTERS` | *"the ONLY place the answer to 'which word does this register sign with, into which columns, at which path' is written down"* | where the outcomes are declared, and where the decision about them is made (`resolveSignedOutcome`) |
| `services/cmc/register-writes.ts` `ungovernedQualificationRefusal` / `vocabFor` | why a self-declared qualification is refused | widened from one word to the register's governed set |
| `services/cmc/analytical-method-source.ts` `METHOD_VALIDATED` / `METHOD_SUITABLE` | the one validation vocabulary, which `ich-compliance-q2.ts` imports | imported by the descriptor rather than restated |
| `services/cmc/signed-record.ts` `isSigned` / `signedRegisterEditRefusal` | a signed record's content is closed to ordinary edits | **extended to the second signed state** — see below |
| `surfaces/cmcRegisterForms.ts` `qualifyForm` / `qualifyBody` / `SIGNED_ACTS` | the Part 11 signature dialog every register uses | one optional argument; every other register's dialog is byte-identical |
| `api/cmc/governance.ts` `governedSignatureSchema` | the body every governed CMC signature takes | two optional fields |

Nothing new: no screen, route, service file, table or AnA tool.

## The act

`POST /api/cmc/analytical-methods/:id/validate` now records **which** outcome the signer attests:

| Outcome | Status written | Attests | Needs |
|---|---|---|---|
| `validated` (the default) | `validated` | full validation to ICH Q2(R2) | — |
| `phase-appropriate` | `phase-appropriate` | suitability for the stated development phase, short of full validation | the **phase** |

A request that names no outcome gets `validated`, which is what every caller sent before — the demo seeder
included — so nothing that worked stops working. The outcome and the phase are part of what is signed: they go
into the governed-action payload, the §11.50 signature's `extraManifest` (`attests`, `phase`) and the compliance
statement, which now reads *"… attesting full validation to ICH Q2(R2); ledger-chained to …"*.

**A signed step down is refused.** A method validated in full is not returned to "suitable for the phase" by a
second signature: the register would claim less than someone has already attested, with the first signature
overwritten rather than retracted. The step **up** is allowed — full validation by the pivotal phase is the point.
Each outcome carries a `rank`; a status outside the outcomes (`development`, `retired`) holds none, so neither side
of the comparison fires.

**The status is a bound parameter now.** It was `SET status = '${signing.signedValue}'` — safe, because the value
came from a closed descriptor. It is a value a request can steer now, so it travels as `$4`: a value a request can
steer does not belong in SQL text whatever validates it.

## The unsigned word, refused on an edit

`vocabFor` answers a `governedValues` set per register — every status word only that register's act may write.
For the analytical-method register that is the **whole approval-gate vocabulary** (`METHOD_VALIDATED` ∪
`METHOD_SUITABLE`), imported rather than restated. An ordinary edit setting any of them is refused 409 naming the
endpoint that does perform the act. A record still round-trips its own status, and retiring is still a lifecycle
end.

Every other register has exactly one governed word, which a case pins: the widening is this register's, not every
register's.

## The gate reads the signature, not the string

`specificationMethodVerdict` honours a `METHOD_SUITABLE` status only when the record also carries **who** attested
it and **when** — `validated_by` and `validation_date`, written by `qualifyRegisterRecord` and by nothing else
(`withoutSignatureFields` strips both from every create and edit body). `mapAnalyticalMethodPayload` now carries
the signer; the date was already there.

`METHOD_VALIDATED` is unchanged: `validated` was already reachable only through that act, and the decision speaks
to suitability's words.

### A limit of this, stated

The test is the two signature columns, not a join to `electronic_signatures`. For a row written before 2026-10-18,
when both columns were request-body fields, their presence is not proof of a signature. Every row written since
is: nothing but the ceremony writes them. A join would be the stronger check and is a larger change — the gate
reads a canonical source payload, not the register table.

## The hole the decision would otherwise have opened

`isSigned` compared the stored status to `signedValue` alone. Introducing a second signed state and leaving that
comparison would have made a `phase-appropriate` method **editable under its own signature** — the same defect
this decision exists to close, one level down. `signedStateOf` answers which signed word a record holds, across
every outcome, and the refusal names that word: a signer reading *"is validated"* about a phase-appropriate method
would not recognise their own record.

## The screen offers it

The method register's **Validate** dialog asks what is being attested (full validation, or suitability for a
phase) and offers the phase. The phase is **not** required and **not** conditionally hidden: this form is
declarative and has no conditional field, so it is offered, described as belonging to the suitability outcome, and
the server refuses a suitability signature with no phase in its own sentence, which the register surfaces. Showing
a field that is sometimes not needed is a smaller fault than hiding one that is.

`METHOD_VALIDATION_OUTCOMES` sends the server's own words and shows the person a different label, which a case
pins — a label sent as a value would fail every suitability signature with a refusal about a word nobody typed.
`qualifyBody` sends the outcome only when the dialog offered one, because a register that records one outcome
refuses a named outcome; a body that always carried one would break every other register's signature.

## Verified by making each check fail

| Run | What it reported |
|---|---|
| `01-red.txt` — the gate not yet tightened | *"an unsigned \"qualified\" supported an approved limit: expected true to be false"*, 3 of 27 red |
| `03-mutation-unsigned-word-accepted-on-an-edit.txt` — `governedValues` dropped from the vocabulary | *"an ordinary edit set the method status to \"verified\": expected null not to be null"* |
| `04-mutation-suitability-with-no-phase.txt` — the phase no longer required | 2 red; a suitability attestation with nothing it is suitable *for* |
| `05-mutation-a-signed-step-down-allowed.txt` — the rank comparison removed | suitability recorded over full validation |
| `06-mutation-the-unsigned-word-honoured-at-approval.txt` — the gate stops reading the signature; **the defect as shipped** | the route answered **200** with `approval_status: "approved"` over an unsigned `qualified` method |
| `07-mutation-the-second-signed-state-unprotected.txt` — `signedStateOf` ignores the outcomes | *"a signed suitability was editable under its signature: expected null not to be null"* |
| `08-mutation-every-register-sends-an-outcome.txt` — `qualifyBody` always sends one | 2 red, including the container closure's own dialog |
| `02-green.txt` | 157 of 157 across the five suites |

Tests: `services/cmc/__tests__/signed-outcome.test.ts` (new, 21 cases) for the act, the edit refusal and the
second signed state; `services/cmc/__tests__/analytical-method-source.test.ts` (+6, 27 total) for the gate;
`api/cmc/__tests__/specification-approve-method-gate.test.ts` (10) for the route's answer either way;
`client/.../cmcRegisterForms.test.ts` (+6, 89 total) for the dialog and the body.

## Two existing cases changed, with the reason

- **`'keeps SUITABLE passing on purpose — the repository's own Q2 reading'`** said in its own comment: *"This case
  exists so that tightening the gate to 'validated only' is a deliberate act with a red test, not a quiet edit."*
  P-110 is that deliberate act. It does **not** tighten to validated-only — it makes suitability a signed outcome
  — so the case is now `'refuses a SUITABLE status that carries no signature'`, with the early-phase reading it
  protected preserved in `'approves a procedure shown suitable for its phase UNDER SIGNATURE'`.
- **`'approves a procedure shown suitable without full validation'`** (the route case) became the pair above: one
  for the unsigned refusal, one for the signed approval.

`vocabFor`'s two `toEqual` assertions gained `governedValues`, each with a note on what the field is.

## Gates

`tsc --noEmit` 0 errors. `ci:pushed-lint-warnings`: no file changed its warning count — `resolveSignedOutcome`
reached complexity 16 and the two helpers it was refusing (`soleOutcome`, `stepDownRefusal`) are the extraction
that answered it, and one `describe` block crossed the 100-line cap and was split. All CMC suites: **96 files,
1,873 cases.** Client CMC form suites: 89 cases.

## Still open, for its owner

An edit body may still carry `validationDate`: it is a key the schema accepts, so it passes
`refuseUnrecordedFields` (`c900e79c6`), and `withoutSignatureFields` then strips it — a 200 over a field that was
not applied, which is the class of defect that commit exists to end. The right answer is a 409 saying the column is
written by the signature and not by an edit. It is the same shape for every register's signature columns, so it is
its own slice rather than a rider here.
