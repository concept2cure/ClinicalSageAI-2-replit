# One governed write for a programme's profile columns

**Row:** D4 / task #15's first half
**Why now:** AnA's `project_setup` interview — nine slices of governed
questions in this batch — commits to nothing, because the launch-scope gate
refuses a flow whose answers reach no record (`flowCommitsToRecord`). Giving it
a record meant finding the write. There wasn't one.

## What existed

`regulatory_programs` had exactly two writers:

| Path | Writes |
|---|---|
| the create inside `POST /api/c2c/projects` | every column, once, in one transaction with the document scaffold, the submission spine and the project anchor |
| `PUT /api/510k/device/profile` | the eSTAR device facts — product name, class, path, product code, intended use, indication, the five administrative facts, the predicate of record |
| `transitionProgram` | `status` only |
| `mergeProgramMetadata` (AnA tool) | `metadata` only |

Between them: nothing. The target agencies beyond the primary one, the
priority, the submission date, the team — all columns, none settable after the
create. The review recorded this as "`regulatory_programs` has no PATCH route",
which was not quite right: there is one, for the device profile, written for
the eSTAR and living inside the route file.

## What this change does

`server/services/c2c/programme-profile-write.ts` — the patch schema, the
governed-column allowlist, the date coercion and the field-named audit row,
**extracted from the route rather than written beside it**, so the interview
commit writes a programme through the SAME path instead of growing a second
one. The route now calls it, and
`routes/__tests__/510k-device-profile-estar-fields.test.ts` passes unchanged —
which is what makes this an extraction.

**One shape, two entry points.** `deviceProfilePatchSchema` is the device
subset; `programmeProfilePatchSchema` is the whole thing. The device endpoint
carries the `device_assembly_readiness` entitlement, so widening its reach as a
side effect of giving the interview a write would be a second defect, not a
refactor. A test holds that its reach is exactly what it was.

**What it refuses, and why** — each a decision with its reason in
`PROFILE_WRITE_REFUSALS`, so a caller reports the answer rather than dropping
it:

| Refused | Because |
|---|---|
| `status` | `transitionProgram` owns the lifecycle, with its own guard and audit |
| `phase` | the WORKFLOW phase (planning … post_market) is not the DEVELOPMENT phase (preclinical, phase 1 …). They share words, and conflating them would record a programme in phase 1 as still planning |
| `programType` | it decides the document scaffold, the rule pack and the submission spine, all written in the create's transaction |
| `productType` | decides the client type and the product class, and the create refuses a device filing recorded as medicinal |
| `primaryAgency` | keys the Module 1 backbone, the validation profile and the gateway. `targetAgencies` **is** settable — it is additive, and the create writes only `[primaryAgency]` |
| `name` / `code` | a rename is its own governed action; `code` is unique per organization with its own disambiguation |
| `leadUserId` | the lead is permanently authorized to mutate the programme's evidence, so it is an authorization fact, not a profile field |
| `metadata` | `mergeProgramMetadata` already merges it, with delete semantics this patch cannot express |

**Two narrowings and one widening, each for a reason:**

- `teamMembers` takes a name and a role and **not a `userId`**, though the
  column's type carries one. A userId arriving from an interview answer or a
  tool argument is the authorization leak `leadUserId` is refused for.
- `deviceClass` stays the **US** 21 CFR 860 class. The column is printed on a
  US form by the eSTAR projection, so the MDR's seven declared classes must not
  be coerced into it; a caller holding one reports it unprojected.
- `regulatoryPath` is widened from the route's hand-written three to
  `REGULATORY_PATHS`, the governed six. `devicePathFor` can already return
  `hde`, `ide` and `exempt`, so the narrow enum refused paths the platform's
  own mapping produces.

## The gates

`server/services/c2c/__tests__/programme-profile-write.test.ts`, 18 tests. The
structural ones are the ones that will still be working in a year:

| Gate | Holds |
|---|---|
| `refuses every column on the refusal list, each of which is a real column` | every refusal names a real `regulatory_programs` column, is not settable, and carries a reason over 40 characters — a typo'd refusal protects nothing and reads as protection |
| `every settable field is a real column too` | the other direction |
| `drops a key a CALLER passed as undefined, not only one zod omitted` | zod omits unmentioned keys, so the filter looks redundant against a parsed patch; it is not, for a caller that assembles a patch from mostly-unanswered interview answers |
| `is exactly what it was, and not the whole shape` | the entitled endpoint's reach |
| `records a team member’s name and role and NOT a user id` | the authorization narrowing |
| `keeps the US class US, because the form it is printed on is US` | `IIa` refused |
| `names WHICH predicate was claimed, and that a claim was withdrawn` | the audit carries identities, and `[]` is itself the answer to "when did they withdraw the claim" |

## Verified by making each check fail

| Mutation | Refused by |
|---|---|
| Q1 the `undefined` filter removed | `drops a key a CALLER passed as undefined` — **and this one first SURVIVED**: the original test only used zod-parsed patches, which never carry an `undefined`, so it proved nothing about the filter. The test was rewritten to call the write directly, as the interview commit will. |
| Q2 the submission date stored as the raw string | `records the submission date as a date` |
| Q3 `teamMembers` accepts a `userId` | `records a team member’s name and role and NOT a user id` |
| Q4 `status` and `phase` made settable | `refuses every column on the refusal list` |
| Q5 the device endpoint widened to the whole shape | `is exactly what it was, and not the whole shape` |
| Q6 the predicate identities dropped from the audit | `names WHICH predicate was claimed` |

```
$ npx vitest run server/services/c2c/__tests__/programme-profile-write.test.ts \
      server/routes/__tests__/510k-device-profile-estar-fields.test.ts
Test Files  2 passed (2)
     Tests  28 passed (28)   # 14 of them the route's, unchanged

$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 (tsc exit 0) — OK, matches baseline

$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
no file changed its warning count
```

## What is still to come

Nothing calls the widened half yet. The next change projects `project_setup`'s
answers onto this write and flips `COMMITTING_FLOW_CATEGORIES`, which is what
stops the launch-scope gate refusing the interview. The projection will report
every answer this write cannot land — the MDR and IVDR classes, the development
phase, the filing strategy — by name, with the reason, rather than dropping it.
