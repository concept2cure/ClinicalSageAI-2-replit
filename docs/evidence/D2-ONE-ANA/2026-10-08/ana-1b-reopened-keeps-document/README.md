# A reopened conversation keeps the document it built

Launch row **D2**, 2026-10-08. Found by the real-browser capture of slice 1 (`../ana-1-canvas-opens/screens/`, finding 1).

## What was wrong

A conversation reopened from history showed no document at all: no card and no editor, so the person could not get back to it from the conversation.

The client finds a reopened turn's document in the saved step trace (`authoringDocFromToolResult`). That trace keeps a 180-character summary of each tool's result (`server/services/ana/tool-trace.ts`). `draft_authoring_document` returns `{ saved, title, status, content, …, authoringDocId, programId }`, so its first 180 characters are draft text and the id was always cut off.

The saved summary, read from the capture database:

```
{"saved":true,"title":"Module 2.5 Clinical Overview (stand-in draft)","status":"generated","content":"# Module 2.5 Clinical Overview (stand-in draft)\n\n## 2.5.1 Product Developme…
```

## What changed

`summarizeToolResult`: a result that names an `authoringDocId` is summarised as `{ authoringDocId, programId, status, title }`, with the ids whole and first. The draft text no longer goes into the trace. Every other result is summarised as before.

## Shown

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `tool-trace-document-ids.test.ts` (new): the real result shape keeps the id, the program and the title | 1 failed, 2 passed | 3 passed |
| The trace suites and `conversationThreadCanvas.test.tsx` (its reopened-turn case reads the id from the trace) | — | 77 passed |

## Not done

- **Old conversations stay as they are.** Conversations saved before this change keep their cut summaries. Rewriting stored messages would change the record, so they are not backfilled.
- **The durable fix is the next canvas slice.** The documents built in a conversation will be read from the authoring store by the conversation they were built in, not from the trace (design slice 11). That list does not depend on the trace at all.
