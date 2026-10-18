# A programme change either has its audit row, or says it has not

**Row:** D4 / 21 CFR Part 11 §11.10(e)
**The other half** of the 2026-10-13 audit — the write-path lens, and the more
serious of the two. Every finding below was reproduced before anything changed.

## 1. A change could commit with no audit row, and every layer reported success

`auditService.logAction` **does not reject when persistence fails** — by
policy, because an audit-trail outage must not break the action it records. It
returns `{persisted: false}`. The programme-profile write **discarded that
result**, and its dependency type said `Promise<unknown>`.

So: the programme changed, no §11.10(e) row was written, the route answered
**200**, and the interview commit pushed its ref and marked the session
**committed**. Nothing downstream could tell a recorded configuration from an
unrecorded one.

The write now returns the outcome. The route reports it in headers, exactly as
its sibling device writes do (`setAuditRowHeaders`), because the body is a
`projects`-shaped row the list representation also returns. The interview
commit carries it on its ref, so a lost row is visible in the commit result —
the change is already committed when this is known, so a lost row is not a
reason to undo something the tenant can already see. It is a reason to say so.

## 2. The gate had stopped measuring — and the extraction is what did it

`ci:discarded-audit-write` matches `auditService.logAction`, `recordAuditRow`
and three more by name. The extraction of 2026-10-12 moved the discard into a
service as an **injected dependency**, `deps.audit.logAction(…)`, which the
matcher could not see. The gate went on printing *"no new occurrences"*, and
the route's baseline slot — `510k-device-routes.ts: 1` — was left **vacant**
for a new discard to occupy in silence.

That is baseline DP-14 laundered through dependency injection: a regression in
what the gate measures, not only in the code.

The matcher now knows `<deps>.audit.logAction` and `this.audit.logAction`, with
three self-test cases. **Removing the shape fails the self-test** — which the
baseline alone could not do, because a baselined file going quiet reads as
progress.

Two consequences, both recorded rather than absorbed:

- the route's slot is **closed**, not left vacant;
- two long-standing discards in `veeva-vault/vault-sync-service.ts` became
  visible for the first time. They are **baselined as pre-existing with a
  written note naming them, not accepted** — the sync service should read its
  own outcomes (task #20).

## 3. A zero-row UPDATE passed for a change

The UPDATE had no `.returning()` and no affected-row check, and the
validator's `programInOrganization` ran before the write — a check-then-act. A
row removed in between, or filtered by RLS, meant **zero rows changed and an
audit row naming fields it had not set.** The write now refuses when nothing
matched, and refuses before writing when the programme is not there.

## 4. A deleted programme was still reconfigurable

`deleted_at IS NULL` was tested in the validator only, never in the write
itself. It is now part of the scope the read and the UPDATE share.

## 5. The audit row could not say what the value had been

`writeChainedAuditRow` stores `old_values = null`, and the details were only
`{fields: [names]}`. The overwritten value was **destroyed with nothing able to
recover it** — §11.10(e) says previous entries shall not be obscured. The entry
now carries `before` and `after` for the fields the patch named, read from
`to_jsonb(row)` before the UPDATE and mapped through the table definition, so
the column-name/property-name difference is not a second naming convention.

## 6. The allowlist was not enforced in the write

`applyProgrammeProfilePatch` spread every key of the patch into `.set()`, and
drizzle writes any real column it finds — `status`, `leadUserId`,
`organizationId`, `metadata`. The interview's writer also passed the plan body
**unparsed**: the validator parsed it and then discarded `parsed.data`, so
zod's stripping of unknown keys never applied to what was written.

Nothing could emit those keys today, which is the whole reason to close it now
rather than after something can. The write refuses a non-settable column
itself, and the writer passes the parsed patch.

The test that claimed to prove this passed only because each probe patch was
**empty after stripping**, so the "at least one field" refinement failed — it
proved nothing about the allowlist. It does now.

## 7. A date that is not on the calendar

`targetSubmissionDate` was checked by shape alone. `2026-02-30` matched and
`new Date` rolled it silently to **2 March**. `2026-13-45` matched and then
threw inside the writer — **after** `beginInterviewCommit` had moved the
session to `committing`, which left the interview **dead**: a `complete`
session takes no further answers and every retry failed the same way. The day
must now survive the round trip.

## 8. The primary agency was recorded as a target and silently not applied

`primaryAgency` is refused by the write — it keys the Module 1 backbone, the
validation profile and the gateway — and the projection mapped the primary
answer only into `targetAgencies`. A programme answering *"EMA is primary"*
kept `primary_agency = 'FDA'`, and **nothing said so**, because the field was
on the projected list. It is now reported with what became of it.

## Verified by making each check fail

| Mutation | Refused by |
|---|---|
| A1 the audit outcome discarded again | `reports a lost audit row instead of answering as though it wrote one` |
| A2 the zero-row UPDATE accepted | `refuses a zero-row UPDATE rather than auditing a change that did not happen` |
| A3 the allowlist dropped from the write | `refuses a column outside the allowlist in the WRITE, not only at the caller` |
| A4 the before-values dropped | `carries the value each field held BEFORE, which the chain does not` |
| A5 the injected shape out of the matcher | the gate's **self-test** — and NOT the gate's own run, because the newly-baselined file going quiet reads as progress. That is why the self-test cases exist |

```
$ npx vitest run server/services/c2c/__tests__/programme-profile-write.test.ts \
      server/services/cmc/__tests__/programme-configuration-commit.test.ts \
      server/routes/__tests__/510k-device-profile-estar-fields.test.ts
Tests  45 passed (45)

$ node scripts/ci/check-discarded-audit-write.mjs --self-test
self-test PASSED — the gate flags the defect and the baseline cannot grow.
$ npm run ci:discarded-audit-write
no new occurrences. 113 baselined across 50 file(s).

$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 — OK, matches baseline
$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
9 lintable file(s) changed -- no file changed its warning count
```

`server/services/c2c/__tests__` also has two failing `node-status-follows-work`
cases. They are not this change's: they fail the same way on a clean tree, as
recorded two commits ago.

## What this does NOT fix, from the same audit

Each is a decision with a blast radius beyond this slice, and each is a task:

- **No per-programme mutation authority** (task #21). Every other
  `regulatory_programs` mutation calls `canMutateProgram`, which admits the
  programme lead or a manager; this write needs only editor+. The route has
  always behaved that way, so tightening it would change who can use the device
  panel today — a product decision, not a repair I should slip in.
- **The confirmation does not show what will be written** (task #22).
  `commit_intelligence_flow` is confirm-class, and the person confirms
  `{session_id}` while the patch overwrites programme columns. The projected
  patch and its diff belong in the proposal.
- **`team_members` now has two shapes** (task #23). The create writes bare
  strings and `GET /:id/team` skips anything else, so the interview's
  `{name, role}` objects are dropped by that reader — while `useMdxPrograms`
  reads `m.name` and drops the create's strings. The column's declared type is
  the object; the reader is what needs migrating.
- **The write is not atomic.** The sibling programme mutations use a
  transaction with `SELECT … FOR UPDATE`; this reads, then updates, on the same
  handle. The row-count check closes the window that mattered, and the rest is
  a larger change.
