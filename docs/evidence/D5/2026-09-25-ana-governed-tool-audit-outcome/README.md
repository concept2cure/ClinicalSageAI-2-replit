# AnA's governed change-control and fact tools say whether their audit row exists

**Row:** D5 (Part 11: every governed change leaves a record, and nobody is told
it does when it does not). **Session:** `…01AiwZKG`. **Date:** 2026-09-25.
**Source:** the WO-16C audit-outcome lane's hand-on, item 2
(`docs/work-orders/README.md`).

## What was wrong

**QMS change control, a launch app.** AnA's `qms_change_create`,
`qms_change_transition` and `qms_change_link`
(`server/services/ana/AnaToolExecutor.ts`) wrote their §11.10(e) row as
`void auditService.logAction(...)`. `logAction` never rejects on a persistence
failure; by policy it resolves `{ persisted: false }`. So the change request,
lifecycle move or cross-reference committed, and AnA told the user "Raised
change CC-…", "Change 12 → approved" or "Linked …" whether or not the record of
who did it existed. The REST routes for the same actions (`routes/mdx-qms.ts`)
already carry the outcome as `meta.auditTrail`.

**Governed facts.** `establishGovernedFact` and `applyFactChange`
(`server/services/living-record/fact-change-orchestrator.ts`) awaited the same
write and discarded the result. A governed value could be established or
re-versioned, with citations flagged and a resolution plan opened, and no
caller could tell whether the record of the change existed. The callers are
the REST route `routes/change-propagation.ts`, which answers the result as-is,
and AnA's `establish_governed_fact` / `apply_fact_change`. The hand-on said the
tools would drop an outcome their services carried. In fact the services
carried none.

## The change

- **The three change-control tools** write through `recordAuditRow`, return
  its outcome as `auditTrail`, and append the lost-record notice to their
  message when the row was not written (`withAuditNote`).
- **The two orchestrator writes** go through `recordAuditRow`.
  `ApplyFactChangeResult` and `EstablishFactResult` carry `auditTrail`, so the
  REST route answers it with no route change, and the two tools pass it on in
  the same way.
- **What the caller is and is not told.** The action stands either way, as the
  REST routes already hold; the caller is now told. The store's text stays in
  the log line and never reaches the response.

## Proof

| Suite | Without the fix | With the fix |
|---|---|---|
| `server/services/ana/__tests__/qms-change-tools.test.ts` (PGlite; the store is the real change-control SQL) | 4 of 14 fail: no `auditTrail` on create / transition / link, recorded or lost | 14/14 |
| `server/services/living-record/__tests__/fact-change-audit-outcome.test.ts` (both functions and both tools) | 6/6 fail | 6/6 |

`red.txt` / `green.txt` hold the runs.

Also:

- The suites touching the changed modules pass: 110 files, 2043 tests.
- `tsc` is clean on the changed files, and the ESLint ratchet is unchanged.
- `ci:discarded-audit-write`: `AnaToolExecutor.ts` goes from 3 to 0 and
  `fact-change-orchestrator.ts` from 2 to 0, and the baseline is shrunk to
  match.

## Not changed

- **`check_consistency`.** `runConsistencyCheck`
  (`truth-engine-service.ts`) discards its success-path audit outcome, and it
  returns a bare findings array that `routes/submissions.ts` answers as the
  body. Carrying the outcome changes that response shape, or needs the
  `X-Audit-Row-*` headers, and that choice is for whoever owns the route. It
  stays one baselined site.
- **`run_shadow_review`** already spreads a result that carries `auditTrail`.
