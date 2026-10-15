# PF-10 S8 (D2): no route re-homes a conversation

Founder decision, 2026-09-26: a conversation belongs to one project. Switching project forks it, and the old conversation stays bound to its own project.

## The defect

`PATCH /api/chat/thread/:threadId` (`server/routes/chat/threads.ts`, mounted at `server/routes/chat.ts:92`) was documented as "Move a conversation to a different project". It had three problems:

- **It moved conversations.** It wrote `project_id` on either thread store:
  - on `chat_threads`, any positive integer, or `null`, which unbinds the thread;
  - on `ai_threads`, any value at all.
- **It updated by thread id alone**, with no organization predicate on the UPDATE (only the store lookup was org-scoped).
- **It had no owner check**, so any member of the organization could rename a colleague's AnA conversation.

## The change

- **A project change is refused 409 `THREAD_PROJECT_FIXED`** on both stores, whatever the value, and nothing is written.
- **The rename that remains is checked first.**
  - On the AnA store it runs `resolveAccessibleThread`, the owner rule the stream applies before it appends to a thread. A colleague's conversation gets 403 `THREAD_FORBIDDEN`.
  - The UPDATE is `WHERE id = $n AND organization_id = $m`.

## Review

The review was `wf_3b9a0148-a31`, with one finding and a split vote. It was upheld as a wording defect and fixed in the following commit.

The `patchThread` docstring said every rename acts only on the caller's own conversation, but the owner check runs on the AnA store only. `ai_threads` (submission chat, project onboarding) has no owner model anywhere:
- the project list shows its threads to the whole organization;
- the message read serves them to any member;
- submission chat appends to any thread id it is sent.

Its rename therefore stays organization-wide, and the docstring now says so. An owner model for that store is a new access rule, not part of this slice; it is handed to D3 alongside the open reader no-sharing items (PF-10 scout, "Optional, adjacent").

## The capability removed, and what replaces it

The capability removed is "move a conversation to another project".

- **Nothing reaches it.** The client makes no `chat/thread/` request. In `client/`, `server/` and `shared/`, only the route's own mount names `patchThread`.
- **What replaces it is the founder's rule.** The user who wants this conversation in project B opens B and starts a conversation there.
  - The composer mints that thread bound to B: `chat-thread-helpers.ts` `getOrCreateThread`, as of S2 (`301ab17d4`).
  - That binding is proven by `tests/schema-contract/chat-thread-access.contract.test.ts`.
  - PF-10 S3 adds the automatic fork, with a visible marker.

## Evidence

| File | Shows |
|---|---|
| `01-red.txt` | Against HEAD `301ab17d4`, 6 failures. A numeric project and `null` re-home or unbind a thread (200). A UUID gets 400, not 409. The ai store moves (200). A colleague's thread is renamed (200). The UPDATE is by id alone. |
| `02-green.txt` | 5 files, 49 tests, all passing: the thread route suites, the read-honesty suite, and the two thread store contract tests. `tsc` passes, the lint ratchet shows one fewer warning, and `ci:server-error-leaks` passes. |
