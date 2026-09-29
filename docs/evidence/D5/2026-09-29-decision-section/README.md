# D5 — a tracked-change decision names a section of its own document (2026-09-29)

**Row:** D5 (the audit trail records what happened). Work-order item 13,
**SEC-A-7 second half** (editor-family review 2026-09-28,
`docs/evidence/reviews/2026-09-28/editor-family/triage/ai-authorship.md`),
addressed to the holders of `server/routes/authoring.router.ts`.
**Claim:** `081317f42`.

## What was wrong

A reviewer's accept or reject of a tracked change is recorded by
`POST /api/authoring/documents/:id/tracked-change-decisions` (one decision) and
`…/bulk` (accept all or reject all). Each writes a row in
`authoring_tracked_change_decisions` and an event in the document's
hash-chained audit trail. Both routes resolved only the document's lock. Then
they recorded the body's `sectionId`, `changeType` and text **as given**.

So a caller could put a decision on this document's trail naming a section of
**another document** (or of another tenant's). It also accepted any string as a
"section", and any string as a change type. The rail then reads the row back as
a decision on that section.

## What changed

Both routes now check the section after the lock and before any write.
`decisionSectionIsOfDocument` runs
`SELECT 1 FROM authoring_sections WHERE id = $1 AND doc_id = $2 AND tenant_id = $3`.

| Body | Result |
|---|---|
| no `sectionId` | recorded, as before |
| a section of `:id` in the caller's tenant | recorded, as before |
| a section of another document or tenant | **400 `SECTION_NOT_IN_DOCUMENT`**, no row and no audit event |
| a `sectionId` that is not a uuid | **400**, and no query is run. Both columns are uuid, so Postgres would raise 22P02, which this router reports as a 500 |

`changeType` is recorded only as `insertion` or `deletion`, the kinds the
editor has (`suggestions.ts` `SuggestionRange.kind`). Anything else is omitted
(single route) or recorded as `null` (bulk).

The uuid check reuses `isUuid` from `server/middleware/uuidParam.ts`; the router
had no copy of its own. That file explains why its `router.param` guard is not
registered on this router: path-id fixtures in tests. This check is on a body
field, so that reasoning does not apply here.

**Nobody using the product is refused.** The workbench sends the open
document's active section (`DocumentWorkbench.tsx` `flushDecisions`). The flush
runs on a microtask in the same tick as the click, so the section and the
document cannot diverge between the decision and the request.

## Shown failing first

- [`red-before.txt`](red-before.txt): with the router unchanged, 5 of the 7 new
  tests fail. The 2 that pass are the pass-through cases. The failures are
  `expected 200 to be 400` ×3, the lookup that does not exist, and
  `'approved-by-QA'` recorded.
- [`green-after.txt`](green-after.txt): 26 of 26 pass.
- [`mutants.txt`](mutants.txt): each of five mutants turns the suite red:
  - dropping the `doc_id` predicate;
  - dropping the `tenant_id` predicate;
  - dropping the uuid guard;
  - the bulk route skipping the check;
  - `changeType` passing anything.

Test fixtures updated, with the reason in the file: two existing cases used
`D1` / `S1` / `S9` as ids. A non-uuid section cannot be a row of a uuid
column, and is now refused. They use uuid constants.

## Live, on the running app and real Postgres

The draft IB summary (`f71c55c5…`), signed in as an org admin. "Foreign" is a
section of the Module 2.5 document in the same organisation.
[`live-before-after.jsonl`](live-before-after.jsonl),
[`audit-rows-written.jsonl`](audit-rows-written.jsonl):

| Case | before (previous router swapped in) | after |
|---|---|---|
| own section | 200 | 200 |
| another document's section | **200**, and the trail records `sectionId 0049fbe9…` on this document | **400** `SECTION_NOT_IN_DOCUMENT`, nothing written |
| `sectionId: "not-a-uuid"` | **200**, and the trail records `"not-a-uuid"` | **400**, nothing written |
| bulk, another document's section | **200**, recorded | **400**, nothing written |

## Not in this change

- **SEC-A-7 / SEC-B-7, the AI-authorship half** (a machine proposer is a client
  claim). Item 13 says its verifier
  (`server/services/authoring/machine-claim-verify.ts`) "now exists". At
  `081317f42` no such file is tracked, and no code uses its reason codes. The
  owning lane (`…01TTTQ1h`) has an open round-2 claim that names it, so it is
  not built here: a second one would be a duplicate.
- **The rail's wording** ("text as recorded by the editing client") is the
  triage's point 3, in `DocumentWorkbench.tsx`.

## Gates

- `tsc`: 0 errors.
- ESLint ratchet `--since HEAD`: no file changed its warning count.
- `ci:server-error-leaks`, `ci:tenant-isolation` and `ci:tenant-entry-points`
  pass.
