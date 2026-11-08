# A GxP screen promised a refusal the server never performed

**Package:** F1 (repairs: defects in shipped behaviour; no new screen, mount or table).
**Date:** 2026-11-08. **Completes:** `server/api/cmc/specificationRoutes.ts`.

## The defect

The Specifications tab of CMC / Module 3 told a CMC user, in two places:

- the tab's own copy — *"A limit whose method is not validated cannot be approved."*
- a banner over the table — *"N specification without a validated method. A specification cannot be approved
  until its analytical method is validated (ICH Q2)."*

`POST /api/cmc/specifications/:id/approve` checked not-found, already-approved, signing authority (§11.10(g)),
re-authentication, the governed reason and the ledger. **It never looked at the method.**

The screen's own check was weaker than its words. `noMethod` is `!method` (`cmcSpec.ts:165`) — *"no method NAME was
typed"*. So a specification naming `SE-HPLC`, whose register row was still `development`, satisfied the banner, the
disabled state and the server alike. And because the only check lived in the client, any caller that was not the
form — an AnA tool, a script, `curl` — approved freely in every case, including with no method at all.

A gate that is stated and not enforced is worse than no gate: a reader takes it as having been applied.

## What already exists (RULE 3)

| Path | What it does | Used here |
|---|---|---|
| `services/cmc/analytical-method-source.ts` | reads every analytical method recorded for an (org, project) from the canonical source-object store, with `validationStatus` **and** `validationStatusRecorded` | the register read, and the new verdict's home |
| `services/cmc/ich-compliance-q2.ts` | the ICH Q2 check; held `VALIDATED` and `SUITABLE` as module-private sets | the vocabulary, now shared rather than copied |
| `api/cmc/specificationRoutes.ts` `approvalTargetRefusal` | "why can this not be approved now?" | extended, not duplicated |
| `surfaces/cmcSpec.ts` `specRowFromApi` | reads `test_methods` as `{method}` **or** a bare jsonb string | the gate resolves the name the same way |

Nothing new: no screen, route, service, table or AnA tool. Two constants moved to the module that owns the record
whose field they interpret, and one function was added beside them.

## The rule, and why it refuses only what it knows

`specificationMethodVerdict(methodName, source)`:

| State | Verdict |
|---|---|
| no method named at all | **refused** `METHOD_NOT_NAMED` |
| named, in the register, status recorded, neither validated nor shown suitable (`development`, `retired`) | **refused** `METHOD_NOT_FIT`, naming the method and its status |
| named, in the register, status in `validated \| verified \| transferred \| qualified \| suitable \| phase-appropriate \| fit for purpose` | approved |
| named, **not** in the register | approved, recorded as not evaluated |
| named, status never recorded | approved, recorded as not evaluated |
| the register could not be read | approved, recorded as not evaluated, with the reason |

The three non-refusals are deliberate and follow this module's own doctrine, which its header already stated for
ICH Q2: *"Empty is NOT 'unvalidated'. A method whose validation status was never recorded has not been shown to fail
validation."* Failing closed there would block legitimate work — a pharmacopoeial procedure (USP <711>) has no
register row by nature, and a project that records a specification before any method has an empty register. The
promise the screen makes is kept exactly: **when the product knows the method is unfit, it refuses; when it does not
know, it does not claim to.**

The name is matched exactly, trimmed and lower-cased, never by substring: a refusal over the *wrong* method would be
a false block on a governed act, and certainty is the right bar for one.

## The screen now says what it knows

The banner said "without a validated method" about a condition that is "no method recorded". Both strings are
corrected: the banner counts limits with no method and says a recorded-but-unfit method is refused at approval; the
disabled button's title says what to do rather than asserting the method failed validation.

## Verified by making each check fail

| Case | Mutation | What it reported |
|---|---|---|
| `refuses a limit whose named method is recorded as still in development` | the `METHOD_NOT_FIT` branch returns approve | *"a method in development supported an approved limit: expected true to be false"* |
| `does NOT refuse when the register could not be read` | fail closed on an unreadable register | *"a failed read blocked a signature: expected { approve: false, … } to match { approve: true, evaluated: false }"* |
| `matches the name exactly, never by substring` | `===` → `.includes()` | *"\"HPLC\" was refused on \"SE-HPLC\"’s status"* |
| the three route cases (`…/approve` returns 409 and writes nothing) | the route stops consulting the gate — **the defect exactly as shipped** | all three refusals returned **200**; `refuses … in development`, `names no method at all`, `reads … a bare jsonb string` |

Tests: `services/cmc/__tests__/analytical-method-source.test.ts` (+10 cases, 22 total) for the rule;
`api/cmc/__tests__/specification-approve-method-gate.test.ts` (new, 5 cases) for the route — which status, and that
**nothing is written** on a refusal.

## One existing test the gate changed, and why its fixture moved

`api/cmc/__tests__/cmc-sign-signature-row.test.ts` shares one `ROW` across three ceremonies, and its own comment
already named the pattern: *"The locked row each ceremony evaluates its precondition on … Without them those three
answer 409 and never reach the signature, which is the point of the preconditions."* The specification approval now
has a fourth precondition, so `ROW` gained `test_methods: { method: 'SE-HPLC' }`. Its `project_id` is null, so the
register is unreadable for that row and the gate records the method as not evaluated rather than refusing it — which
is the behaviour pinned above, exercised incidentally here.

## Gates

`tsc --noEmit` 0 errors. ESLint: no file gained a warning (`specificationRoutes.ts` stayed at its baseline 2 — the
first shape of this change pushed the approve handler to 103 lines and complexity 18, so the gate was folded into
`approvalTargetRefusal`, which is the one function that already answers "why can this not be approved now?"). All CMC
suites: **1,729 server tests across 85 files, 267 client tests across 20 files.**

## Not fixed here

The chain this gate walks is still joined by free text, not by reference: `qc_specifications.testParameters[].testMethod`
is a string, `qc_testing.test_method` is text and `qc_testing.specifications` is JSON. That is why the match has to be
on a name at all, and why a specification revision still does not flag the results judged against the old limit. It
is recorded in ONE_DESIGN_PLAN §3a under this session's package as finding 2.
