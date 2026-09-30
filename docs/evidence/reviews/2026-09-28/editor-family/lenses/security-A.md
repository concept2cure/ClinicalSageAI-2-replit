# Security lens: the editor family, DocumentWorkbench, 2026-09-28

Reviewed at `7087f46e2` (`concept2cure-v2`). The working tree was clean for every file cited. This pass was read-only: no file was edited and no gate was run with a baseline flag.

## Scope actually covered

**Read in full:** `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`, lines 1–5134.

**Client code read only along the paths traced:**
- `editor/RichSectionEditor.tsx`: 1–130, 160–201, 296–330, 680–1180, 1270–1310, 1370–1440, 1490–1540, 1873–1882, 2550–2572.
- Read whole: `editor/AuthoredHtml.tsx`, `editor/imageNode.ts`, `editor/askAnaToDraft.ts`, `components/ana/renderSafeMarkdown.ts`, `v2/AnaMarkdown.tsx`, `v2/download.ts`.
- `editor/ProjectFilesPanel.tsx`: 40–135, 185–350, 536–562.
- `editor/suggestions.ts`: 20–60, 80–135, 830–870.
- `editor/citationNode.ts`: 160–205.
- `v2/AnaActionChips.tsx`: 40–100.
- `surfaces/AuthoringCreateExport.tsx`: 175–235.
- `surfaces/AuthoringFilingBar.tsx`: request construction only.
- `surfaces/AuthoringAiDraft.tsx`: 395–425.
- `editor/AssignReviewDialog.tsx`: 130–175.
- `components/ana/useAnaChat.ts`: 795–975.
- `lib/queryClient.ts`: 362–459.
- `utils/authToken.ts`: 1–190.
- `services/portal/authService.tsx`: 137–220, 660–690, 986–1000.
- `flags/featureFlags.ts`: 55–100, 313–322.
- `v2/editorTarget.ts`: 201–226.
- `v2/navParams.ts`: 95–113.

**Server code traced:**
- `server/routes/authoring.router.ts`:
  - router auth and identity: 100–200, 299–340, 380–520, 600–760
  - section PATCH and history/revert: 1647–2236
  - comments and citations: 2254–2675
  - freeze and e-sign: 3708–3830, 3924–4004
  - citations, refresh, export history: 4184–4206, 4305–4362, 4506–4570, 4631–4667
  - admin delete, export, file-to-vault: 4922–4960, 4994–5050, 5153–5212
  - audit read, decisions, reorder, images: 5758–5800, 5927–6127, 6171–6240, 6278–6408
- Authoring services and middleware: `middleware/authoringObjectAuthorization.ts` (all), `services/authoring/authoring-permissions.ts` 60–260, `document-lock.ts` 55–154, `authoring-evidence.ts` 103–250, `revision-ledger.ts` 188–240, `clinical-regulatory-evidence/source-usage.service.ts` 170–260 and 488–532.
- Vault and upload: `routes/c2c/project-vault.ts` 470–495 and 1552–1650, `routes/vault-ingest.ts` 53–75, 115–120 and 225–250, `services/vault/vault-ingest.service.ts` 205–240 and 345–380, `middleware/uploadSafety.ts` 117–200, `utils/fileSignature.ts` (all).
- AnA: `routes/ana-ri/stream.ts` 436–520, 642–700 and 770–900; `routes/ana-ri/shared.ts` 48–62; `services/ana-ri/chat-context-builder.ts` 105–160 and 610–650; `services/ana-ri/surface-context-block.ts` 1–80; `services/ana/AnaToolDefinitions.ts` 2740–2830; `AnaToolExecutor.ts` 338–360 and 13745–13775; `tool-authorization.register.json` (class counts, 3017–3023).
- Collaboration: `services/hocuspocus-server.ts` 1–60 and 120–390, `services/collab/collab-authorization.ts` (all), `routes/realtime-collab.ts` 195–250.
- Platform middleware: `middleware/enterprise-security.ts` 440–600, 668–718 and 920–1060.
- Export and other routes: `export/authoring-images.ts` 1–45; `routes/c2c/projects.ts` 1630–1700; `routes/c2c/documents.ts` 292–307; `types/auth-request.ts` 39–49; `utils/authedOrgId.ts` 40–48; `bootstrap/register-inline-routes.ts` 300–320.
- Infrastructure and schema: `terraform/modules/cloudfront/main.tf` 110–147; DDL in `db/migrations/20260725_authoring_document_loop_tables.sql` 87–100 and 185–205, and `migrations/20260728_authoring_comments_threading.sql` 40–70.
- Dependencies in `node_modules`: `@tiptap/extension-link@3.31.3` (isAllowedUri, parse/render/setLink) and `@tiptap/core@3.31.3` (createNodeFromContent, elementFromString).

**Gates run (read-only):**
- `check:security-patterns` passes (0 violations in 2,863 files).
- `ci:unauthenticated-fetch` passes (70 fetch() calls scanned, 0 baselined).
- Neither gate inspects body-supplied object ids, HTML insertion, or blob/iframe handling, so neither covers SEC-A-1, SEC-A-2 or SEC-A-3.

**Traced and found to hold (no finding):**
- **AnA answers:** marked, then a DOMPurify allowlist, then React elements. Only http(s) and mailto hrefs survive, and there are no images (`AnaMarkdown.tsx:21-27,73-78,101-110`).
- **Document view:** `sanitizeAuthoringHtml` rewrites `/api/` image sources, and only `/api/authoring/images/` is fetched with credentials (`renderSafeMarkdown.ts:176-199`; `imageNode.ts:51-81`).
- **Link hrefs:** the link bar allows http(s) and mailto only (`RichSectionEditor.tsx:1526-1538`). TipTap's isAllowedUri also blocks `javascript:` in parse, render and setLink.
- **AI text inserted as a suggestion:** it goes through a markdown subset with no links or images (`suggestions.ts:29-43,833-870`).
- **Paste:** parsed with DOMParser, so nothing executes.
- **History, comment and audit rails:** rendered as text nodes.
- **Export download:** the file name comes from `safeFileName` and the file is saved through `a.download` (`AuthoringCreateExport.tsx:203`; `download.ts:28-70`). The server-side export fetches no external images (`authoring-images.ts:10-20`).
- **Tenant id:** every authoring route takes it from the verified JWT (`authoring.router.ts:112-181,468-475`), and a mismatching `x-organization-id` header is refused (`enterprise-security.ts:558-600`).
- **Mutations that check the path correctly:** e-sign (`3924-3964`), reorder (`6171-6240`), comment resolve (`authoringObjectAuthorization.ts:43-73`), revert `rev_id`, which is bound to the path section (`2121-2124`), and cite/uncite, which are bound to the path section (`source-usage.service.ts:186-201,253-257`).
- **Image upload:** `uploadSectionImage` (`2137-2158`) uses a raw fetch instead of `apiUpload`, but it sends the bearer. The route accepts only PNG, JPEG and GIF by magic bytes and runs an AV scan (`6278-6340`). No security control is lost; it is only duplicated code.
- **Absent patterns:** there are no postMessage handlers and no `location`/`window.open` sinks in the editor family. The window-global handoff readers require a numeric `setAt`, so an injected element (DOM clobbering) cannot pose as a handoff target (`editorTarget.ts:201-216`; `navParams.ts:95-107`).

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| SEC-A-1 | blocker | `authoring.router.ts:4307-4333`; `source-usage.service.ts:502-529`; `DocumentWorkbench.tsx:1881-1887` | "Re-read source" rewrites the checksum of any unfrozen citation in the tenant, including one on a sealed document. It writes no audit entry, and the rail then says "recorded at cite time", which is no longer true. |
| SEC-A-2 | high | `authoring.router.ts:2257,2287-2314`; `DocumentWorkbench.tsx:2284-2288,2365-2368` | A comment and its audit event land on whatever document the request body names. This bypasses per-document permission and the freeze gate. |
| SEC-A-3 | high | `ProjectFilesPanel.tsx:118-120,203-205,293,554` (mounted `DocumentWorkbench.tsx:4659-4673`) | The "PDF" viewer shows a file in the app's own origin (a blob: URL) with whatever type the server stored, inside an unsandboxed iframe. The vault accepts `text/html` bytes saved under a `.pdf` name. |
| SEC-A-4 | medium | `chat-context-builder.ts:143-152`; `stream.ts:781,836-838`; `DocumentWorkbench.tsx:963-984` | Section titles and codes, which any author can set, are pasted unescaped into AnA's system prompt. |
| SEC-A-5 | medium | `DocumentWorkbench.tsx:3836`; `RichSectionEditor.tsx:325,1095-1120,1873-1882`; `authService.tsx:206-219` | Unsaved section text survives sign-out in localStorage, is not tied to a user or tenant, and is offered to whoever opens that section next. |
| SEC-A-6 | medium | `RichSectionEditor.tsx:1432-1438`; `DocumentWorkbench.tsx:4668`; `ProjectFilesPanel.tsx:96-102,345-347` | "Insert reference" parses a vault title as HTML. A title can inject forged suggestions, citations or images while the user is told plain text was inserted. |
| SEC-A-7 | medium | `DocumentWorkbench.tsx:2003-2009,2025-2026,3850-3858,4093-4096`; `authoring.router.ts:1655-1661,1873-1881,5995-6007` | Who proposed a change, and whether text came from AnA, are whatever the client says. The server records these claims as fact. |
| SEC-A-8 | medium | `authoring.router.ts:2515-2571,4631-4667`; `source-usage.service.ts:205-221,246-260`; `DocumentWorkbench.tsx:1641-1643,3905-3917` | Citing, un-citing and "Re-read all" write no audit row. Citing an already-cited source silently resets its stored checksum. |
| SEC-A-9 | medium | `authoring.router.ts:2207,2215-2224` | A revert commits before its audit row is written. If the audit write then fails, the revert stands and the author is told it failed. |
| SEC-A-10 | medium (latent) | `collab-authorization.ts:94-119`; `hocuspocus-server.ts:285-286,364-388`; `DocumentWorkbench.tsx:3919-3926` | The live co-editing socket checks only the tenant: no per-document permission and no frozen-document check. Both feature flags are off by default. |
| SEC-A-11 | low | `renderSafeMarkdown.ts:83-105`; `imageNode.ts:58-67`; `cloudfront/main.tf:143` | Authored sections load external images, and the SPA policy has no `img-src`, so an image can act as a beacon for every reviewer. |
| SEC-A-12 | low | `authoring.router.ts:655`; `authoring-evidence.ts:200` | The session id on every authoring audit row is either whatever the client sends or a random value. |

### SEC-A-1 (blocker): "Re-read source" re-baselines any citation in the tenant, including on sealed documents, unaudited

**What the code does**
- The workbench's Re-read button (`DocumentWorkbench.tsx:4619`) posts `` `/api/authoring/sections/${activeSectionId}/refresh-token` `` with `{ cite_id: citationId }` (`1883-1885`).
- Object authorization and the freeze guard are evaluated on the section in the URL path:
  - `authoringObjectAuthorization.ts:133-140` calls `resolveAuthoringSectionScope(pool, tenantId, sectionId)`.
  - `authoring.router.ts:443` checks `checkSectionWritable(pool, req.params.sectionId, tenantId)`, and `:452` calls `canEditSection(req, req.params.sectionId)`.
- The handler then ignores that section:
  - `4307`: "`:sectionId is addressing only. A citation is identified by cite_id within the caller's tenant`"
  - `4311`: `const { cite_id } = req.body;`
  - `4333`: `refreshSourceCitation(tenantId, String(cite_id))`
- The service looks the citation up by `WHERE id = $1 AND tenant_id = $2` (`source-usage.service.ts:502-503`). It refuses only `if (row.frozen_at)` (`508`), then runs `UPDATE authoring_citations SET payload_sha256 = $1 WHERE id = $2 AND tenant_id = $3` (`525`).
- Neither the handler (`4305-4362`) nor the service (`488-532`) writes an audit row.
- Nothing in `server/` ever sets `authoring_citations.frozen_at`. Grep finds only reads, at `authoring.router.ts:2580,4193,4383,4642`, and the freeze handler (`3708-3923`) never touches citations. So a sealed document's citations remain refreshable.
- Citation ids can be listed by any member of the tenant. `GET /docs/:docId/citations` (`4184-4201`) is scoped only by tenant, and GET requests skip the object check (`authoringObjectAuthorization.ts:222`).

**Why it matters**
- The Sources rail tells a reviewer "The checksum recorded at cite time still matches this source record" (`DocumentWorkbench.tsx:449`) or "Source changed since cited" (`461-466`).
- After a refresh, the stored value is no longer the cite-time checksum and the "changed" warning is gone. No record says who re-baselined it or what the previous value was.
- A member with edit rights on any one section can do this to a citation on a document they have no permission on. That includes a FROZEN or APPROVED document after it has been signed.
- The result is a lineage record changed without document permission, after sealing, with no audit entry, and a state shown to the person that is false.

**Smallest fix**
- In refresh-token, scope the lookup by the path section: `WHERE id=$1 AND section_id=$2 AND tenant_id=$3`.
- Refuse the refresh when the citation's own document is locked, or set `frozen_at` on a document's citations when it is frozen.
- Write an audit row carrying the old and new checksum and the citation id in the same transaction, for both refresh-token and refresh-all.
- Stop describing a refreshed value as "recorded at cite time".

### SEC-A-2 (high): comments and their audit events are filed against the document named in the request body

**What the code does**
- `addComment` sends the section in the URL path plus `doc_id: activeDocId` in the body (`DocumentWorkbench.tsx:2286`). `addReply` also sends `parent_comment_id` (`2368`).
- The server reads `const { body, anchor, doc_id, parent_comment_id, position_data } = req.body;` (`authoring.router.ts:2257`).
  - It checks only that the path section belongs to the tenant (`2279-2285`).
  - It inserts `doc_id` and `parent_comment_id` exactly as sent (`2296,2302`).
  - It writes `createAuditEvent(doc_id, …)` (`2308-2309`).
- The database does not stop this. `authoring_comments.doc_id` is a UUID with no foreign key (`20260725…sql:87-97`), and the parent foreign key is on the id alone (`20260728…sql:61-66`).
- The effects on document B:
  - Its comment rail reads `WHERE c.doc_id = $1 AND c.tenant_id = $2` (`2617`), and replies are read by parent (`2655`), so the injected thread appears there.
  - Its audit rail reads `authoring_audit_trail … WHERE doc_id = $1` (`5771-5772`), so the event appears there.
  - Freeze counts open comments on `doc_id` (`3778-3780`) and refuses with `DOCUMENT_NOT_SETTLED` (`3809`). A freezer who acknowledges seals B with "`[Sealed with ${openCommentCount} unresolved comment(s)…`" (`3825`).
  - B's reviewers cannot resolve the thread, because PATCH `/comments/:id` authorizes through the comment's section, which belongs to document A (`authoringObjectAuthorization.ts:43-73,183-189`).

**Why it matters**
- Object authorization exists because "authenticated tenant membership is necessary but not sufficient to mutate a governed document" (`authoringObjectAuthorization.ts:210-214`).
- A member with comment rights on any document can write review threads and audit events into another document's record. That includes a frozen document, because the freeze gate checked A, not B. The injected thread can block or annotate B's seal.
- The impact stays within one tenant: rows carry the session's tenant and reads filter on it.

**Smallest fix**
- Take `doc_id` from the section row and refuse a body value that differs.
- Require `parent_comment_id` to be on the same section and tenant.
- Write the comment and its audit row in one transaction.

### SEC-A-3 (high): the Project files viewer runs server-typed content in the app's origin

**What the code does**
- The workbench mounts `ProjectFilesPanel` in the vault rail (`4659-4673`).
- When the user clicks Open:
  1. It reads `const mime = responseHeader(res, 'Content-Type') ?? blob.type` (`ProjectFilesPanel.tsx:204`).
  2. It decides the file is a PDF with `return /pdf/i.test(mime) || /\.pdf$/i.test(title);` (`119`). A `.pdf` title is enough.
  3. It builds the viewer URL with `URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }))` (`293`), which keeps the server's type.
  4. It renders `<iframe className="pf-viewer-frame" src={viewer.url} …/>` with no `sandbox` attribute (`554`).
- On the server:
  - The download sets `Content-Type` to the stored `doc.mime_type` (`project-vault.ts:1644`).
  - The stored type is whatever the multipart part declared: `mimeType: (req as any).file?.mimetype` (`vault-ingest.ts:248`).
  - The upload route checks only the file extension (`53-55,72-75`).
  - `text/html` is on the accepted text-like list (`fileSignature.ts:43`), and text-like types pass on a printable-bytes heuristic (`152-154`, called at `vault-ingest.service.ts:233`).
  - The title is `row.document_title || row.file_name` (`project-vault.ts:472`), and `documentTitle` accepts any non-empty string (`vault-ingest.ts:117`).
- So an editor-role member can upload HTML declared as `text/html` under the name `report.pdf`. When a colleague clicks Open in the editor's Project files rail, that HTML becomes a same-origin blob document in an unsandboxed frame.

**Why it matters**
- The SPA served from CloudFront sends only `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'` (`cloudfront/main.tf:143`). There is no `script-src`; the file itself says one "needs a browser check through a real distribution first" (`116-119`).
- Bearer and refresh tokens are kept in web storage (`authToken.ts:57-77`; `authService.tsx:137-143`).
- Script in that frame would run as the viewer. It could take their tokens, write governed content in their name with a reason, or draw a fake signing dialog.
- Not verified in a browser: whether the blob frame loads under the inherited `frame-ancestors`, and whether inline script then runs. Deployments that serve the SPA from Express get the nonce-based CSP, which would block inline script.

**Smallest fix**
- In the viewer, frame only bytes that begin with `%PDF`, and always wrap them as `new Blob([bytes], {type:'application/pdf'})`. Add `sandbox` to the iframe, or render with PDF.js.
- At vault ingest, tie the declared type to the file's magic bytes and extension, and refuse `text/html` and XML for `.pdf`.

### SEC-A-4 (medium): document text reaches AnA's system prompt unfenced

**What the code does**
- The workbench grounds AnA with `sectionCode: activeSection?.code`, `sectionTitle: activeSection?.title`, `artifactStatus` and `moduleCode` (`DocumentWorkbench.tsx:963-984`). These are sent as `authoring_context` (`useAnaChat.ts:819-832,895`).
- The server builds a block with `buildAuthoringContextBlock(authoring_context)` (`stream.ts:781`) and appends it to `orchestration.systemPrompt` (`836-838`). The builder interpolates raw text: `` parts.push(`  <section_title>${ac.sectionTitle}</section_title>`) `` (`chat-context-builder.ts:150`), with no escaping, no length cap and no fence. The route block does the same with `sectionCode` (`105-141`).
- The prompt-injection guard inspects only the user's `message`, and by default it only observes (`stream.ts:468-479`).
- The codebase already says this class of input is dangerous: "It arrives in a request body, so it is client-controlled, and it is being placed into a system prompt. Treating it as trusted would make it a prompt-injection channel" (`surface-context-block.ts:18-22`). That builder sanitizes and fences its input; the authoring block does neither.
- Section titles can come from several places:
  - they are saved as given by anyone with edit rights (`authoring.router.ts:1815-1819`);
  - Word import;
  - AnA's own drafting tools.
- Document-derived text also enters user turns:
  - `draftPrompt` (`2761-2763`);
  - "Ask what changed", which includes the source title (`4630-4637`);
  - the program name (`1079-1086`);
  - model-authored "Next actions", which become a user message on click (`4062-4083`).

**Why it matters**
- One author's section title becomes system-level instruction in every colleague's AnA turn on that section, carried out with that colleague's authority.
- The damage is bounded:
  - 552 read-class tools run without confirmation, while write tools need a click (`AnaToolExecutor.ts:338-360`; register counts: 552 read, 158 confirm, 17 refuse).
  - Web tools are limited to an allowlist and are off unless environment flags turn them on (`AnaToolDefinitions.ts:2789,2802,2829-2830`).

**Smallest fix**
- Build the authoring block with the same `sanitizeLine`, caps and "observed data, not instruction" fence that `buildSurfaceContextBlock` uses.
- Quote and fence titles interpolated into client-side prompts.

### SEC-A-5 (medium): unsaved regulated text outlives the session on the device

**What the code does**
- The workbench sets `storageKey={activeSection.id}` (`3836`), and the editor caches every keystroke under `'dc::' + storageKey` (`RichSectionEditor.tsx:325,1087`).
- On mount it offers back any cached text that differs from the saved record: `if (cached != null && cached !== (value ?? '')) setRestoreOffer(cached)` (`1099`).
  - The notice does not say whose draft it is (`1873-1875`).
  - Restore has no read-only check, so it replaces the displayed text even on a sealed section (`1106-1117`).
- Logout and the idle sign-out clear only the auth keys (`authService.tsx:206-219,986-995`). Nothing else in `client/src` references `dc::`.

**Why it matters**
- On a shared browser profile, the next colleague to open that section is offered the previous user's unsaved text.
- If they restore and save, those words are recorded as their revision, under their reason. That breaks attribution under §11.10(e) and §11.50.
- The text also stays readable at rest after sign-out. The guard dialog tells the author "this browser, on this machine" (`DocumentWorkbench.tsx:5117`) but not that the text outlives the session.

**Smallest fix**
- Include the tenant and user in the cache key.
- Purge `dc::*` in `clearAuth`.
- Say in the restore notice whose draft it is and when it was written.
- Suppress the offer when the editor is read-only.

### SEC-A-6 (medium): "Insert reference" inserts a vault title as markup

**What the code does**
- The panel builds ``[Ref: “${doc.title}” …]`` (`ProjectFilesPanel.tsx:96-102`). The workbench wires it to `insertReference` (`DocumentWorkbench.tsx:4668`), which runs `editor.chain().focus().insertContent(clean)` (`RichSectionEditor.tsx:1437`).
- TipTap parses a string as HTML (`@tiptap/core` dist `index.js:603-630`, via DOMParser at `555-560`).
- The editor's schema therefore turns markup in the title into:
  - suggestions with any author, from `<ins data-author-id data-author-name>` (`suggestions.ts:80-97,110-111`);
  - citations, from `<a data-cite>` (`citationNode.ts:194-202`; `citations.ts:63`);
  - images with any `src` (`imageNode.ts:136-138`).
- The code and the UI both promise text: the doc comment says "Deliberately text" (`RichSectionEditor.tsx:171`), and the toast says "inserted at the caret as text" (`ProjectFilesPanel.tsx:347`).
- Titles accept any string (`vault-ingest.ts:117`).

**Why it matters**
- One click on a crafted file inserts, into governed content, a suggestion attributed to "AnA (AI draft)" or a colleague, a citation of any source in the tenant, or an external image.
- The author is told that plain text was inserted.

**Smallest fix**
- Insert a text node, `insertContent({ type: 'text', text: clean })`, or escape the string first.

### SEC-A-7 (medium): authorship and machine lineage are client claims recorded as fact

**What the code does**
- Suggestion authors are set by the client: from `useAuth` (`3853-3854`) and as `{ id: 'ana', name: 'AnA (AI draft)' }` (`4094-4095`). They are saved inside the section HTML.
- On save the workbench sends `acceptedAuthors` and `acceptedMachineText` (`2003-2009,2025-2026`).
  - The server keeps any id on its machine list but checks no provenance (`revision-ledger.ts:188-200`; `authoring.router.ts:1655-1661`).
  - It sets the revision origin from those fields: `contributors.length ? 'ai-draft-accept' : 'human-edit'` (`1879`).
- Tracked-change decision rows store the client-sent `text`, `changeType` and `sectionId` without checking them against `:id` (`5995-6007,6084-6101`).
- The audit rail qualifies the proposer but prints the quoted text as record (`DocumentWorkbench.tsx:262-267`).

**Why it matters**
- Human text can be recorded as AI-accepted, and AI text can be recorded as human by leaving the fields out.
- A decision about a change that never existed can be written into the Part 11 trail.
- The actor on these rows is JWT-derived; the claims inside them are not verified.

**Smallest fix**
- Accept machine lineage only when it is tied to ids the server issued (AnA turn or draft ids), as the AI-draft accept path already does with `draftId`.
- Check that a decision's `sectionId` belongs to `:id`.
- Label client-asserted decision text as such in the rail.

### SEC-A-8 (medium): citation writes are unaudited, and re-citing re-baselines the checksum

**What the code does**
- None of these write an audit row:
  - `cite-source` (`authoring.router.ts:2515-2546`);
  - the uncite hard `DELETE` (`2549-2571`; `source-usage.service.ts:254`);
  - `refresh-all` (`4631-4667`).
- Citing a source that is already cited runs `SET payload_sha256 = $1` (`source-usage.service.ts:205-216`).
- The workbench fires cite-source whenever the editor inserts a citation not in `sources` (`DocumentWorkbench.tsx:3905-3917`). `sources` is emptied at every section load (`1643`), so a citation inserted during that window silently resets the checksum.

**Why it matters**
- The section's evidence lineage changes with no entry in the audit trail.
- The rail presents that trail as the list of governed acts (`4370`).

**Smallest fix**
- Write an audit row for each citation write, in the same transaction.
- Make re-cite a no-op, and leave re-reading to the explicit, audited refresh.
- Trigger the implicit cite only once `sourcesState === 'ready'`.

### SEC-A-9 (medium): revert commits before its audit row

**What the code does**
- Revert (`DocumentWorkbench.tsx:2234-2273`) commits the content, lineage, revision and filing change at `authoring.router.ts:2207`.
- It then calls `createAuditTrail(req, …, 'REVERT', …)` on the connection pool, outside the transaction (`2215-2224`).
- If that standalone audit write fails in production, it throws (`authoring-evidence.ts:238-248`). The route returns 500 (`2232-2235`), and the workbench says "Couldn't revert" while keeping the old text on screen (`2265-2270`).
- Comment creation follows the same order (`2287-2314`).

**Why it matters**
- The trigger is narrow, but a governed content change can persist with no `authoring_audit_trail` row, and the person is told nothing changed.
- The save path, by contrast, writes its audit row inside the transaction (`1926-1937`).

**Smallest fix**
- Pass the transaction client to `createAuditTrail` before `COMMIT`.

### SEC-A-10 (medium, latent): the co-editing socket authorizes by tenant only

**What the code does**
- When `ENABLE_LIVE_COEDITING` is on, the workbench opens `` `authoring:${activeDoc.id}:${activeSection.id}` `` with the bearer token (`DocumentWorkbench.tsx:3919-3923`).
- `authorizeResource` checks only that the document is in the tenant and the section is in the document (`collab-authorization.ts:102,112,119`). It does not check document permissions or document status.
- The socket is read-write unless the tenant as a whole is read-only (`hocuspocus-server.ts:170,286`). `onStoreDocument` persists the shared document (`364-388`).
- The editor adopts persisted shared state as the saved baseline and shows "All changes saved" (`RichSectionEditor.tsx:1028-1047`).

**Why it matters**
- With the server flag on, any member of the tenant could write shared state into a document they have no permission on, or into a frozen one.
- The next editor would see that state as the saved section and save it in their own name. Viewers of a sealed document would see it in place of the sealed text.
- Both flags default off (`featureFlags.ts:74-81`; `ENABLE_COLLAB_CRDT` appears only in `.env.example:227`). The values in deployed environments were not verified.

**Smallest fix**
- Authorize the socket with `decideAuthoringPermission`: `edit` for read-write, `view` for read-only.
- Force read-only for locked documents, and refuse `onStoreDocument` on them.

### SEC-A-11 (low): external images in authored sections; no `img-src`

**What the code does**
- The authoring sanitizer allows `img` and `src`; its own comment says "External http(s) and data:image URIs pass through" (`renderSafeMarkdown.ts:89-90,95-104`).
- The editor's image node returns any `src` outside `/api/` unchanged (`imageNode.ts:66`), and the document view renders it (`DocumentWorkbench.tsx:3511`).
- The same module keeps images out of chat because they are "a tracking/exfil surface" (`renderSafeMarkdown.ts:67-69`).
- The SPA's CSP has no `img-src` (`cloudfront/main.tf:143`).

**Why it matters**
- An author, or a vault title via SEC-A-6, can plant an image that contacts an outside host for every reviewer who opens the section or the document view.

**Smallest fix**
- Allow only `/api/authoring/images/`, `data:` and `blob:` images, both at render and at save.
- Add `img-src 'self' data: blob:` to the SPA's CSP.

### SEC-A-12 (low): the audit session id is client-supplied or random

**What the code does**
- The audit context takes `sessionId: (req.headers as any)['x-session-id']` (`authoring.router.ts:655`).
- The router strips `x-roles`, `x-user-email` and `x-tenant-id`, but not `x-session-id` (`117-119`).
- When the header is absent, the writer uses `ctx.sessionId || crypto.randomUUID()` (`authoring-evidence.ts:200`) and stores it in `authoring_audit_trail` (`206`).
- `apiRequest` never sends this header (`queryClient.ts:371-376`), so every row the workbench produces gets a random id.

**Why it matters**
- Governed acts cannot be tied back to the authenticated session.
- Any client can assert whatever session id it likes.

**Smallest fix**
- Take the session id from the verified token's session claim.
- Strip `x-session-id` along with the other identity headers.

### Outside this lens, for the owning lens to confirm
Exporting a sealed document, or filing one to the vault, appears to be unreachable in the assembled app (derived from the code; not executed):
- Object authorization classes `/docs/:id/export` and `/docs/:id/file-to-vault` as `edit` (`authoringObjectAuthorization.ts:29-41,174-181`).
- It refuses `edit` on FROZEN and APPROVED documents with a 409 (`authoring-permissions.ts:121-129,195`; `authoringObjectAuthorization.ts:258-265`).
- Export itself requires a sealed document (`authoring.router.ts:5035-5038`).
- E-sign was fixed for exactly this conflict (`authoringObjectAuthorization.ts:31-35`). The export tests mount the router without the middleware.

## Earlier findings re-verified

No finding in the four earlier security reports (09-24, 09-26, 09-28, 09-28 eCTD second pass) names `DocumentWorkbench.tsx`, so every SEC-A item above is new. These earlier findings sit on paths this file reaches:

| Earlier id | State at head | Evidence |
|---|---|---|
| SEC-0928-1 (AnA `retire_qms_document` retired a controlled document on a click; reachable from this pane via `/api/ana-ri/stream`) | **fixed** | The handler refuses via `refuseSignatureInChat` (`AnaToolExecutor.ts:13763-13775`). The register class is `refuse` (`tool-authorization.register.json:3017-3023`). DP-36's structural "confirm ceiling" was not re-read. |
| DP-33 (`DELETE /api/authoring/docs/:docId` behind a static `x-admin-token`, tenant-blind handler) | **still open**; not called by this file | `authoring.router.ts:4922-4924` (`adminHeader = req.headers['x-admin-token']`) and `4955` (`DELETE FROM authoring_documents WHERE id = $1`). |
| IAM-06 (bearer JWTs in web storage; the register marks it closed on session controls) | **storage unchanged** | `authToken.ts:57-77`, and refresh token at `authService.tsx:137-143,997-1000`. This file reads the token at `2140` and `3923`. It is what makes SEC-A-3 serious. |
| INF-04 (SPA CSP) | **closed as reported, residual relevant here** | The policy still has no `script-src`, `img-src` or `frame-src` (`cloudfront/main.tf:143`). Bears on SEC-A-3 and SEC-A-11. |
| DP-08 (the prompt-injection heuristic) | **unchanged in the respect this file reaches** | Only `message` is inspected, detection-only by default (`stream.ts:468-479`). The system-prompt context from this file is not inspected (SEC-A-4). |
| IAM-19 (the `/ana` socket has no periodic re-check) | not reachable from this file; not re-verified | This pane uses the HTTP SSE stream (`useAnaChat.ts:955`). |
| Part 11-lens items in this file (not security; noted in passing) | **hold** | Revert is disabled on a sealed document (`DocumentWorkbench.tsx:4278-4286`). The server enforces the reason for change on content saves (`authoring.router.ts:1806-1813`; `governed-reason.ts:30-34`). |

DP-37, DP-38, DP-39, SEC-0928-2, DP-40 and DP-41 are outside this file and this lens, and were not re-verified.

## What I did NOT get to

- **Imported components not read line by line:**
  - `RichSectionEditor.tsx` (about 35% of its 2,716 lines read);
  - `ProjectFilesPanel.tsx` (about half);
  - `crossReferenceNode.ts`, `captionNumbering.ts`, `roundTrip.ts`, `findReplace.ts`, `commentAnchor.ts`;
  - `DocumentCanvas.tsx` and `AuthoringPlaceIntoFiling.tsx` (not opened);
  - `AuthoringSignatures.tsx`, `AuthoringExports.tsx`, `AnaActivity.tsx`, `AnaGrounding.tsx`, `AnaWorkPanel.tsx`, `AnaOutputs.tsx` (searched for sinks only);
  - `SignoffList` → `GovernedActionSignoff` (not traced; I relied on the 09-26 lens for `/api/ana-ri/governed-action`).
- **No browser:** SEC-A-3 script execution and how blob: frames inherit the CSP were not verified. The SEC-A-11 beacon was not observed.
- **No running server or database:** SEC-A-1, SEC-A-2 and SEC-A-9 are deductions from the code; no request was replayed.
- **AnA server side:** I read only the context assembly in `stream.ts` and the injection guard.
  - Not traced: `prefetchRouteIntelligenceContext`, `buildMemoryContextForChat`, `enrichContextForChat`, and how `artifactId` pulls document text into grounding.
  - Whether each consumer of the client-supplied `project_id` scopes by the session org was spot-checked in one place only (`intelligence-prefix.ts:57-90`). While there I noticed `parseInt(String(projectId))` applied to UUID program ids, which I did not pursue.
- **Collaboration:** `storeCollabState` and `loadCollabState` were not read. I did not check whether shared state is ever written back to `authoring_sections`, or the flag values in any deployed environment.
- **Other paths into the same data:**
  - Other renderers of authored section HTML (`Review.tsx`, `DocumentCanvas`, batch-draft cards).
  - Other writers of comments and citations, such as AnA tools.
  - `DELETE /export-history/:id` (`authoring.router.ts:4506-4567`), which is not called by this file.
  - Task creation: its `assigneeId` is not checked for org membership (`taskManagement.routes.ts:190-249`). No cross-tenant display was found, since the notification read is org-scoped (`notification-service.ts:176-181`).
- **Gates:** only `check:security-patterns` and `ci:unauthenticated-fetch` were run; the rest of the standing gate set was not.
