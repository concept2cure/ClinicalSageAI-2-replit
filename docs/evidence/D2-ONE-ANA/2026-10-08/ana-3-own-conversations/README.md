# Slice 3, server half — a conversation list shows only the person's own conversations

Launch row **D2**, 2026-10-08. Slice 3 of `docs/design/ONE_ANA_ONE_CANVAS.md`, which the engineering judge found.

## What was wrong

Opening a colleague's conversation is refused: `resolveAccessibleThread` answers `THREAD_FORBIDDEN` (`server/services/chat-thread-helpers.ts`). Yet both lists of `GET /api/chat/threads` were scoped only to the organisation:

- the recents list, read by `useAnaChat`;
- a project's list (`?program_id=`), read by Project home.

So each list named a colleague's conversation by its first message. That exposed what the colleague asked AnA, as a line the reader could never open.

## What changed

`server/routes/chat/threads.ts`: both `chat_threads` lists add `t.user_id = <the signed-in person>`.

- A caller the route cannot identify gets an empty list, never the organisation's.
- A thread with no recorded owner is not listed. It can still be opened by its id, under the existing rule.
- A non-UUID `program_id` is still refused with 400 before anything else.

## Shown

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `threads-program-list.test.ts`: the recents and project lists are bound to the caller; no caller, no list | 4 failed, 11 passed | 15 passed (together with `chat-threads-read-honesty.test.ts`) |

`chat-threads-read-honesty.test.ts` now signs its requests in as a person: a list with no caller is empty by design.

## Not done here

The Recents section in the navigation is the client half of this slice. It lands with the navigation change.
