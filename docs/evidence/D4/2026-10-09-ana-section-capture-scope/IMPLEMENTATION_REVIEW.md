# Independent review: section capture tenant scope

**Approved for the bounded tenant lookup and capture-only contract.** Reviewed
against `dc90f337d44670324923f795c076052b33f1ffde` on `concept2cure-v2`.
The reviewer read the frozen source/test diff and evidence; no production edits
or tests were performed by the reviewer.

## Independently recomputed pins

| File | Git blob |
| --- | --- |
| `server/services/ana-ri/command-executor.ts` | `54242eab7951afc523d1b14e16a8fce7857d14c0` |
| `server/services/ana-ri/__tests__/draft-section-capture.pglite.test.ts` | `eca9ddb7e7f9b6f738ac204459b0f9f3ee1ce460` |
| `db/migrations/20260801_consolidated_tree_reconciliation.sql` | `e3eaa0baa16b5780d81f79f1cc577f05c4e95fc1` |
| `scripts/db/migration-set.mjs` | `f9b0a52d4d286877c00e3a526758189b7657432b` |

The last two files are unchanged deployed-schema contract evidence, not changes
in this batch. The creator defines `doc_sections` at line 195; its applier lists
that migration at line 904.

## Correctness and compatibility

- `draftSection` refuses a missing section ID and invalid tenant identity before
  acquiring a pool. The direct guard requires a positive safe integer without
  changing the shared dispatcher identity helper.
- The real SQL selects the existing identifiers/title with both `id = $1` and
  `tenant_id = $2`, using the section ID and verified `ctx.organizationId`.
  Parameter-supplied tenant overrides cannot influence the lookup. Foreign and
  absent rows receive the same not-found result without foreign metadata.
- An owned result preserves `success`, `action`, `sectionId`, `code` and `title`.
  Added `status: 'prepared'` and `draftGenerated: false`, the explicit no-content-
  generated-or-saved message, and the corrected command description report what
  the lookup actually does. Query faults remain failed preparation with their
  error information; they do not become successful capture or absence.
- Production changes are limited to this handler/comment and its registry
  description. No generation, persistence, schema, dependency, UI or new
  capability was added. Existing member authorization and human-confirmation
  requirements remain intact.

`CommandResult.data` permits additive metadata. The platform command bridge
forwards the result and instructs the model to report its message; the governed
confirmation client reads success/message. No direct client consumer depending
on the old section metadata shape was found. The generic successful command-only
fallback still says "Action executed successfully"; this patch does not change
that separate presentation behavior.

## Qualification evidence reviewed

The natural test-first baseline recorded **18 failed, 4 passed** of 22 cases in
8.108 seconds before production changes. The frozen candidate recorded **22
passed, 0 failed** in 7.959 seconds. Forced ESLint recorded zero errors, the same
18 existing production warnings and zero test warnings. Source/command pins and
raw results are in `focused-red.json`, `focused-red-report.json`,
`focused-green.json`, `focused-green-report.json`, `focused-eslint.json` and
`focused-eslint-report.json`.

Tests extract the actual shipped `doc_sections` CREATE TABLE statement and
execute the handler's real SQL through PGlite. They cover owned receipt and full
row/content preservation, foreign/missing rows, ignored tenant overrides,
invalid tenant pre-pool guards, missing input, confirmed member dispatch,
unconfirmed proposal without a section read, and real missing-table/UUID errors.

## Limits

The deployed creator has `tenant_id INTEGER NOT NULL`, UUID `id` and an optional
UUID `doc_id` soft reference. It has **no project column or document FK**; the
referenced legacy document creator is deliberately quarantined. Consequently,
this result establishes tenant-owned metadata only and makes no project-binding
or project-qualification claim. A null document link remains valid; the test
also changes active-project context without inventing a relationship.

The focused test validates this shipped table definition and explicit predicate,
not a live production database, complete migration replay or RLS enforcement.
No source qualification, draft generation, saving, approval or sealing is
performed or proved. The separate seal endpoint remains outside this batch.
Broader gates/build/publication are recorded by the parent delivery record.
