# PF-10 S11 (D3): AnA's working memory names a project of its own organization, at the database

## The defect

`conversation_working_memory.project_id` was an integer key to `projects(id)` (`migrations/20260820_working_memory_project_id.sql`). It proved the project existed, not that it belonged to the row's organization.

- **The writers.** The stream's post-processing and `POST /api/chat/send-message` pass the turn's project to `working-memory.ts`. A v2 program resolves to its anchor, which is org-scoped (`project-ref.ts`). A legacy integer is taken as the client sent it, and nothing checks it.
- **The harm.** The nightly consolidation (`memory-consolidation-job.ts`) promotes a thread's working memory into that project's `project_memory_entries`. A summary written under another organization's project would become that project's memory.

## The change

- **`migrations/20261001_integer_project_same_org_keys.sql`, amended in place** with a dated note (CLAUDE.md Rule 1). It adds a fourth key, `conversation_working_memory (project_id, organization_id) → projects (id, organization_id)`.
  - **NOT VALID:** a legacy row does not fail the deploy.
  - **ON DELETE NO ACTION,** the existing key's action, because two keys on one column must agree.
  - **Nullable `project_id`:** a thread held in no project writes NULL, and the key does not check it.
  - **Order:** `20260820`, which creates the table, runs earlier on the applier (index 214 of 349, against 325).
- **`scripts/db/program-same-org-preflight.mjs`** lists the legacy rows. The remedy is to clear `project_id`, since the column is nullable.
- **No writer changed.** `working-memory.ts` catches a refusal and logs it, so a refused summary costs that turn's summary and never the turn.

## Evidence

| File | Shows |
|---|---|
| `01-red.txt` | `integer-project-same-org-keys.pglite.test.ts` with the working-memory cases, against HEAD: 3 failures. There is no fourth key, a row under another organization's project is written, and the preflight has no entry. |
| `02-green.txt` | `ci:migration-drop-safety` and `ci:migration-set-order` pass. 18 suites, 184 tests: the keys contract (two deploys over a legacy row), the program and chat-thread key contracts, working memory, memory consolidation on PGlite, the post-processing suites and the walk. |
| `03-real-postgres.txt` | PostgreSQL 16, two deploys of the amended set. The key is present, NOT VALID and NO ACTION. An own-organization row is written, and a foreign one is refused with 23503 (in a rolled-back transaction). The preflight checks the new store. |

## Found, not fixed here

Because of the existing NO ACTION key on working memory, `DELETE FROM projects` fails 23503 for a project with any working memory under it. A conversation in a legacy integer project writes such a row once it passes the working-memory threshold (`needsWorkingMemoryRefreshByThread`). From then on, `DELETE /api/projects/:id` on a draft-only project, which PF-13 allows, fails inside its transaction, and the route's catch answers 500 "Failed to delete project". This is the follow-up slice.
