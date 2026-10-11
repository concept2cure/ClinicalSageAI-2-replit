# Slice 5, server half — a conversation writes only into its own project

Launch row **D2**, 2026-10-08. Slice 5 of `docs/design/ONE_ANA_ONE_CANVAS.md` (§4.8, Part 11 guarantees).

## What was wrong

A conversation's project is fixed when the conversation is minted (`chat_threads.program_id`, PF-10). Each turn's project, however, came from the request body, and nothing compared the two (`stream.ts`). The shell sends the open project on every turn.

So a conversation started in project A, then continued after the person opened project B, had AnA read and write B's records inside A's conversation. For example, `draft_authoring_document` wrote B's document into A's thread. Since slice 8, every "Ask AnA" continues the conversation in progress, which made this path common.

## What changed

- **The check, at the one door.** `getOrCreateThread` (`server/services/chat-thread-helpers.ts`) is the door every AnA turn passes through to resolve its conversation. When an existing conversation is bound to one project and the turn names another, it throws `ThreadProjectMismatchError` (code `THREAD_PROJECT_MISMATCH`). The thread lookup now also reads `program_id`.
- **Before anything runs.** The refusal happens before the question is saved and before any model or tool runs.
- **What is unchanged.** Unbound conversations, and turns that name no project, behave as before. Only a caller that names the turn's project (the AnA stream) is checked.
- **The stream's answer.** `stream.ts` matches the code (not the class, so the suites that mock the helper module are unaffected). It files the turn record as failed and answers: "This conversation belongs to another project. Start a new conversation in the project you have open.", with the conversation's project id.

## Shown

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `chat-thread-program-key.test.ts`: another project refused with nothing written; same project continues (case-insensitive); unbound and no-project unchanged; the stream answers with the code and ends | 3 failed, 8 passed | 12 passed |
| The stream, chat and thread suites | — | 308 passed; 1 failed, below |

**The one failure is not this change's.** `stream-tool-carry-over.test.ts` › "a step the person declined is not carried…" fails on trunk without this change too (`red/stream-tool-carry-over-fails-on-trunk.txt`). It is reported on the board, not touched here.

`thread-messages-store.test.ts` matched the exact text of the thread lookup. It now accepts the added `program_id` column.

## Not done here

**The client half.** The conversation should say this in its own words and offer "New conversation in <project>". It lands with the next client commit. Until then, the server's sentence is shown as the turn's error.
