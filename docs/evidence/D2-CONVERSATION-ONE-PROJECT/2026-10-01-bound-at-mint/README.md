# PF-10 S2 (D2): a conversation is bound at mint time, only to a project of its own organization

S1 (`../2026-10-01-program-key/`) gave `chat_threads` a `program_id` column with a same-organization key. This slice moves the writer and the readers onto it.

## The defect

**`getOrCreateThread`** (`server/services/chat-thread-helpers.ts`) wrote the request's project into `chat_threads.metadata.programId` as given. A UUID shape was its only check.

The two thread lists then read that value back:
- `GET /api/chat/threads?program_id=` (`server/routes/chat/threads.ts`), behind ProjectHome's "the program's own AnA threads";
- `GET /api/mdx/ana/threads?program_id=` (`server/routes/mdx-ana-memory.ts`), which did not check the UUID either.

So a turn sent with another organization's program open minted a thread bound to that program, and the thread was listed under it. `02-red-real-store.txt` shows this on the real store: organization A's list for organization B's program contains organization A's new thread.

## The change

- **The mint.** `getOrCreateThread` asks `programInOrganization(pool, program, org)` before the insert.
  - That is the one membership check, and it excludes deleted programs.
  - If the program is the organization's, `program_id` is bound, lower-cased.
  - If it is another organization's, deleted, or absent, the thread is minted unbound.
  - A check that could not complete throws and inserts nothing. A failed lookup is never read as "not ours". The AnA stream already treats a throw from the mint as degraded persistence (`persistenceFailed`, no history from an unverified id).
  - The program is no longer written to metadata, so a thread's program has one store.
- **`GET /api/chat/threads?program_id=`** selects and filters on `t.program_id`.
- **`GET /api/mdx/ana/threads?program_id=`**:
  - filters on `program_id` and returns it;
  - refuses a non-UUID with 422;
  - answers 503 `THREAD_STORE_UNPROVISIONED` when the store or column is missing. It used to answer an empty list, which read as "no conversations" (working agreement: an error is never an empty result).
- **`scripts/seed-local-testing.ts`** writes `program_id`.
- **Two comments that named the old metadata store are updated:** the PATCH note in `threads.ts` and the ProjectHome comment.

## Rolling deploy

`deploy-migrate` applies `20261001c` before services roll, so the column exists before the new mint runs. Old instances still write `metadata.programId` while they drain. The `20261001c` backfill is replayed on the next deploy and binds those rows, but only where the program is the thread's own organization's.

## Evidence

| File | Shows |
|---|---|
| `01-red-mint-and-list.txt` | Unit cases against HEAD `541a8d2e9`, 6 failing. The mint does not ask the organization, binds no `program_id`, writes the program to metadata, and lets a failed check through. The list reads metadata. |
| `02-red-real-store.txt` | The real store (PGlite, with `20260524`, `20260728` and `20261001c`) driven through the real mint and list, with HEAD's helpers. The organization's own program is not bound. Another organization's program is written to metadata, and the thread is listed under it. |
| `03-red-mdx-list.txt` | The mdx list against HEAD's route. It reads metadata, accepts `program_id=42`, and answers 200 with an empty list when the column is missing. |
| `04-green.txt` | 58 files, 696 tests, all passing: every suite that touches the mint, the stream, the lists or program access, plus the founder-path walk. `tsc`, the lint ratchet, `ci:fixture-fallback` and `ci:server-error-leaks` all pass. |

## Next

S3 is the fork. A turn whose open project differs from its thread's bound program starts a new conversation in the open project, as the founder decided on 2026-09-26. It ships after a deploy boundary (see the S1 README), and needs decisions F1–F8 from the PF-10 scout. The recommended default for each is the plan's.
