# PF-13 follow-up (D5): a project delete the database refuses is an honest 409, and AnA's working memory no longer blocks one

## The defect

PF-13 (founder decision 2026-09-26): only a draft-only project may be deleted; anything else is archived. The three hard-delete routes ask `projectDeletionHolds` first, which judges what would cascade away (the anchor row, documents past draft), and then they delete. The routes are `DELETE /api/projects/:id`, `DELETE /api/clients/:id` and `DELETE /api/device-projects/:id`.

On a database migrated by the set, 45 stores name a project under a key that does not cascade (ON DELETE NO ACTION). They include agency correspondence, submissions, evidence-chain records and AnA's working memory. A row in any of them made `DELETE FROM projects` fail with 23503, and each route answered a bare 500 "Failed to delete project":

- **A project holding a record** (here, an FDA communication) got a 500 where it should have been told "archive instead".
- **A draft-only project in which a conversation had passed the working-memory threshold** got a 500, though PF-13 allows that delete. `conversation_working_memory.project_id` was NO ACTION. The summarized conversation itself cascades with the project (`concept2cure_conversations`), so its summary was the only thing holding the project.

## The change

- **`server/services/c2c/project-retention.ts` `projectDeleteBlockedRefusal`** maps a 23503 from the delete to 409 `PROJECT_HOLDS_RECORDS` ("… Archive it instead. Nothing was deleted."). It unwraps drizzle's `cause` to find the driver error. The store's table and constraint go to the log only, never the body. All three routes use it, and any other error is still their 500.
- **Working memory detaches.** Both keys on the column are now `ON DELETE SET NULL (project_id)`: the summary stays, with its organization, under no project. That is how an unattributed row already reads: kept, and never promoted into project memory.
  - `migrations/20260820_working_memory_project_id.sql` creates the column; its key changed.
  - `migrations/20261001_integer_project_same_org_keys.sql` holds the same-organization key; its key changed too.
  - Both files are amended in place with dated notes (CLAUDE.md Rule 1). Where the NO ACTION key deployed, it is replaced under its own name, only when it is not already SET NULL, so a replay runs no DDL.
  - `shared/schema.ts` says the same for a drizzle-pushed install.
- **Not changed.** The other 44 NO ACTION stores are records. Each is now refused honestly. Whether any of them should cascade is a per-store decision, not made here.

## Evidence

| File | Shows |
|---|---|
| `01-red-route-real-postgres.txt` | `tests/db/project-delete-held-by-store.dbtest.ts` against HEAD on PostgreSQL 16, with the route under the request tenant scope: both cases answer 500. |
| `02-red-contract-and-routes.txt` | The keys contract test against the HEAD migrations fails 6. Among the failures: the keys are NO ACTION, a project delete with working memory fails 23503, and a database that deployed NO ACTION is not upgraded. Against the HEAD routes, the clients and device-projects 23503 cases answer 500. |
| `03-green-real-postgres.txt` | Two deploys of the amended set on a database that had the NO ACTION keys: both keys are SET NULL under their own names. Both route cases pass: 200 with the summary detached, and 409 with nothing deleted. |
| `04-green-suites.txt` | 12 suites, 135 tests: retention, the three delete routes, the keys, program-key and chat-thread contracts, working memory, consolidation and the walk. The real-PG delete test passes 2/2. The lint ratchet and both migration gates pass. |
