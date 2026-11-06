# AnA → canvas → editor for a CSR: everything up to the model, proven in the running app (2026-11-06)

The founder, 2026-11-06, said they had keys "and can't get it to work", and asked to watch AnA write a CSR in
a conversation, see it in the canvas, and build it in the editor. No model key reaches this session, so no model
output was produced or claimed here. What was proven is every step around the model, in the running app
(development mode, the CDISCPILOT01 demo project, forced RLS as the runtime role).

## What already exists

| Piece | Path | Role |
|---|---|---|
| The design | `docs/design/ANA_DOCUMENT_CANVAS.md` | AnA-built documents are authoring documents; the canvas and the one editor show them |
| The tool | `server/services/ana/document-surface-tool-defs.ts` `draft_authoring_document` | Saves AnA's draft as an authoring document of the open project |
| Its route | `POST /api/authoring/docs/from-draft` (`server/services/authoring/authoring-from-draft.ts`) | The same write the tool makes; provenance from the turn record, never from the caller |
| The conversation | `server/routes/ana-ri/stream.ts`, `client/src/concept2cure/components/ana/useAnaChat.ts` | The turn, its tools, its errors |
| The CSR skill | `server/services/ana/skills/library/clinical.ts` `clinical.study-report` | How AnA writes an ICH E3 report |
| Acceptance probes | `scripts/demo/launch-demo/qualify-ana-editor.mjs`, `qualify-csr.mjs` | Real-model checks, for when a key is present |

## What was broken, and is fixed (`1d129897b4`)

1. **AnA could not reach the canvas.** The request for "Draft the clinical study report for this study … show it
   to me in the canvas" went to `claude-opus-5-5` with 50 tools, and `draft_authoring_document` was not among
   them. Relevance trimming cut it. The conversation route now pins it on every turn, and the CSR skill pins it
   too; its method says where the report goes. Re-recorded: the tool is offered to all three models.
2. **A refused key looked like a broken product.** Every model answered 401 "invalid x-api-key", and the page
   said "AnA couldn't complete this request. Try again". It now says "The AI provider refused this deployment's
   API key, so the request was not answered. Retrying will not change this; an administrator must set a valid
   key." (`01-refused-key-said-plainly.png`).

How the requests were seen: the app's Anthropic client was pointed at a local recorder. The recorder answers
exactly as the real API answers an invalid key (401), so no output was invented. Each request was checked
against the current Messages API rules for its model. All were valid:
- adaptive thinking;
- effort `high`;
- no `temperature`, `top_p` or `top_k`;
- no `budget_tokens`;
- no forced tool;
- no prefill.

## The path after the tool call, walked

A two-section CSR document was created through `POST /api/authoring/docs/from-draft`, the write the tool makes.
It was labelled `source: seed`, note "canvas plumbing check, no model", in the conversation above. Then:
- The conversation's **Documents** panel lists it under "Built in this conversation": Draft · Module 5 · 2
  sections · **Open** · Download working copy (`02-built-in-this-conversation.png`).
- **Open** puts it in the one editor beside the conversation, with **Back to conversation**
  (`03-open-in-the-editor.png`). The editor offers:
  - Section and Document views, the formatting toolbar and comments;
  - E-sign, **Place into filing**, Freeze, and a working-copy download;
  - provenance stated honestly: "Seeded demo content · canvas plumbing check, no model".

No 4xx or 5xx responses and no page errors in either walk.

## What needs a key

- AnA choosing to call the tool, and the quality of what she writes.
- The editor's AnA draft and accept for a section: `qualify-ana-editor.mjs`.
- The CSR build and export: `qualify-csr.mjs`.

In development (the Codespace), drafting needs only `ANTHROPIC_API_KEY`. In production mode it also needs a
model whose PQ has passed (`server/services/ai-governance/approved-models.ts:385`); every model is still
`pending`, and that is the founder's decision.
