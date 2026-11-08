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

## The rule

`specificationMethodVerdict(methodName, source)`:

| State | Verdict |
|---|---|
| no method named at all | **refused** `METHOD_NOT_NAMED` |
| named, **not** in the register | **refused** `METHOD_NOT_IN_REGISTER` |
| the register could not be read | **refused** `METHOD_NOT_VERIFIABLE`, in its own words |
| named, in the register, no status recorded | **refused** `METHOD_NOT_FIT` |
| named, status neither validated nor shown suitable (`development`, `retired`) | **refused** `METHOD_NOT_FIT`, naming the method and its status |
| named, status in `validated \| verified \| transferred \| qualified \| suitable \| phase-appropriate \| fit for purpose` | approved |

An approved specification is a filed commitment, so the bar is that the product can **show** the limit's procedure is
fit — not merely that it has not been shown unfit. A compendial procedure is not an exception: the register records
and verifies one like any other, and `verified` and `transferred` are statuses this vocabulary already carries for
exactly that. `validated` is reachable only through the register's signed Validate action — the method form refuses a
self-declared one (`refusesUngovernedQualification`) — so the gate rests on a governed act, not on a dropdown.

The name is matched exactly, trimmed and lower-cased, never by substring: a refusal must name the method the user
actually meant, and reporting *another* procedure's status would be a false block on a governed act.

### The one thing it does not refuse, and why

A status in `METHOD_SUITABLE` (`qualified`, `phase-appropriate`, `fit for purpose`) **passes**. That is deliberate
and it is this repository's own ICH Q2 reading: `q2Expectation` in `ich-compliance-q2.ts` makes suitability
sufficient before phase 3, and a phase-1 IND's specifications are routinely approved on qualified methods. Refusing
them would block legitimate early-phase work in the name of a rule ICH does not impose there. A case exists so that
tightening this to "validated only" is a deliberate act with a red test, not a quiet edit.

## Nobody signs into a refusal

The first shape of this change asked the question inside the write transaction — which is **after** the
re-authentication. A signer typed their password and was then told the act could never complete. The status was
right and the ceremony was wrong.

The order is now authority (§11.10(g)), then approvability, then re-auth — and all three are **in the handler**, with
only the approvability read (`approvalApprovabilityRefusal`) extracted. Two tests pin the order, which a status code
cannot: with the approvability check back inside the transaction the refusal is still a 409, and with the authority
check moved after the password the refusal is still a 403; only those assertions go red.

### `ci:sign-ceremony` refused two attempts to tidy this away, correctly

The first restructure extracted the whole preamble — `checkSigningAuthority`, the preflight read and `verifyReauth` —
into one `approvalCeremonyRefusal`, because folding them in was the cheapest way back under the complexity cap. The
gate refused it:

```
✗ server/api/cmc/specificationRoutes.ts:610 (no verifyReauth/reverifySigner)
```

Moving `verifyReauth` back and leaving authority in the helper was refused too:

```
✗ server/api/cmc/specificationRoutes.ts:570  (handler at line 544)
  Identity is not authority. Ask checkSigningAuthority(userId, orgId) before the password, or
  baseline the file under `authority` with the reason the act signs nothing.
```

Its design is right, and the refusal is the gate doing its job rather than an obstacle: a ceremony folded behind a
helper is how a later edit removes one without anybody seeing it go, and the reader of a signed write should be able
to see both ceremonies and their order at the write. The gate's offered alternative — baseline the file with the
reason the act signs nothing — does not apply, because this act plainly signs something.

The complexity the extraction was buying was found elsewhere instead: the approve handler's tenant read is now
`signingTenantOf(req)`, which keeps this route's deliberate `Number()`-not-`parseInt` reading (a malformed tenant
`'7abc'` is refused, not read as tenant 7 — which `resolveOrgId` in `server/types/auth-request.ts` would do) under a
name, and puts the handler back at its baseline. The three read routes in the same file hold the raw tenant value
unconverted; converging them onto this changes what reaches `tenant_id` in their SQL, so it is its own change and not
a rider on a signature fix.

## The screen now says what it knows

The banner said "without a validated method" about a condition that is "no method recorded". Both strings are
corrected: the banner counts limits with no method and says a recorded-but-unfit method is refused at approval; the
disabled button's title says what to do rather than asserting the method failed validation.

## Verified by making each check fail

| Case | Mutation | What it reported |
|---|---|---|
| `refuses a limit whose named method is recorded as still in development` | the `METHOD_NOT_FIT` branch returns approve | *"a method in development supported an approved limit: expected true to be false"* |
| `refuses a method the register does not hold` | the unknown-method branch returns approve | *"expected { approve: true, note: 'mutation' } to match object { approve: false, … }"*, and the route case *"expected 200 to be 409"* |
| `refuses BEFORE asking the signer to re-authenticate` | the precondition moves back inside the transaction | *"the signer re-authenticated into a refusal: expected \"vi.fn()\" to not be called at all, but actually been called 1 times"* |
| `asks signing authority before the password, and before the method` | `checkSigningAuthority` moves after `verifyReauth` | *"a signer with no authority was asked for their password: expected \"vi.fn()\" to not be called at all, but actually been called 1 times"* |
| the three route cases (`…/approve` returns 409 and writes nothing) | the route stops consulting the gate — **the defect exactly as shipped** | all three refusals returned **200**; `refuses … in development`, `names no method at all`, `reads … a bare jsonb string` |

Tests: `services/cmc/__tests__/analytical-method-source.test.ts` (+11 cases, 23 total) for the rule;
`api/cmc/__tests__/specification-approve-method-gate.test.ts` (new, 9 cases) for the route — which status, which
ceremony ran, in which order, and that **nothing is written** on a refusal.

## One existing test the gate changed, and why its fixture moved

`api/cmc/__tests__/cmc-sign-signature-row.test.ts` shares one `ROW` across three ceremonies, and its own comment
already named the pattern: *"The locked row each ceremony evaluates its precondition on … Without them those three
answer 409 and never reach the signature, which is the point of the preconditions."* The specification approval now
has a fourth precondition, so `ROW` gained `test_methods: { method: 'SE-HPLC' }`. Its `project_id` is null, so the
register is unreadable for that row and the gate records the method as not evaluated rather than refusing it — which
is the behaviour pinned above, exercised incidentally here.

## Gates

`tsc --noEmit` 0 errors. `ci:sign-ceremony` OK. ESLint: no file gained a warning (`specificationRoutes.ts` stayed at
its baseline 2 — the first shape of this change pushed the approve handler to 103 lines and complexity 18, and the
restructure above took it back under the caps without moving a ceremony out of the handler). All CMC suites:
**1,771 server tests across 88 files, 267 client tests across 20 files.**

## Not fixed here: the free-text chain, with options for the founder

This gate matches a method by **name** because that is all the data model offers.
`qc_specifications.testParameters[].testMethod` is a string, `qc_specifications.test_methods` is jsonb,
`qc_testing.test_method` is text and `qc_testing.specifications` is JSON. Nothing references
`analytical_methods.id`. Three consequences, all live today:

1. Renaming a method in the register silently detaches every specification that named it — and under this gate those
   specifications stop being approvable, with a refusal that reads as a data-entry fault.
2. The process-capability engine has to refuse when criterion **strings** disagree across batches, because it has no
   other way to tell one acceptance criterion from another (`recorded-capability.ts` says so in its own header).
3. Revising a specification does not flag the QC results judged against the old limit.

**Option A — reference the register row by id.** Add `methodId` beside the existing `testMethod` string in the
specification's `test_methods`, written by the form from the method picker; the gate resolves by id and falls back to
the name only where no id is recorded. Migration is additive and needs no backfill to be correct: rows with no id
keep today's behaviour. Backfilling is an exact-name match per project, reportable row by row, with the ambiguous
ones left for a person. This is the smallest change that fixes (1) and makes (3) answerable.

**Option B — a foreign key.** `qc_specifications` gains `analytical_method_id` referencing the register, enforced by
the database. Correct, and it cannot be deployed without resolving every existing free-text row first, including
those naming methods that were never recorded. That is a data project per tenant, not a migration.

**Option C — leave it.** The gate works on names; the three consequences above remain.

The recommendation is **A**, and it is a founder decision rather than this session's: it changes what the
specification register stores, which RULE 5 reserves. Recorded in ONE_DESIGN_PLAN §3a under this package as
finding 2.
