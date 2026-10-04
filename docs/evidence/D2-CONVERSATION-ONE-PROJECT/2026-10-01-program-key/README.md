# PF-10 S1 (D2, D3): an AnA conversation names its project, by key, and only a project of its own organization

Plan: `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md` §PF-10. The slice plan is the PF-10 scout of 2026-10-01 (`wf_92bf7e8a-b5e`), slice S1.

Founder decision, 2026-09-26: a conversation belongs to one project, and switching project forks it. That rule needs the project as a column. This slice adds the column and its key. It changes no application behaviour: S2 moves the writer and readers onto the column, and S3 adds the fork.

## The defect

A chat thread's project is held only in `chat_threads.metadata->>'programId'`, free JSON.

- **The writer does not check the organization.** `chat-thread-helpers.ts` `getOrCreateThread` writes the request's project as-is.
- **The thread list reads it back** (`routes/chat/threads.ts`) to list a project's conversations.
- **Nothing ties the program to the thread's organization.** There is no key, so a thread of organization A can name organization B's program and be listed under it.
- **Nothing stops a later write from re-homing a conversation.**

## The change: `migrations/20261001c_chat_threads_program_key.sql`

1. **`chat_threads.program_id UUID`**, nullable. A conversation held with no project open has none.
2. **`regulatory_programs_id_org_uq`**, created when absent by the same statement as `20260926b`, so either file may run first.
3. **`chat_threads_program_same_org_fk`** on `(program_id, organization_id) → regulatory_programs (id, organization_id)`.
   - It is NOT VALID.
   - It is **`ON DELETE SET NULL (program_id)`**. A tenant purge deletes programs, and a bare SET NULL would also null the thread's organization. Red `02` shows this.
4. **`chat_threads_program_needs_org`**: `CHECK (program_id IS NULL OR organization_id IS NOT NULL)`, NOT VALID. A composite key with a NULL column is not checked (MATCH SIMPLE), so without it a thread with no organization could name any program. Red `03` shows this.
5. **`idx_chat_threads_org_program`** on `(organization_id, program_id) WHERE program_id IS NOT NULL`.
6. **The backfill** comes from the metadata. It binds only a UUID naming a program of the thread's own organization.
   - A foreign, missing or malformed value leaves the thread unbound, and so does a thread with no organization. Nothing is guessed.
   - It works case-insensitively.
   - A soft-deleted program still binds, so the chain stays readable (PF-13).
   - The uuid cast sits inside `CASE`, because `AND` does not order its operands. Red `04` did not fail on PGlite: the regex sits on the scan, so it filters before the join cast. The `CASE` form is the safe one, because Postgres does not promise the order, and the `t-malformed` case shows the shipped file is safe.
7. **Rule 1.** Every DDL statement runs only when its object is absent. The backfill is guarded by row: it touches only `program_id IS NULL` rows that match. It never overwrites a writer's value, and a program that is gone binds nothing; the test replays the file after a delete to show this. There is no DROP and no COMMENT.
8. **Wiring.**
   - On the deploy set right after `20261001b`, before the tenant sweep.
   - The runtime fallback DDL in `chat-thread-helpers.ts` gains the column, which its comment requires.
   - `program-same-org-preflight.mjs` lists any thread naming a foreign or missing program, or naming one with no organization.

## Evidence

| File | Shows |
|---|---|
| `01-red-column-only.txt` | The file reduced to the column alone. Six cases fail: no key or CHECK, nothing backfilled, a foreign program and a no-organization thread are accepted, and the preflight has no store. |
| `02-red-bare-set-null.txt` | With a bare `ON DELETE SET NULL`, deleting a program also nulls the thread's organization. |
| `03-red-no-check.txt` | Without the CHECK, a thread with no organization names a program, and the preflight lists it. |
| `04-red-cast-outside-case.txt` | The cast outside `CASE` still passed on PGlite (see 6 above). It is recorded so this is not reported as a proven guard. |
| `05-real-postgres.txt` | PostgreSQL 16, on the upgraded and the fresh database. Before: 0 threads with a metadata program on either. Each applies the file twice and ends with one key and one CHECK (both NOT VALID) and one index. In a rolled-back transaction: a foreign program is refused 23503; a thread with no organization naming a program is refused 23514; a program delete unbinds the thread and keeps its organization. |
| `06-green.txt` | 10 files and 110 tests, all passing: the new contract test, the 20260926b and 20261001 key suites, and every suite that touches `chat_threads`. Also the real-PG dbtest that touches `chat_threads` (13/13) and a full `deploy-migrate` replay (exit 0). `tsc`, the lint ratchet and the migration gates all pass. |

## Next

- **S2:** the writer binds `program_id` only after `programInOrganization`, and stops writing the metadata. The thread list reads the column.
- **A deploy boundary.**
- **S3:** the fork on the server.
- **Decisions for the founder** before S3 (scout §3): F1 to F8. Each one recommended there is the plan's default.
