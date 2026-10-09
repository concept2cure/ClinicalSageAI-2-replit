# D2 — an agency letter is recorded whole, and so is the next one

**Date:** 2026-09-29 · **Row:** D2 (Launch catalog) · **Workstream:** W1 ·
**Session:** `…01E2moDuSNSNTBqAHV5GtWoz`

## What was wrong

`POST /api/regulatory-correspondence/correspondence/intake` parses an agency
letter into issues. For each issue it writes a work item to
`c2c_project_work_items` through `createCanonicalTasksForIssue`
(`server/services/regulatory-correspondence/operating-layer.ts`). The route is
mounted unconditionally. Its feature flag and its parser both default to on. It
is in the Projects app's API scope (`program-journey`'s `apiPrefixes`), and
AnA's `correspondence.ingest` command calls it.

An issue id is a string, so every correspondence work item is written with
`source_id 0`, and the issue id goes in `source_ref`.
`migrations/20260730_work_item_source_ref.sql` added `source_ref` for exactly
this case. Eleven days later,
`db/migrations/20260810_c2c_work_items_source_uniqueness.sql` made
`(org_id, source_type, source_id)` UNIQUE and left `source_ref` out. That put
every correspondence item in an organisation back on a single key.

The effect, shown on a database built by the real path at trunk:

- **A letter raising two or more issues failed.** The second work item raised
  23505. By then the letter, its first issue and that issue's work item had
  already been written, one statement at a time, with no transaction. A
  deficiency letter nearly always raises more than one issue.
- **No later letter could be recorded.** Its first issue collided with the
  organisation's existing correspondence item.
- **The 500 body shipped the failure itself.** It contained Drizzle's
  `Failed query: insert into "c2c_project_work_items" … params: …`, with the
  requester's e-mail among the params (`red-before-fix.txt`).
  `ci:server-error-leaks` read green: the handler copied `e.message` into a local
  variable first, and the gate only looked inside the response body.

## What changed

| | |
|---|---|
| Key | `db/migrations/20260810_c2c_work_items_source_uniqueness.sql`, **amended in place** (Rule 1) with a dated header note. The old constraint `c2c_pwi_org_source_type_source_id_unique` is replaced by `c2c_pwi_org_source_key_unique`: `UNIQUE NULLS NOT DISTINCT (org_id, source_type, source_id, source_ref)`. Integer-keyed sources have a NULL `source_ref`, so they dedupe exactly as before (NULL counts as one value). Each correspondence issue now has its own key, and the same issue still cannot be written twice. The DROP is of a constraint this file created and no other file on any applier re-creates, so there is no create-then-drop ordering hazard (`ci:migration-drop-safety` passes). Needs PostgreSQL 15+; production pins 15.4. |
| Error body | The intake's catch now calls the canonical `serverError`. The detail, with the PostgreSQL error from `.cause`, goes to the log against the request id together with the correspondence, project and submission ids. The client gets a code and a sentence. |
| Gate | `scripts/ci/check-server-error-leaks.mjs` now follows an alias. If a `const/let/var NAME = <initialiser that reads the caught error>` is declared within 1500 characters before a 5xx, and the body uses `NAME` as a value (not as a key), that is a leak. Checked against a probe file: the two leaking shapes are flagged; a static message, and an alias that only goes to the logger, are not. |

## Proof

The test is `tests/db/correspondence-work-items.dbtest.ts`. It runs on real
PostgreSQL with the real router and its own `authMiddleware`, a signed token,
and a minted non-superuser runtime role with `RLS_ENFORCE=on`.

| Run | Result | File |
|---|---|---|
| Direct SQL, before | Two correspondence items with different `source_ref` → 23505 | `psql-reproduction.txt` |
| Before the fix (narrow key, old route) | 3 of 5 fail: the multi-issue letter, the next letter, and the 500 body | `red-before-fix.txt` |
| Fixed, reference database | 5 of 5 | `green-reference-db.txt` |
| Fixed, **database provisioned from empty** by `scripts/db/provision.mjs` | 5 of 5; the widened key is the only source key present | `green-from-empty.txt`, `provision-and-replay.txt` |
| Narrow key restored, route fix kept | The two letter tests fail. The log names `c2c_pwi_org_source_type_source_id_unique`, and the body carries no database text | `mutant-narrow-key-only.txt` |
| Old route restored, key fix kept | Only the error-body test fails | `mutant-old-route-only.txt` |
| `deploy-migrate` replay on a database that already has the widened key | The file is a no-op ("already present; skipping") | `provision-and-replay.txt` |

Two tests pass in every run: the one proving integer-keyed sources still
dedupe, and the one proving the same issue cannot be written twice. They are
there to show the widening lost nothing, not that the fix worked.

Gates on the tree with the change: `ci:migration-drop-safety` (+ selftest),
`ci:migration-set-order`, `ci:migration-reachability`, `ci:duplicate-table-ddl`,
`ci:runtime-ddl` and `ci:server-error-leaks` all pass. The existing
correspondence suites pass too: 6 files, 142 tests.

## The gate's baseline grew by 29, and why that is not a regression

Widening the gate made 29 existing sites in 8 files visible. They had been
leaking all along; the old gate simply could not see them. They are added to
`scripts/ci/server-error-leaks-baseline.json` as they are, so the ratchet now
covers them:

- `billing-dashboard.ts` ×9
- `orchestration.ts` ×12
- `tenant-export.ts` ×3
- `capa-mdr.ts`, `deep-research.ts`, `ai-assistance.ts`, `qms.ts`, and
  `api/cmc/module3OperatingSystemRoutes.ts` ×1 each

None was fixed here:

- `qms.ts` is the second QMS API that no client calls. Deleting it is waiting
  on the founder (DP-34).
- `tenant-export.ts` belongs to the D6 offboarding lane.
- The rest are outside this row.

## Found, not fixed — handed on

1. **The intake is not atomic.** The letter, each issue, each issue's blocker
   and work item, the timeline event and the project-memory entry are written
   one statement at a time, some through the shared `db`, some through
   `pool.query`. Any failure after the first write leaves a letter holding only
   some of its issues, and a retry records the letter a second time. With the
   key fixed, the common failure is gone, but the shape remains. Making it
   atomic means passing one transaction through
   `computeCorrespondenceIssueImpact`, `createCanonicalTasksForIssue` and
   `addTimelineEventDB`. → D2, unclaimed.
2. **Correspondence work items never reach the Task Board.** They are written
   to `c2c_project_work_items`, which `/api/task-management/board` does not
   read. That is part of the "two task stores" finding (work-orders README,
   "→ Projects"). Measured at HEAD for this claim, it is more than two stores:
   - The Board reads `unified_tasks` only.
   - Schedule-of-events tasks, Communication Center tasks and the c2c task API
     write to `project_tasks`. Only AnA's `create_task` is mirrored to the
     Board.
   - Correspondence writes to `c2c_project_work_items`.
   - `server/services/unified-work/unified-work-view.ts` already merges all
     three, but serves only the MDx workbench.

   The Board's own Blocked and Done columns do work; the missing work lives in
   the other stores. Separately,
   `server/services/orchestration/cross-object-resolver.ts:189-192` hardcodes
   `blockedTasks: 0`, and that value reaches AnA's readiness context. → D2,
   still unclaimed.
