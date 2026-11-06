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

## A key that is valid but cannot be served

A valid key can still be refused: the account has no credit left, or it cannot use the model asked for. Both read
"temporarily unavailable", and OpenAI's spent quota (a 429) read "rate limiting … Try again shortly". So a founder
holding keys would only ever be told to retry. They now read `PROVIDER_ACCOUNT_REFUSED`, with the cause and who fixes
it (`server/services/ai-gateway/gateway-error-map.ts`, tests in `gateway-error-map-key-refused.test.ts`).

Walked in the running app with the recorder answering as the real API answers an account with no credit (400,
"Your credit balance is too low"): the conversation says "The AI provider (Anthropic) refused the request because this
deployment's account has no credit or quota left. Retrying will not change this; an administrator must add credit to
the provider account." (`04-no-credit-said-plainly.png`).

The same screen offered "Rewrite Section", "Revise Document", "Create Risk Memo" and "Create Strategy Note" beneath the
refusal. The server sends these with the turn's opening metadata, before the model replies, and each would have met
the same refusal. A turn that failed before the model wrote anything now offers none; an answered turn keeps them
(`ConversationThread.tsx`, `conversationThreadCanvas.test.tsx`; `05-refused-turn-offers-no-next-steps.png`).

The Progress panel's "Memory: Could not be read" on both turns is this sandbox's: no `OPENAI_API_KEY` is set, and with
no `EMBEDDING_PROVIDER` the project memory search embeds through OpenAI. The same holds in a Codespace given only
`ANTHROPIC_API_KEY`; reported to the Codespace session, which holds its guide.

## With only an OpenAI key

Started with `OPENAI_API_KEY` and no Anthropic key, the app's `/readyz` reports `ana: no_high_risk_model` and names
the providers whose models are approved for drafting. The conversation said only "an administrator needs to enable an
approved model", so a person holding an OpenAI key could not tell that it is not one. The message now names them from
the same registry: "Regulatory drafting is approved only for models served by Anthropic, Amazon Bedrock or Google
Vertex AI. Retrying will not change this; an administrator needs to enable one of those providers."
(`gateway-error-map.ts`, `gateway-error-map-no-approved-model.test.ts`;
`06-openai-key-only-names-the-approved-providers.png`).

## The CSR as a PDF, walked later the same day

From the project's Author step, **Open** on "CDISCPILOT01 Clinical Study Report" opens it in the one editor. Download,
then **Working copy (PDF)**, saved an 8-page A4 PDF, tagged, 99 kB, `%PDF-1.7`. The PDF holds:
- the full ICH E3 outline, 1 to 16;
- the title page and the study objectives from the study's data;
- §12.3.2's narrative summary and its list of subjects;
- the electronic-signatures statement ("Uncontrolled working copy. No electronic signature applies to this copy").

Every page carries the uncontrolled-copy banner with the document id, the version and who downloaded it. The headings
AnA would draft are empty, as they should be with no key. The PDF is not committed: it holds CDISC pilot text.

One defect, fixed in `9d7624d9fd`: the title page printed "Protocol Number: CDISCPILOT01 Phase: Phase 2 Indication: …"
as one line. The builder's template set its fields one newline apart. The editor's import and the assembled report
both read a single newline as a soft wrap, so the fields ran together in the editor, the working copy and the
assembly. Each field is now its own paragraph. A test in `csr-builder-no-provider.test.ts` failed on the old
templates and passes now. A CSR already imported keeps its text; the next build carries the fix. In the Codespace the preparation stops at the
frozen study data (`.devcontainer/post-start.sh`, `DEMO_PREPARE_UNTIL=freeze`), and the build is the founder's to start.
So the founder's first build carries it.

A walk note, not a product defect: the editor has no `?docId=` deep link. It opens the project's newest document, and
a document is opened from the project's list. An earlier walk script assumed otherwise.

## What needs a key

- AnA choosing to call the tool, and the quality of what she writes.
- The editor's AnA draft and accept for a section: `qualify-ana-editor.mjs`.
- The CSR build and export: `qualify-csr.mjs`.

In development (the Codespace), drafting needs only `ANTHROPIC_API_KEY`. In production mode it also needs a
model whose PQ has passed (`server/services/ai-governance/approved-models.ts:385`); every model is still
`pending`, and that is the founder's decision.
