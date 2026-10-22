# The interview that configures a project now configures one

**Row:** D4 — and the thing that decides whether any of this batch reaches a
user. **Task #15, closed.**

## What was wrong

`start_intelligence_flow` refuses, in production, any flow for which
`flowCommitsToRecord()` is false — because *"an interview that goes nowhere is
an empty result standing in for a refusal"* (decision P-28). Only
`cmc_specification` was on that list.

So the nine slices of this batch — the agency as a position, the route from the
filing registry, the class checked against the Annex VIII rules, the
investigational filing, the programme that is not filing in the US — made
`project_setup` governed and subject-matter intelligent, and **the launch gate
refused it anyway**, because its answers ended in a completion event and
stopped there.

Giving it a record meant finding a write. There wasn't one: the previous commit
(`2026-10-12-programme-write/`) extracted the governed programme-profile write
out of the device-profile route so there would be exactly one. This commit
projects the interview onto it.

## What now happens

`server/services/c2c/project-setup-projection.ts` — pure: answers in, one
programme-profile patch out, and **every answered field either consumed or
reported with the reason nothing consumed it**.

A device programme answered through the interview now configures:

| Column | From | Through |
|---|---|---|
| `productName`, `productCode`, `indication`, `description` | the product and identity questions | as typed |
| `deviceClass` | `device_class` | **`programmeFactsFrom`** — the same reader the route cautions use, so `no_us_filing` and `not_classified` state no class rather than becoming one |
| `regulatoryPath` | the position the person took | a **named bridge** (`US_510K` and `US_510K_IVD` are different filings and the same path; `US_513G` is neither) |
| `targetAgencies` | the primary and additional agencies | **`agencyFor`**, so the region code `US` never lands in a column that says `FDA` |
| `targetSubmissionDate` | `target_submission_date` | validated as a day |
| `priority` | `project_priority` | mapped: the interview's **`standard`** is the column's **`medium`**, and a silent pass-through would have written a value the column does not have |
| `teamMembers` | the five lead questions | name and role, never a `userId` |

Nothing is coerced. An EU conformity route maps to **no** US premarket path and
says so; an unparseable date says so; a priority the column does not have says
so.

**`COMMITTING_FLOW_CATEGORIES` now holds `['cmc_specification', 'project_setup']`,**
so the launch gate admits the interview.

## The forty answers that reach no column, each named

`NOT_PROJECTED` carries a reason per field, and they are three different
things — only one of which is work remaining:

| Kind | Examples | Means |
|---|---|---|
| **refused** | `project_name`, `project_code`, `product_type`, `development_phase` | the write refuses the column, for the reasons in `PROFILE_WRITE_REFUSALS` |
| **no column** | `eu_mdr_class`, `ivdr_class`, `notified_body`, `filing_strategy`, the partners, `team_size` | **the column work this projection documents** |
| **not a fact** | `multi_country_submission` (a gate), `setup_confirmation`, the preferences | nothing to record |

Two of those reasons are findings in their own right:

- **`predicate_device` is not projected.** The predicate OF RECORD carries the
  trade name the eSTAR prints beside the submission number, and the question
  asks only for the identifier. Projecting `K123456` as both the id and the
  name would assert a trade name the sponsor never gave. The interview should
  ask for the name; until it does, the answer is reported.
- **`eu_mdr_class` and `ivdr_class` have no column at all.** `device_class` is
  the US class and is printed on US forms. A European device programme can now
  be configured in every respect except its own classification — which is the
  next column to add, and is stated here rather than hidden.

## The gates

**`c2c/__tests__/project-setup-projection.test.ts`** (18) and
**`cmc/__tests__/programme-configuration-commit.test.ts`** (7). The structural
ones:

| Gate | Holds |
|---|---|
| `every field the interview can answer is projected or has a written reason` | walks all 54 fields of the live flow definition — a field added to the flow and to neither list fails here |
| `writes no reason, and reads no field, the interview does not ask` | the other direction, which a count cannot check: a stale entry is how a renamed field evaporates while the list still looks complete |
| `projects nothing the write cannot set` | the projection and the write agree |
| `is a patch the write accepts` | the projection's output parses against the real schema |
| `configures the SESSION’s programme, never one the plan names` | a plan body carrying a `programId` does not win |
| `refuses a session with no user rather than auditing against nobody` | Part 11 §11.10(e) |
| `records its own action` | `PROGRAMME_CONFIGURED_BY_INTERVIEW`, so the interview's write is not read as the device panel's |
| `refuses a session bound to a legacy project rather than a programme` | `projectBelongsToTenant` admits either, because the CMC registers hang off both; a legacy id would update nothing while the commit reported success |
| `is NO entry where the answers set nothing` | an empty update is never called a configuration — the commit refuses with `NOTHING_TO_COMMIT` |

## Verified by making each check fail

Twelve named mutations, all red:

| Mutation | Refused by |
|---|---|
| R1 the region code written straight into the agency column | `names the agencies as the record names them` |
| R2 `standard` passed through to a column that has no such value | `maps the interview’s priority onto the column’s`, and the write's own schema |
| R3 an unmapped route guessed as a 510(k) | `refuses to guess a US path for a route that is not one` |
| R4 the predicate identifier projected as the predicate name | `will not project a predicate identifier as a predicate NAME` |
| R5 the unreported-answer sweep removed | five tests, including `reports every answered field no column took` |
| R6 an empty patch committed as a configuration | `is NO entry where the answers set nothing` |
| R7 the launch gate left refusing `project_setup` | `names every flow that commits, and no others` |
| S1 the plan's own `programId` allowed to win | `configures the SESSION’s programme` |
| S2 a session with no user audited as actor 0 | `refuses a session with no user` |
| S3 the interview's write recorded as the device panel's | `records its own action` |
| S4 the schema check dropped from the validator | two validator tests |
| S5 the programme check dropped, so a legacy id updates nothing | `refuses a session bound to a legacy project` |

```
$ npx vitest run server/services/cmc/__tests__ server/services/c2c/__tests__ \
      server/services/ana/__tests__/cmc-launch-scope-flip.test.ts \
      server/routes/__tests__/510k-device-profile-estar-fields.test.ts
Test Files  55 passed | 1 failed (56)
     Tests  1258 passed | 2 failed (1260)

$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 (tsc exit 0) — OK, matches baseline

$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
5 lintable file(s) changed -- no file changed its warning count
```

**The two failures are not this change's** and are reported rather than
absorbed: `c2c/__tests__/node-status-follows-work.pglite.test.ts` fails the same
two cases on a clean tree (`git stash -u`, re-run, 2 failed | 16 passed) —
*"a /sign after the workflow is complete decides no step"* and *"a content PATCH
on an approved section withdraws it to drafted"*. They belong to the node-status
work, not to the interview, and they were red before this commit.

## Where this leaves the interview

It commits. The launch gate admits it. A device programme answered through AnA
now carries its class, its premarket path, its agencies, its product code, its
indication, its submission date, its priority and its team on the programme
record, audited against the person who answered — and the forty answers that
reach no column are named, with reasons, in the commit outcome rather than
dropped.

The column work those reasons describe is the next thing: the MDR and IVDR
classifications first, because a European device programme is the one that can
still not record its own class.
