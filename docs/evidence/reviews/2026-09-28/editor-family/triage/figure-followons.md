# Triage group: figure-followons
Returned by the read-only re-check of 2026-09-28 (as returned; scratch paths redacted).

## SEC-B-FO-a — OPEN — medium

### evidence

server/export/authoring-images.ts is unchanged since e128a656 (2026-09-22). It does not use the shared figure rule, so what the export files can differ from what the canvas and read view show.

(1) Data URIs. `:147` sends any `data:` src to `decodeDataUri`. That function (`:117`) matches `/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is`, which accepts any image type, any case, and any payload.

(2) Image references. `:152-153` only tests `startsWith(prefix)`, then takes `split(/[/?#]/)[0]` as the file id. `:45` duplicates `AUTHORING_IMAGE_URL_PREFIX` from shared/authoring/figure-refs.ts.

(3) Keys. `:101` collects srcs with a quoted-attribute regex over the raw text. `sectionContentToBlocks` (authoring-section-content.ts:58,551) instead reads `getAttribute('src')` through node-html-parser, which decodes character references and reads unquoted or upper-case SRC.

Probe run at HEAD (scratch `triage/probe-export.out.txt`):
- Filed by the export but refused by the canvas (`isFigureSrc` false): `data:image/PNG`, `data:image/webp`, `data:image/svg+xml`, `data:image/tiff`, and a PNG data URI whose base64 contains a newline.
- `/api/authoring/images/file_1_a/../x` and `.../file_1_a?x` both load `file_1_a`.
- `/api/authoring/images/notminted` loads `notminted`.
- Reverse direction: `src="/api/authoring/images/file_1_&#97;"` is a figure on the canvas because the browser decodes it. The regex key stays raw, so it does not equal the block's src, and the export prints "[Figure not exported]".

The PDF and DOCX of the same document also disagree:
- The PDF branch embeds any resolved mime (authoring-blocks-to-html.ts:216-227).
- The DOCX branch files only png, jpeg and gif (authoring-blocks-to-docx.ts:65-69, 540-541).
- So a webp, svg or tiff figure is embedded in the PDF and becomes a placeholder in the DOCX.

No board claim names server/export/**.

### proposedFix

Change server/export/authoring-images.ts only (authoring-export.ts is untouched).

(1) Imports. Import `AUTHORING_IMAGE_URL_PREFIX`, `isGovernedImageRef` and `isInlineFigureImage` from '@shared/authoring/figure-refs'. Delete the local constant at :45; re-export the shared one if anything else needs it. Today only the router imports `AUTHORING_IMAGE_MIMES` from this file.

(2) `collectImageSrcs`. Parse each content with node-html-parser, the same parser `sectionContentToBlocks` uses. Take `querySelectorAll('img')` and the untrimmed `getAttribute('src')`. A figure cannot contain whitespace, so a figure's key equals the block's trimmed src.

(3) `resolveAuthoringImages`:
```
if (isInlineFigureImage(src)) { decode }
else if (isGovernedImageRef(src)) { loadUploadedFile(src.slice(PREFIX.length), orgId) }
else continue; // not a figure: never fetched, never filed
```

(4) Replace `decodeDataUri` with a decoder for inline figures only. It takes the literal lower-case mime from the already-validated src.

This also removes the PDF/DOCX disagreement, because only png, jpeg and gif can resolve.

### risk

- Re-exporting an already-sealed document that holds such a legacy figure will now print "[Figure not exported: …]" where it used to embed bytes. That export then differs from an earlier export of the same document. This is deliberate (it matches the canvas, which already refuses to show that figure), but it should be stated in the commit.
- Not addressed: bytes that do not match the declared type, e.g. PNG bytes declared as image/gif. The DOCX ImageRun type would be wrong. An optional fix is to compare the sniffed format with the declared mime.

### failingTest

A new file, server/export/__tests__/authoring-images-figure-rule.test.ts, with `vi.mock('../../services/ana/uploaded-file-access.js')`:

1. `resolveAuthoringImages(['<img src="/api/authoring/images/file_1_a/../x">'], 7)`: expect `loadUploadedFile` not called and the map empty. Today it is called with 'file_1_a' and the map holds it.
2. `data:image/PNG`, `data:image/webp` and `data:image/svg+xml`, and a base64 payload containing a newline: expect each absent. Today all are present.
3. `<img src="/api/authoring/images/file_1_&#97;">` and an unquoted `SRC=` resolve under the key the block carries. Today the key is raw.
4. Guard: a governed ref and a lower-case PNG data URI still resolve.

Also a renderer case: the PDF print HTML for a webp data URI contains "[Figure not exported". Today it embeds the bytes.

### files

- `server/export/authoring-images.ts` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2
- `server/export/__tests__/authoring-image-export.test.ts` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2
- `shared/authoring/figure-refs.ts` — held: False — ce56754d 2026-09-28T04:50:56Z — session_01TTTQ1hpdMr1yAMVYH4nYdE (this lane)

## SEC-B-FO-b0 (inventory: every server writer of authoring_sections.content and coauthor_documents.content) — PARTLY — medium

### evidence

Every write path found at HEAD 71e62ae7, and which gate it runs.

RUNS refusedFigures:
- PATCH /api/authoring/sections/:id (authoring.router.ts:1972-1995). The 400 FIGURE_NOT_UPLOADED returns before the UPDATE at :2039.

RUNS sanitizeAuthoringSectionHtml (drops a non-figure <img>, does not refuse):
- POST /docs/from-draft and the AnA draft_authoring_document tool (authoring-draft-tool.ts:155) both go through `createDocumentFromDraft`. It sanitizes at authoring-from-draft.ts:252, then inserts via `insertDocumentTx` (authoring-documents.ts:350).

NO GATE, content chosen by the caller or template author (OPEN; see items b1 to b5):
- POST /sections, `createSection` (authoring-documents.ts:542, INSERT :604).
- POST /docs with an org template, `createDocument` (:470). `resolveTemplateSections` (:137-144) seeds `authoring_templates` content, inserted at :350.
- POST /templates (router:1173) stores that content.
- POST /sections/:id/ai/draft/accept (router:3502, UPDATE :3577).
- POST /sections/:id/revert (router:2302, UPDATE :2355).
- Co-author PUT and eCTD PUT, both through `applyCoauthorDocumentPut` (coauthor-status-write.ts:241, set :301).
- POST /api/coauthor/documents without a source (coauthor.ts:162, insert :243-247).
- POST /api/ectd-documents (ectd-documents.ts:169, insert :188-193).
- POST /api/batch-draft/documents/:id/accept (batch-draft-routes.ts:352, UPDATE :498).
- section-generation-service.ts:118, model output.

No gate needed:
- apply-template (router:5073; UPDATE :5191, INSERT :5216). Content is `JSON.stringify` of repository templates from `loadTemplates(locale)`, not user input.
- Section reorder (:6601) and the createSection order shift (authoring-documents.ts:597) write `order_index` only.
- POST /import/docx (router:6822) parses and writes nothing; it has no client caller at HEAD.
- Filing-copy snapshot (coauthor-snapshot.ts:385, 410, 500) copies authoring sections verbatim, including sealed ones.
- Nonclinical M2.6 (nonclinical-summary.routes.ts:125) is escaped HTML with no <img>.
- CMC place-module3 (:210) is deterministic markdown.
- ingestion-service.ts:337, 506 and coauthor compile (coauthor.ts:860) write metadata only.

Read exposure today: both editors resolve images through imageNode (it refuses to fetch a non-figure, and its parseHTML drops one). The read view uses AuthoredHtml. Co-author filings render text only (`renderLeafPdf`). So an ungated store no longer produces a fetch on render. What it does produce: a stored record that the canvas refuses to show, which opens in source mode, plus the export divergence in item a.

### proposedFix

One refusal body for every route that uses the PATCH's JSON shape: extract `figureRefusalBody(refused)` from the PATCH (router:1986-1995) into server/services/authoring/authoring-html-sanitizer.ts. That file is this lane's, from ce56754d. The routes that return a plain string `error` (POST /sections, batch accept) use `describeRefusedFigures` directly.

Per path:
- Refuse (never rewrite) where a person or API caller supplies the content: b1 to b5.
- Sanitize at the model boundary, as from-draft already does: b6.

Order of work: items a, b1, b3, b4 and b6, and the helper in item c, touch no held file and can land now. b2 and b5 go to their holders.

### risk

- Authors with legacy content that holds a non-figure will now be refused on create, accept, revert and co-author save. The PATCH already refuses them.
- Refusal is chosen over sanitize, per the SEC-B-1-2 decision: governed content is never rewritten.

### failingTest

Listed per path in items b1 to b6.

### files

- `server/services/authoring/authoring-html-sanitizer.ts` — held: False — ce56754d 2026-09-28T04:50:56Z — session_01TTTQ1hpdMr1yAMVYH4nYdE (this lane)

## SEC-B-FO-b1 (POST /sections createSection; org-template seeding in createDocument) — OPEN — medium

### evidence

`createSection` (server/services/authoring/authoring-documents.ts:542-630) inserts `content` exactly as sent (INSERT :604-609), with no figure check.

Callers:
- AnA and engine handoffs: `saveToAuthoring` (client/src/concept2cure/v2/authoringHandoff.ts:95), used by Biostatistics, CMC, ReportEngine and PvCockpit.
- AuthoringCreateExport.tsx:169, which sends `content: ''`.
- Any direct API call. It bypasses the PATCH refusal entirely.

`createDocument` (:470-521) seeds sections from the organisation's `authoring_templates` content (:137-144) with no check. That content is stored unchecked by POST /templates (router:1173-1215, roles ADMIN, RA_CMC or QA).

The POST /sections route (router:1795-1798) returns `{ success: false, error: outcome.error }` with a string `error`. The clients read it as a string (authoringHandoff.ts:108, AuthoringCreateExport.tsx:174).

### proposedFix

All changes are in authoring-documents.ts. No router change is needed.

(1) In `createSection`, right after the required-field check (:560-562):
```
const refused = await refusedFigures(String(content ?? ''));
if (refused.length) return { kind: 'refused', status: 400, error: describeRefusedFigures(refused) };
```
This happens before the parent read, so nothing is written. It keeps the route's string-`error` contract, which both clients already render.

(2) In `createDocument`, after `resolveTemplateSections` (:480-484), run `refusedFigures` on each seed that has content. If any is refused, return 400 with the message `Template section <code>: <describeRefusedFigures>` and insert nothing. Global templates always seed '', so they are unaffected.

### risk

- `saveToAuthoring` creates the document before its section. A refused section leaves an empty document behind. The client already says so ("The document was created but its text didn't save — …").
- A stored org template that holds a non-figure becomes unusable until it is re-created. There is no template edit route, only POST /templates.

### failingTest

Extend server/routes/__tests__/authoring-section-figure-refs.test.ts (this lane's file; its mocks already cover pool and client):

1. POST /api/authoring/sections with `content: '<img src="https://collector.example/p.png">'`, and again with `'<img src="/api/authoring/images/../../tenant-export/full">'`. Expect 400 with the sentence, and no `INSERT INTO authoring_sections` among the client queries. Today the response is 201.
2. POST /api/authoring/docs with an org `template_id` whose section content holds an external <img>. Expect 400 and no `INSERT INTO authoring_documents`.
3. Guard: a governed ref and an inline PNG are created as sent.

### files

- `server/services/authoring/authoring-documents.ts` — held: False — bfbf0ee8 2026-09-25T23:41:52Z — session_01KnUGoX3g4R4FWKWGc2sTbN
- `server/routes/__tests__/authoring-section-figure-refs.test.ts` — held: False — ce56754d 2026-09-28T04:50:56Z — session_01TTTQ1hpdMr1yAMVYH4nYdE (this lane)

## SEC-B-FO-b2 (router: AI draft accept, revert, POST /templates) — OPEN — medium

### evidence

server/routes/authoring.router.ts at HEAD:

- `/sections/:id/ai/draft/accept` (:3502). It sets `acceptedContent = typeof req.body?.content === 'string' ? req.body.content : candidate.content`, then `UPDATE authoring_sections SET content = $1` (:3577). There is no figure check. Any editor holding a valid draftId can store exactly what the PATCH refuses: this is a bypass on the same table and surface. Model output with an <img> also lands.
- `/sections/:id/revert` (:2302). It restores `revision.content` via UPDATE at :2355 with no check, so a revision older than ce56754d that holds a non-figure is put back.
- `POST /templates` (:1173-1215). It stores `template_content` unchecked; that content later seeds sections (item b1).

Board: no claim names these handlers.

### proposedFix

(1) AI accept. Inside the transaction, once `acceptedContent` is decided and before the UPDATE at :3577: run `refusedFigures(acceptedContent)`. If anything is refused, ROLLBACK and return 400 with `figureRefusalBody`. The rollback releases the candidate row, which was claimed by DELETE, so the author can edit and retry.

(2) Revert. Before `pool.connect()` (about :2349): refuse 400 FIGURE_NOT_UPLOADED with a message saying the revision holds an image that is not an uploaded figure, so restoring it would put that image back. Write nothing.

(3) POST /templates. Refuse any `template_content.sections[].content` that holds a non-figure.

Also switch the PATCH (:1986-1995) to the shared `figureRefusalBody`, so there is one refusal shape.

### risk

- A model draft carrying an <img> is refused rather than cleaned. Alternative: sanitize the candidate at /ai/draft generation, the model boundary, and refuse only a body-supplied `content`.
- A revert to a legacy revision becomes impossible until the image is uploaded. That is intended.

HAND ON: authoring.router.ts is held.

### failingTest

- server/routes/__tests__/authoringAiDraftAccept.test.ts: POST .../ai/draft/accept with `{ draftId, content: '<img src="https://collector.example/p.png">' }`. Expect 400 FIGURE_NOT_UPLOADED and no `UPDATE authoring_sections`. Today it answers 200.
- server/routes/__tests__/authoring-section-figure-refs.test.ts: POST /sections/:id/revert to a revision whose content holds `/api/authoring/images/../x`. Expect 400 and no UPDATE.

### files

- `server/routes/authoring.router.ts` — held: True — f0147f45 2026-09-28T17:05:50Z (e-sign audit details); d4176395 2026-09-28T16:43:36Z — session_01PwLFr89hq8E7ZHUcAH96HK (f0147f45); session_01KiDof7JE6LiaZhRvh2hJrb (d4176395, e1ce5501, 59b0d8f9); held until 2026-09-29T17:05Z
- `server/routes/__tests__/authoringAiDraftAccept.test.ts` — held: False — 4cf0a8a6 2026-09-05T19:06:33Z — session_015oLV2vDRUbUF8eLLs8zyGt

## SEC-B-FO-b3 (co-author PUT + eCTD PUT via applyCoauthorDocumentPut; POST /api/ectd-documents) — OPEN — low-medium

### evidence

- `applyCoauthorDocumentPut` (server/services/coauthor/coauthor-status-write.ts:241) writes `governed.content` in the transaction (:276, set :301) with no figure check. Both PUT routes use it: coauthor.ts:327 and ectd-documents.ts:283.
- POST /api/ectd-documents (ectd-documents.ts:169) inserts `content: content || ''` at :193 unchecked.
- The co-author surface edits this content in RichSectionEditor (EctdCoauthor.tsx:950-953). So a stored non-figure opens in source mode. It is not fetched (imageNode) and not filed (the text-only `renderLeafPdf`).

Board: item 5 of the 01TTTQ1h hand-on list (docs/work-orders/README.md:665) hands P11-B-1 to 01KiDof7. Its fix (audit, version and reason) is inside this same function. It is not a claim and the file is not git-held, but the two changes overlap.

### proposedFix

(1) In `applyCoauthorDocumentPut`, before `db.transaction` (:276), when `typeof governed.content === 'string'`: run `refusedFigures`. If anything is refused, return `{ ok: false, refusal: { httpStatus: 400, body: { error: 'FIGURE_NOT_UPLOADED', message: describeRefusedFigures(r), field: 'content', refusedImages } } }`. That is the module's own refusal shape (see STATUS_NOT_SETTABLE at :253-261).
  - It covers both PUT routes without editing the held coauthor.ts.
  - EctdCoauthor already renders "Not saved — {message}" (:947).

(2) Export that check as `refuseNonFigureContent(content)` from this module, so the POSTs share it.

(3) Call it in POST /api/ectd-documents before the insert (:188).

Coordinate with the item-5 holder by recording it on that board item.

### risk

- Legacy co-author documents holding a non-figure cannot be saved until the image is removed or uploaded.
- A merge conflict with the item-5 work in the same function is possible if both land at once.

### failingTest

server/services/coauthor/__tests__/coauthor-status-write.test.ts: call `applyCoauthorDocumentPut({ documentId: 1, organizationId: 1, status: undefined, governed: { content: '<img src="/api/authoring/images/../../x">' } })`. Expect `ok: false`, httpStatus 400, error FIGURE_NOT_UPLOADED, and `db.transaction` not called. Today it returns `ok: true`.

### files

- `server/services/coauthor/coauthor-status-write.ts` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdGsmiSPjTqK9wiCacL (board item 5 hands the P11-B-1 fix in this function to session_01KiDof7)
- `server/routes/ectd-documents.ts` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdGsmiSPjTqK9wiCacL
- `server/services/coauthor/__tests__/coauthor-status-write.test.ts` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdGsmiSPjTqK9wiCacL

## SEC-B-FO-b4 (batch-draft accept) — OPEN — low-medium

### evidence

- POST /api/batch-draft/documents/:id/accept (server/routes/batch-draft-routes.ts:352) checks only that `content` is non-empty and within size (:370-379).
- It then writes `UPDATE coauthor_documents SET content = ${content}` (:498).
- `content` is the author-editable card HTML (BatchDraft.tsx:465-467). There is no figure check.

### proposedFix

After the size check (:379) and before BEGIN (:432): run `refusedFigures(content)`. If anything is refused, return 400 `{ success: false, error: describeRefusedFigures(r), code: 'FIGURE_NOT_UPLOADED', refusedImages }`. BatchDraft.tsx:480 shows it through `serverMessage(body)`. Reuse the `refuseNonFigureContent` helper from item b3 if it has landed.

### risk

An AnA batch draft that contains an <img> is refused on accept. It is not cleaned: the author removes the image in the card.

### failingTest

server/routes/__tests__/batch-draft-accept.test.ts: accept with `content: '<p>x</p><img src="https://collector.example/p.png">'`. Expect 400 FIGURE_NOT_UPLOADED, and no BEGIN, UPDATE or version insert. Today it answers 200.

### files

- `server/routes/batch-draft-routes.ts` — held: False — e854953f 2026-09-24T00:49:49Z — session_01AiwZKGaEFjD9AfVvkYExci
- `server/routes/__tests__/batch-draft-accept.test.ts` — held: False — 4cf0a8a6 2026-09-05T19:06:33Z — session_015oLV2vDRUbUF8eLLs8zyGt

## SEC-B-FO-b5 (POST /api/coauthor/documents without a source) — OPEN — low

### evidence

server/routes/coauthor.ts:162. Without `sourceAuthoringDocId`, it inserts `content: content || ''` (:243-247) unchecked.

The only client caller (AuthoringPlaceIntoFiling.tsx:247) sends a source id, so that goes through the snapshot path. This raw branch is reachable by direct API call only.

### proposedFix

Before the transaction (about :238): `refuseNonFigureContent(content)` from coauthor-status-write.ts (item b3), returning 400 in the same body shape. HAND ON: coauthor.ts is held.

### risk

None beyond item b3.

### failingTest

A new case in a coauthor route test (e.g. server/routes/__tests__/coauthorPutStatus.test.ts style): POST /documents `{ title, content: '<img src="https://x/p.png">' }`. Expect 400 and no insert. Today it answers 201.

### files

- `server/routes/coauthor.ts` — held: True — e2d36a2b 2026-09-28T02:12:50Z — session_01KiDof7JE6LiaZhRvh2hJrb (held until 2026-09-29T02:12Z; board item 5 names this file)

## SEC-B-FO-b6 (section generation: model output into coauthor_documents) — OPEN — low

### evidence

- `generateSection` (server/services/authoring/section-generation-service.ts:118) inserts the model's `body` as `coauthor_documents.content`.
- There is no sanitizer at this model boundary. The from-draft boundary has one (authoring-from-draft.ts:252).
- It is called from server/routes/submissions.ts:61.

### proposedFix

Store `sanitizeAuthoringSectionHtml(body)` instead of `body`. It is the model boundary, as in from-draft: nothing is a governed record yet, so dropping is correct here.

### risk

If the model returns markdown rather than HTML, DOMPurify leaves the text unchanged, and a markdown image `![](url)` is not an <img>. That is acceptable.

### failingTest

A section-generation-service test with the gateway mocked to return `<p>x</p><img src="https://x/p.png">`. The inserted content has no <img>. Today the insert carries it.

### files

- `server/services/authoring/section-generation-service.ts` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2

## SEC-A-FO-c (freeze never sets authoring_citations.frozen_at; server half of P11-A-4) — OPEN — low-medium

### evidence

What writes `authoring_citations` at HEAD:
- The only UPDATEs are source-usage.service.ts:316 (`citation_text`) and :634 (`payload_sha256`).
- Nothing sets `frozen_at`: no route, service, trigger or migration. The column is declared in db/migrations/20260725_authoring_document_loop_tables.sql:111 and is applied through scripts/db/authoring-subsystem.mjs:59.

The three seal points never touch citations:
- `/docs/:docId/freeze`: transaction at authoring.router.ts:4171-4227 (INSERT frozen_documents :4175, status :4184).
- `/e-sign` with meaning APPROVER: :4360-4405 (:4397).
- `approveAndFreezeDocument`: :5757 (:5766, :5805).

Readers that trust `frozen_at`: source-usage.service.ts:312, 317, 343, 615, and the router's refresh-all at :4995 (`c.frozen_at IS NULL`). They are live only because of the unrelated document-status gate (`checkDocumentWritable` and `canEditSection`).

No path returns a sealed document to draft. The UPDATEs on `authoring_documents.status` are :4184, :4362, :5645 (IN_REVIEW, from a draft) and :5766.

### proposedFix

(1) Add `freezeDocumentCitations(executor, tenantId, docId): Promise<number>` to server/services/clinical-regulatory-evidence/source-usage.service.ts (this lane's file):
```sql
UPDATE authoring_citations c SET frozen_at = NOW()
  FROM authoring_sections s
 WHERE s.id = c.section_id AND s.tenant_id = c.tenant_id
   AND s.doc_id = $1 AND c.tenant_id = $2 AND c.frozen_at IS NULL
```
This part can land now.

(2) Call it on the transaction client at all three seal points, after the status UPDATE, and put the count in each seal's audit details. HAND ON: the router is held.

(3) Optional: backfill already-sealed documents with an idempotent UPDATE in a C2C_MIGRATION_FILES entry, `WHERE frozen_at IS NULL` and the parent document status is FROZEN or APPROVED. It is safe under Rule 1 re-execution: no DROP, and a re-run is a no-op.

### risk

- For users nothing changes: sealed documents are already refused by the status gate.
- `approveAndFreezeDocument` inserts frozen_documents with ON CONFLICT DO NOTHING, but the citation freeze should run regardless.
- The seal hash is unchanged, because frozen_content does not include citations.

### failingTest

- source-usage.pglite.integration.test.ts: `freezeDocumentCitations` freezes only that document's citations in that tenant, and leaves another document and another tenant untouched. Afterwards `refreshSourceCitation` returns `{ ok: false, reason: 'frozen' }` and `removeSourceCitation` returns []. This fails first because the function does not exist.
- authoringWritesBoundAndAudited.pglite.integration.test.ts: POST /docs/:id/freeze with a valid reason, then `SELECT frozen_at FROM authoring_citations WHERE section_id = …` is non-null. Today it is null.

### files

- `server/services/clinical-regulatory-evidence/source-usage.service.ts` — held: False — 63b43274 2026-09-28T04:52:08Z — session_01TTTQ1hpdMr1yAMVYH4nYdE (this lane)
- `server/routes/authoring.router.ts` — held: True — f0147f45 2026-09-28T17:05:50Z (edited the e-sign transaction's audit details, the exact call site); d4176395 16:43:36Z — session_01PwLFr89hq8E7ZHUcAH96HK and session_01KiDof7JE6LiaZhRvh2hJrb; held until 2026-09-29T17:05Z
- `server/services/clinical-regulatory-evidence/__tests__/source-usage.pglite.integration.test.ts` — held: False — 63b43274 2026-09-28T04:52:08Z — session_01TTTQ1hpdMr1yAMVYH4nYdE (this lane)
- `server/routes/__tests__/authoringWritesBoundAndAudited.pglite.integration.test.ts` — held: False — 63b43274 2026-09-28T04:52:08Z — session_01TTTQ1hpdMr1yAMVYH4nYdE (this lane)

## SEC-A-FO-d (GET /docs/:docId/citations readable tenant-wide without document permission) — OPEN — low (a decision, not a local defect)

### evidence

- The handler at authoring.router.ts:4511-4531 is scoped by `tenant_id` only.
- `authoringObjectAuthorization` passes every GET, HEAD and OPTIONS through (server/middleware/authoringObjectAuthorization.ts:15, 225).

This is not specific to citations. The 'view' action is modelled (authoring-permissions.ts:14, 89-93, 134), but no route decides it:
- GET /docs/:docId/sections (:1721) returns full section content tenant-wide.
- So does GET /sections/:id/citations (:2898).
- So the citation list discloses nothing a tenant member cannot already read.

Since 63b43274, a `cite_id` from this list no longer opens a write: refresh-token is bound to the section in the path.

### proposedFix

There is no citation-local fix: gating only this route would hide citations of sections the same user can read.

The decision needed is whether authoring documents are confidential per document within a tenant. That is for the founder or the D6 security lane. If yes, the change is one gate:
- In `authoringObjectAuthorization`, stop passing GET and HEAD through for `/docs/:docId/**` and `/sections/:sectionId/**`.
- Decide action 'view' through `decideAuthoringPermission` when `sectionPermsEnforced()` is true.
- Filter GET /docs by grant.

HAND ON: the middleware, the permissions module and the router are held.

### risk

Large behaviour change. Every member without a grant (creators get OWNER via `grantCreatorOwnership`) would lose read access to documents they open today, including the canvas and the Submission Center hand-offs. It needs a grant-migration plan.

### failingTest

server/middleware/__tests__/authoringObjectAuthorization.test.ts: GET /authoring/docs/:id/citations for a tenant member with no `doc_permissions` grant, permissions enforced. Expect 403. Today the middleware calls next().

### files

- `server/middleware/authoringObjectAuthorization.ts` — held: True — d4176395 2026-09-28T16:43:36Z — session_01KiDof7JE6LiaZhRvh2hJrb (held until 2026-09-29T16:43Z)
- `server/services/authoring/authoring-permissions.ts` — held: True — d4176395 2026-09-28T16:43:36Z — session_01KiDof7JE6LiaZhRvh2hJrb
- `server/routes/authoring.router.ts` — held: True — f0147f45 2026-09-28T17:05:50Z — session_01PwLFr89hq8E7ZHUcAH96HK / session_01KiDof7JE6LiaZhRvh2hJrb

## P11-A-3 (Sources rail write controls live on a frozen/approved document) — OPEN — low

### evidence

In client/src/concept2cure/v2/editor/DocumentWorkbench.tsx at HEAD, these controls ignore `docSealed` (:951-952):
- "Re-read all" (:4691-4699, `disabled={!activeDocId || refreshingAll}`).
- "Record a source" (:4758-4764).
- The picker's cite button (about :4809, `citeSource(ps.id)`).
- "Re-read source" and "Remove" (:4864-4870).

Revert, by contrast, has `disabled={docSealed}` with a title (:4500-4501).

e1ce5501 (GE-P-3) added a per-act `access` (:497-545) for freeze, esign, fileToVault and assignReview only; there is no edit or cite act. The server still refuses these writes on a sealed document.

### proposedFix

Add `|| docSealed` to `disabled` on all five controls. Give them the title 'This document is frozen — its sources cannot be changed.', matching the Revert pattern (disabled, not hidden). Nothing else changes.

### risk

None functional. HAND ON: DocumentWorkbench.tsx and the test file are held.

### failingTest

client/src/concept2cure/v2/__tests__/documentAuthoringSourcesRail.test.tsx: a fixture document with status 'FROZEN'. Expect `refresh-all-sources`, "Record a source", "Re-read source" and "Remove" all to be disabled. Today they are enabled.

### files

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z (plus merge 1de78ea8 11:49Z) — session_01PwLFr89hq8E7ZHUcAH96HK; also session_01KiDof7JE6LiaZhRvh2hJrb (8a74ed55 11:20Z, e1ce5501 05:15Z); board item 6 (README.md:691) hands its findings to session_01KZK3jg until 2026-09-29T01:58Z. Held until 2026-09-29T11:49Z
- `client/src/concept2cure/v2/__tests__/documentAuthoringSourcesRail.test.tsx` — held: True — 59b0d8f9 2026-09-28T04:20:59Z — session_01KiDof7JE6LiaZhRvh2hJrb (held until 2026-09-29T04:20Z)

## P11-A-4 (tooltip claims a per-citation freeze that nothing sets) — OPEN — low

### evidence

- DocumentWorkbench.tsx:4696 still reads "Re-read every unfrozen citation in this document against its stored source. Frozen citations are left alone."
- The server half is item SEC-A-FO-c: nothing sets `frozen_at`.

### proposedFix

Once item c lands, citations freeze only when their document seals. refresh-all on a sealed document is already refused (router:4985-4986, `checkDocumentWritable`), so no document the button can act on has frozen citations.

Change the tooltip to 'Re-read every citation in this document against its stored source.' On a sealed document, show P11-A-3's disabled title. Do both in the same edit as P11-A-3.

### risk

None. HAND ON with P11-A-3: same file, same hold.

### failingTest

In the same test file as P11-A-3: the refresh-all title does not contain 'Frozen citations are left alone'. Today it does.

### files

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — session_01PwLFr89hq8E7ZHUcAH96HK / session_01KiDof7JE6LiaZhRvh2hJrb / board item 6 → session_01KZK3jg

## Notes

Read-only; nothing in the repository was edited. HEAD was 60b0563f at the start and 71e62ae7 at the end. Of the commits that landed in between, only f0147f45 (session_01PwLFr8, 17:05Z) touched a file in scope: server/routes/authoring.router.ts, one line in the e-sign audit details at :4426. Line numbers above are at 71e62ae7.

The probe that confirms item a is in scratch: <scratch>/triage/probe-export.ts, probe2.ts and probe-export.out.txt. The per-file history helper is triage/last.sh.

**Can land now.** None of these touches a file changed by another session in the last 24 hours:
- a: server/export/authoring-images.ts.
- b1: server/services/authoring/authoring-documents.ts.
- b3: server/services/coauthor/coauthor-status-write.ts and server/routes/ectd-documents.ts. Not git-held, but board item 5 (README.md:665) hands a P11-B-1 fix in the same function to session_01KiDof7; note on that item.
- b4: server/routes/batch-draft-routes.ts.
- b6: server/services/authoring/section-generation-service.ts.
- The c helper `freezeDocumentCitations`, in source-usage.service.ts.
- The shared `figureRefusalBody` in authoring-html-sanitizer.ts.

**Hand on:**
- authoring.router.ts is held by session_01PwLFr8 (f0147f45) and session_01KiDof7 (d4176395) until 2026-09-29T17:05Z. That covers b2 (AI accept is the one real bypass of the PATCH refusal; also revert and POST /templates) and the three seal call sites for c.
- coauthor.ts is held by session_01KiDof7 until 2026-09-29T02:12Z (b5).
- The middleware and permissions module are held by session_01KiDof7 until 2026-09-29T16:43Z. d also needs a founder or D6 decision.
- DocumentWorkbench.tsx is held by session_01PwLFr8 and session_01KiDof7 until 2026-09-29T11:49Z, and board item 6 names session_01KZK3jg (P11-A-3, P11-A-4).

**Also still open, not asked:**
- The SEC-A-1 follow-ons in DocumentWorkbench (board item 6): there is no CITATION_* entry in AUDIT_EVENT_LABELS, and the second-cite toast at DocumentWorkbench.tsx:1949 still says 'Source re-resolved against its current content.'
- The SEC-B-1-2 note on the production CSP: img-src still allows https: (server/middleware/enterprise-security.ts:191, 240).
