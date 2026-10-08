# Slice 11, server half — the documents a conversation built, read from the store

Launch row **D2**, 2026-10-08. Slice 11 of `docs/design/ONE_ANA_ONE_CANVAS.md` (§4.3).

## Why

The canvas lists the documents AnA built, for "this conversation" and for "this project". On 2026-10-08 a real browser showed a reopened conversation with no document at all. Its only record of the document was a capped copy of a tool result in the saved trace, and that copy had cut the id off (`../ana-1b-reopened-keeps-document/`). Every document AnA drafts records its own provenance, `{ source: 'ana', conversationId, turnId, model }` (`authoring-from-draft.ts`). That is the record to list from.

## What changed

`GET /api/authoring/docs` accepts two new filters:

- `conversationId`: `to_jsonb(d)->'provenance'->>'conversationId' = $n`, bound as a parameter;
- `source=ana`: a fixed predicate, with no parameter.

It also returns each row's `provenance_source`, `conversation_id` and `program_id`, so a list can say where a document came from. Provenance is read through `to_jsonb`, as the export route reads it, so a database without the column answers rather than fails. With neither filter, the query is unchanged.

## Shown

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `authoringDocsByConversation.test.ts` (new), against the SQL the handler builds | 3 failed, 1 passed | 4 passed, with `authoringDocsStatusFilter.test.ts` 9 passed |
| **Real database** (`green/real-database-query.txt`): the same predicate on `c2c_ui_screens`, for the conversation the slice-1 browser run created | — | exactly its one document: `a6257943…`, "Module 2.5 Clinical Overview (stand-in draft)", source `ana`, 4 sections |

## Not done here

The canvas's Documents list ("This conversation · This project", open, download a working copy) is the client half. It lands with slice 12.
