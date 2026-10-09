# Triage group: coauthor-and-ribbon
Returned by the read-only re-check of 2026-09-28 (as returned; scratch paths redacted).

## P11-B-1 — OPEN — blocker

### evidence

Nobody has fixed it. `git log -S 'coauthor_document.updated'` finds only the two docs commits (9812ad83, 3ed2518b). No coauthor file has `changeReason` or `requireGovernedReason`. Since the review commit 7087f46e2, the only commits touching these files are 53237f62, af7067b9 and dad9ffa8 (01PwLFr8). They change EctdCoauthor's empty-state copy and its test, and nothing else.

At HEAD:
- The client sends `{ content: serialized }` only (EctdCoauthor.tsx:363). No reason UI exists anywhere in the file, and the mount is at :950-967.
- The route reads no reason: coauthor.ts:297 `const { title, content, status } = req.body || {};`. It calls the shared writer at :327 with no actor and no reason. ectd-documents.ts:283 does the same.
- In the writer `applyCoauthorDocumentPut` (coauthor-status-write.ts:241-304), the only write is `tx.update(coauthorDocuments).set(set)` at :301. The transaction makes no audit call and writes no `coauthor_document_versions` row.
- `recordCoauthorDocumentEvent`'s event type is still closed to `'coauthor_document.deleted' | 'coauthor_document.retaken'` (coauthor-audit.ts:47).
- The only writer of `coauthor_document_versions` is still batch-draft-routes.ts:475. Its own comment at :334-335 says this PUT "neither snapshots the content it replaces nor records who replaced it".
- Runtime check at HEAD: `vitest run server/routes/__tests__/coauthorPutStatus.test.ts -t 'saves a content-only PUT'` gives 2 passed, one per route. A content-only PUT with no reason gets 200 on both `/api/coauthor/documents/:id` and `/api/ectd-documents/:id`. The PGlite harness has no `audit_events` or versions table, so any audit write would have thrown there.
- The lineage gate still cannot see this writer. `check-lineage-save-gate.mjs` names coauthor only for batch-draft-routes.ts (:219), and `.set(set)` does not match its CONTENT_WRITE regex (:513-520).

Board: hand-on item 5 (docs/work-orders/README.md:660-686) goes to …01KiDof7 because it "holds server/routes/coauthor.ts since e2d36a2b". It does not say that EctdCoauthor.tsx is held by a different session, 01PwLFr8 (53237f62, 11:44:44Z). Neither session has a §0 claim row naming these files. The §0 row 49 mention of authoring.router.ts / DocumentWorkbench.tsx is an expired 09-25 window. 01KiDof7's last commit (dcef1a0a, 16:52Z) and its coverage-gap-sweep README do not mention item 5 or P11-B-1.

### proposedFix

One atomic change, because the writer, both routes and the client must agree. Otherwise every co-author save is refused until the client sends a reason.

1. **coauthor-audit.ts (cold).** Add `'coauthor_document.updated'` to the eventType union at :47.

2. **coauthor-status-write.ts (cold), `applyCoauthorDocumentPut`.** Add required `actor: CoauthorAuditActor` and `reason: string | null` arguments. Inside the existing FOR UPDATE transaction, after rules 2 and 3 have built `set` (:290-298), and only when `set` is non-empty (a restate or empty PUT stays a no-op with no reason needed):
   - (a) If `reason` is null, return `{ok:false, refusal:{httpStatus:400, body:{error:'REASON_REQUIRED', message:'A reason for change of at least 8 characters is required. Nothing was saved.'}}}`. Deciding this inside the transaction keeps the existing STATUS_NOT_SETTABLE and 409 codes and their tests intact.
   - (b) If `set.content !== undefined`, `set.content !== current.content` and `current.content?.trim()`, insert the replaced text:
     `INSERT INTO coauthor_document_versions (document_id, version_number, content, created_by, change_summary) SELECT $id, COALESCE(MAX(version_number),0)+1, $prev, $actorLabel, $reason FROM coauthor_document_versions WHERE document_id=$id RETURNING version_number`
     This copies batch-draft-routes.ts:470-485 and runs through `queryableFromDrizzle(tx)`.
   - (c) Call `recordCoauthorDocumentEvent(queryableFromDrizzle(tx), {eventType:'coauthor_document.updated', actor, reason, metadata:{changed:[keys of set except updatedAt], before:{status,title,moduleNumber,contentSha256}, after:{…}, supersededVersion}})`, as coauthor-snapshot.ts:450-476 does.
   - This covers status-only PUTs too; one of them can withdraw an approved filing copy to draft (:51-52).

3. **Routes, coauthor.ts:297-331 (HELD) and ectd-documents.ts:239-289 (cold).** Validate `optionalGovernedReason(req.body?.changeReason)` (governed-reason.ts:39) and return 400 before any write if it is present but short. Pass `actor: coauthorAuditActor(req)` and `reason`.

4. **EctdCoauthor.tsx (HELD).**
   - Add a reason field using the governed floor (`GOVERNED_REASON_MIN` from `@shared/constants/governed-reason`). Pass `showSaveButton={false}` to the editor, with a host Save button that stays disabled until the reason meets the floor and calls `editorRef.current.save()`.
   - `saveContent` (:357-378) sends `{ content, changeReason }`. On the ⌘S path it throws if the reason is short. Clear the reason after a confirmed save.
   - Handle ⌘S inside the reason input. Otherwise it reproduces A-A-1: ⌘S in the reason field opens the browser's own Save dialog.

5. **Follow-on, same lane.** List coauthor-status-write.ts in check-lineage-save-gate.mjs GUARDED and call `enforceAuthorLineage(client, …)` on the tx-derived client, as batch-draft-routes.ts does.

**Sequencing.**
- The core (writer, audit, ectd route, server tests) is all in cold files. Only the ~6 lines in coauthor.ts are held, until 2026-09-29T02:15:12Z.
- A server-first stage would record the audit row and the version copy about 9.5h sooner without breaking saves. The reason would be recorded when supplied and stored as null (never a placeholder) when absent. The route must still pass the actor, so coauthor.ts is on the critical path either way.
- The required reason must land together with the client, which is held until 2026-09-29T11:44:44Z.

### risk

- **DELETE regression.** `coauthor_document_versions.document_id` references coauthor_documents with ON DELETE NO ACTION (migrations/0000_sweet_joseph.sql:6444; applied by drizzle-kit push from shared/schema.ts:12040). Once ordinary saves write version rows, a DELETE of any edited document fails with FK error 23503, which both handlers (coauthor.ts:370, ectd-documents.ts:343) turn into a 500. This is already latent for documents with a batch-draft accept. Decide in the same change: the conservative choice for a regulated record is a 409 refusal naming the retained history. Deleting the versions in the delete's transaction is the alternative. No client calls either DELETE today (grep).
- **Retake path.** coauthor-snapshot.ts:450-476 still replaces a draft copy's co-author edits and keeps only their sha256. This fix does not cover it.
- **RLS.** The writer uses the global `db`, not requestDb. The versions table's parent-scoped policy (db/migrations/20260813…:369-375) behaves as the parent's does, so it passes today. Re-check if `app.rls_enforce` is ever set on the pool.
- **Lineage gate.** Adding the writer to the gate requires lineage tables in the route test's harness.

### failingTest

**Server, first red.** In server/routes/__tests__/coauthorPutStatus.test.ts, create `audit_events` and `coauthor_document_versions` in beforeAll using the DDL at batch-draft-accept-lineage.pglite.integration.test.ts:52-53. Then add to `describe.each(ROUTES)`:
- (1) `put(DRAFT,{content:'<p>revised</p>'})` expects 400 REASON_REQUIRED and the row unchanged. At HEAD it is 200 (verified).
- (2) With `changeReason:'Corrected dose in 2.5.3'`, expect one versions row holding '<p>cover</p>' at version 1, and one `audit_events` row with event_type 'coauthor_document.updated', user_id 3, that reason, and metadata before/after sha256 and supersededVersion 1. At HEAD there are 0 rows.
- (3) `put(APPROVED,{status:'draft',changeReason:…})` expects one audit row.
- (4) Atomicity: make the audit insert fail (drop `audit_events`) and expect 500 with content unchanged.
- The existing case at :371 must now send a changeReason.

**Client.** ectdCoauthorNoFixtures.test.tsx:360-405 expects Save disabled until a reason of 8 or more characters is typed, and the PUT body to equal `{content, changeReason}`. Red at HEAD.

### files

- `server/services/coauthor/coauthor-status-write.ts` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdGsmiSPjTqK9wiCacL
- `server/services/coauthor/coauthor-audit.ts` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdGsmiSPjTqK9wiCacL
- `server/routes/coauthor.ts` — held: True — e2d36a2b 2026-09-28T02:15:12Z (HS-0928-1 list total; before the review) — held until 2026-09-29T02:15:12Z; named in board hand-on item 5 — session_01KiDof7JE6LiaZhRvh2hJrb
- `server/routes/ectd-documents.ts` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdGsmiSPjTqK9wiCacL
- `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z (empty-state copy :678, :750-755, :900-915) — held until 2026-09-29T11:44:44Z; no board claim, and board item 5 does not mention this holder — session_01PwLFr89hq8E7ZHUcAH96HK
- `server/routes/__tests__/coauthorPutStatus.test.ts` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdGsmiSPjTqK9wiCacL
- `client/src/concept2cure/v2/__tests__/ectdCoauthorNoFixtures.test.tsx` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2
- `scripts/ci/check-lineage-save-gate.mjs` — held: False — e128a656 2026-09-22T04:09:55Z — session_01U2hGiy7gxEUhJ8hY4mNbi2

## P11-B-3 — OPEN — medium

### evidence

The mount at EctdCoauthor.tsx:950-967 still passes no `readOnly`. The prop defaults off (RichSectionEditor.tsx:503 `readOnly = false`), and everything keys on it:
- editable at :926;
- the ribbon `.rse-ribbon` at :2005;
- footer Save at :2817.

The list is read once (EctdCoauthor.tsx:270) and is unfiltered (coauthor.ts:99-104). No row carries a server read-only flag.

On an approved row, EctdCoauthor.tsx:919 still says 'What §… needs before it can promote' and :927 'Or keep drafting'. The only lock signal is the after-save alert at :945-949.

Runtime check at HEAD 60b0563f: `vitest run client/src/concept2cure/v2/__tests__/ectdCoauthorFinalizedRefusal.test.tsx` gives 1 passed. That test waits for an ENABLED 'Save (' button on an `approved` row (:112-118), so passing is runtime proof the defect is present.

Partial mitigation since the review: de430222 (01TTTQ1h, this lane) gated the device-draft restore offer on `!readOnly` (RichSectionEditor.tsx:1992). That closes the verifier's device-cache point, but only once the host passes `readOnly`. ⌘S (:1598) still calls `doSave` without checking `readOnly`. It is harmless on a canvas that is not dirty (doSave returns at :1197 when the buffer matches the saved text).

Board: covered only as 'open, with board item 5' (README.md:97). The board has no separate item.

### proposedFix

1. **Server (coauthor.ts, HELD by 01KiDof7).** Add `readOnly: isCoauthorVerdictStatus(d.status)` to each row returned by GET /documents (:99-121), GET /documents/:id (:131) and the PUT response (:338). `isCoauthorVerdictStatus` is exported from coauthor-status-write.ts:112 and is already imported there. Deciding on the server avoids a client copy of the vocabulary: the client's `statusToken` (:149-155) maps signed and locked to 'todo', and it does not trim, while the server's normaliser does (:107-109).

2. **Client (EctdCoauthor.tsx, HELD by 01PwLFr8).**
   - Add `readOnly?: boolean` to CoauthorDoc (:78-90).
   - Pass `readOnly={activeDoc.readOnly === true}` at :950.
   - When read-only, render a `role="status"` banner above the canvas naming the status and the only path: place the source authoring document into the filing again. This mirrors DocumentWorkbench's frozen banner at :3951.
   - Drop the ':919 promote' and ':927 keep drafting' copy for read-only rows.
   - Hide the P11-B-1 reason field.

3. **Optional (RichSectionEditor.tsx, HELD by 01KiDof7 until 2026-09-29T05:17:26Z).** Return early from the ⌘S handler at :1598 when `readOnly`.

Bundle this with P11-B-1. It needs the same two held files, and the reason field must not appear on a read-only row.

### risk

- The unchanged ectdCoauthorFinalizedRefusal.test.tsx goes red, because Save is no longer rendered on an approved row. The fix must rewrite it, not delete it.
- A row placed as approved while the surface is open still reaches the server's 409, because the list is read once. That refusal is honest and stays the backstop.
- If the flag is kept client-side after all, the check must trim, as the server's normaliser does.

### failingTest

**Client, first red.** New file client/src/concept2cure/v2/__tests__/ectdCoauthorReadOnly.test.tsx. GET returns `{...APPROVED_DOC, readOnly:true}` and the test expects:
- no `.rse-ribbon`;
- no button whose text includes 'Save (';
- `(document.querySelector('.rse-body .tiptap') as any).editor.isEditable === false`;
- a `[role=status]` banner containing 'approved' and 'read-only'.

It is red at HEAD: ectdCoauthorFinalizedRefusal passes, so Save is enabled on that row.

**Server.** In coauthorPutStatus.test.ts, GET /api/coauthor/documents rows expect `readOnly === true` for APPROVED, SIGNED, LOCKED and TAB_APPROVED ('approved\t'), and false for DRAFT. Red at HEAD because there is no field.

**Existing test.** Rewrite ectdCoauthorFinalizedRefusal.test.tsx to open a `draft` row (readOnly false) whose PUT answers 409. That keeps the refusal-copy assertion for the case the fix leaves open: a row that becomes a verdict while it is open.

### files

- `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx` — held: True — 53237f62 2026-09-28T11:44:44Z — held until 2026-09-29T11:44:44Z; the fix's AnswerLead edit (:916-928) sits directly after 53237f62's empty-state hunk (:903-914) — session_01PwLFr89hq8E7ZHUcAH96HK
- `server/routes/coauthor.ts` — held: True — e2d36a2b 2026-09-28T02:15:12Z — held until 2026-09-29T02:15:12Z — session_01KiDof7JE6LiaZhRvh2hJrb
- `client/src/concept2cure/v2/__tests__/ectdCoauthorFinalizedRefusal.test.tsx` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdGsmiSPjTqK9wiCacL
- `server/routes/__tests__/coauthorPutStatus.test.ts` — held: False — 24faac33 2026-09-23T10:50:30Z — session_015weqdGsmiSPjTqK9wiCacL
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx` — held: True — e1ce5501 2026-09-28T05:17:26Z (01KiDof7; also de430222/b43ec3af by 01TTTQ1h) — optional ⌘S guard only; held until 2026-09-29T05:17:26Z — session_01KiDof7JE6LiaZhRvh2hJrb

## P11-B-2 — OPEN — medium

### evidence

The defect as filed is unchanged:
- DocumentWorkbench.tsx:4041 `readOnly={docSealed}`, with `docSealed` computed from status only (:951-952).
- Header Save is `disabled={!dirty || saving || docSealed || changeReason.trim().length < 8}` (:3512).
- Draft with AnA is `disabled={docSealed}` (:3533). The AI-draft toggle is `disabled={!activeSection || docSealed}` (:3563).
- Rename and reorder show on `!docSealed` (:3805, :3816). The AI panel shows on `!docSealed` (:3969). Revert is `disabled={docSealed}` (:4500).
- GET /docs/:docId/sections (authoring.router.ts:1721-1778) returns no per-caller edit field.

Adjacent work landed since the review but does not cover this finding: e1ce5501 (…01KiDof7, 2026-09-28T05:17Z, coverage-gap sweep GE-P-3), with a follow-up in d4176395 (16:48Z).
- GET /docs/:docId now returns `access` from `callerDocumentAccess` (authoring.router.ts:1601-1690, used at :1707).
- `access` covers only `freeze`, `esign`, `fileToVault` and `assignReview`. There is no `edit` entry.
- The client parses it with `readDocumentAccess`/`actRefusal` (DocumentWorkbench.tsx:497-543) and uses it only for Assign review, File to vault, Freeze and E-sign (:3435-3468, :3591-3592, :4931).
- e1ce5501's RichSectionEditor hunks are aria-pressed and table-header a11y only (GA-3).

So a member with only a Reviewer or Viewer grant still gets a live ribbon and canvas and meets `AUTHORING_OBJECT_FORBIDDEN` at Save. Nothing in DocumentWorkbench.tsx handles that 403 (grep), so the canvas stays editable after the refusal.

Board: no claim names this item. Hand-on item 6 gives DocumentWorkbench.tsx findings to …01KZK3jg until 2026-09-29T01:58Z, but it does not list P11-B-2.

### proposedFix

Extend GE-P-3's mechanism rather than build a second one, so there is one implementation.

1. **Server, authoring.router.ts `callerDocumentAccess` (:1601).**
   - Add `edit: objectGate(editDecision, 'Editing', 'an Owner or Author grant')`, using `decideAuthoringPermission({action:'edit'})`. That decision already returns 'document-immutable' for FROZEN and APPROVED documents.
   - Grants can be scoped to a single section (authoring-permissions.ts:213-216). So also add a per-section `access: {edit}` to each row of GET /docs/:docId/sections (:1721-1778).
   - Compute the per-section values with one grants query per document through a new helper in authoring-permissions.ts, not N calls to `decideAuthoringPermission`. If the doc-level decision is denied but any section-scoped grant exists for the caller, report doc-level `edit` as null (unknown), not as a refusal.

2. **Client, DocumentWorkbench.tsx.**
   - Add `edit` to `DocumentAccess` / `readDocumentAccess` (:506-541).
   - `const editRefusal = actRefusal(activeSection?.access?.edit ?? docAccess.edit);`
   - `readOnly={docSealed || !!editRefusal}` (:4041).
   - Gate on the same value: header Save (:3512, and its title :3514), Draft with AnA (:3533), the AI-draft toggle and panel (:3563, :3969), rename and reorder (:3805, :3816), Revert (:4500), and the project-files cite.
   - Show the server's sentence as visible, described text, as GE-P-3 does. Name who can grant access (the document owner or an admin), because the product has no grant UI.
   - After a 403 `AUTHORING_OBJECT_FORBIDDEN` from the section PATCH, set the section's edit gate to refused and keep the device cache.

3. **Unknown handling.** Follow GE-P-3's contract: null means unknown, the control stays enabled and the write enforces. The verifier asked for fail-closed (`can_edit !== true`). Note the disagreement. Unknown-enabled is the right call here, because the gate enforces in every environment and typed text is cached (verification.md:274-291). Fail-closed would lock every author out whenever the access read fails.

### risk

- A doc-level-only flag would falsely deny section-scoped authors. Hence the per-section flag, or null at doc level.
- One extra grants query per sections read.
- workbenchA11ySweep.test.tsx and the GE-P-3 client tests mock `access` without `edit`. Unknown must stay enabled so they are not broken.
- The live co-editing socket checks tenant membership only (collab-authorization.ts:99-105). It is off by default. If it is ever enabled, the socket must set `connectionConfig.readOnly` for callers without `edit`, because a client-side `readOnly` is not enforcement.

### failingTest

**Server, first red.** In authoringDocAccess.pglite.integration.test.ts, extend the case at :135 ('a member with only a Reviewer grant…') to expect `body.access.edit` to match `{allowed:false, reason: /Editing needs an Owner or Author grant/}`. Add:
- the creator gets `edit.allowed === true`;
- a FROZEN document gets 'Editing is refused while the document's status is FROZEN';
- a section-scoped AUTHOR grant gets doc-level null and the section's `access.edit.allowed === true`.

Red at HEAD: there is no `edit` key.

**Client.** New file client/src/concept2cure/v2/__tests__/workbenchEditAccess.test.tsx. With GET /docs/:id returning `access.edit` refused, expect:
- no `.rse-ribbon`;
- editor `isEditable === false`;
- header Save disabled and described by the server's sentence;
- Draft with AnA and Revert disabled.

Then assert that a PATCH answering 403 AUTHORING_OBJECT_FORBIDDEN switches the canvas to read-only.

### files

- `server/routes/authoring.router.ts` — held: True — d4176395 2026-09-28T16:48:56Z — held until 2026-09-29T16:48:56Z (also e1ce5501 05:17Z by the same session; 63b43274/ce56754d 04:52Z by 01TTTQ1h) — session_01KiDof7JE6LiaZhRvh2hJrb
- `server/services/authoring/authoring-permissions.ts` — held: True — d4176395 2026-09-28T16:48:56Z — held until 2026-09-29T16:48:56Z — session_01KiDof7JE6LiaZhRvh2hJrb
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — held: True — 1de78ea8 (merge) 2026-09-28T11:53:54Z and 53237f62 11:44:44Z by 01PwLFr8 — 53237f62 rewrote the header Save button's title/label (:3509-3527), the exact control this fix changes; also 8a74ed55 11:22:55Z and e1ce5501 05:17:26Z by 01KiDof7; a75e3845/df10de68 01:16-01:58Z by 01KZK3jg (board item 6, until 2026-09-29T01:58Z). Last window closes 2026-09-29T11:53:54Z — session_01PwLFr89hq8E7ZHUcAH96HK; session_01KiDof7JE6LiaZhRvh2hJrb; session_01KZK3jgtmQBgNepqLjXjS3k
- `server/routes/__tests__/authoringDocAccess.pglite.integration.test.ts` — held: True — d4176395 2026-09-28T16:48:56Z — session_01KiDof7JE6LiaZhRvh2hJrb

## NEW-P11-B-1a (adjacent, found while re-checking P11-B-1) — NEW — medium

### evidence

POST /api/ectd-documents/:id/classify (ectd-documents.ts:448-480, `requireRole('regulatory-author')`) calls ingestion-service.ts `classifyDocument`. At :335-341 that writes `moduleNumber: result.sectionCode`, a section code chosen by the model at confidence ≥ 0.5, into coauthor_documents.
- It does not go through `applyCoauthorDocumentPut`. `loadOwnedDocument` (:250-265) checks the organisation only, so no verdict check runs.
- It writes no audit row.
- The shared rule treats module as a governed field that a verdict freezes (coauthor-status-write.ts:44-45; ectd-documents.ts:253-255: moving an approved document's module_number re-files its verdict against another IND checklist or NDA cockpit section).

So a model can re-file an approved copy, unaudited. No client caller was found (grep '/classify'). The route is reachable from the API only.

### proposedFix

- In `classifyDocument`, adopt the section code only when `!isCoauthorVerdictStatus(doc.status)`.
- Otherwise store the proposal in metadata only and report `adopted:false` with the reason.
- When a section code is adopted, write it through the same `coauthor_document.updated` event from P11-B-1, naming the model as the proposer and the caller as the actor.

Both files are cold: ingestion-service.ts is 760888fe 2026-09-23 (015weqdG) and ectd-documents.ts is 24faac33.

### risk

Not verified end to end. The gateway mock and the route mount were not exercised in this pass.

### failingTest

Add a PGlite case in the style of coauthorPutStatus.test.ts. Mock the gateway to return sectionCode 'm2.5' at confidence 0.9 for the APPROVED row, and expect `module_number` unchanged. Red at HEAD.

### files

- `server/services/ingestion/ingestion-service.ts` — held: False — 760888fe 2026-09-23T11:15:08Z — session_015weqdGsmiSPjTqK9wiCacL

## Notes

- **Read-only pass.** No repository file was changed, and `git status` is clean. I ran two existing tests at HEAD 60b0563f as runtime evidence:
  - `ectdCoauthorFinalizedRefusal.test.tsx`: 1 passed. An approved row gets an enabled Save, which proves P11-B-3.
  - `coauthorPutStatus.test.ts -t 'saves a content-only PUT'`: 2 passed. A PUT with no reason gets 200 on both routes, which proves P11-B-1.
- **Holders, precisely:**
  - `server/routes/coauthor.ts`: …01KiDof7 until 2026-09-29T02:15:12Z. Board item 5 names this hold.
  - `EctdCoauthor.tsx`: …01PwLFr8 until 2026-09-29T11:44:44Z (53237f62). Board item 5 does not mention this second holder, and P11-B-1 and P11-B-3 both need the file.
  - `RichSectionEditor.tsx`: …01KiDof7 until 2026-09-29T05:17:26Z (e1ce5501). Only the optional ⌘S guard needs it.
  - `authoring.router.ts` and `authoring-permissions.ts`: …01KiDof7 until 2026-09-29T16:48:56Z (d4176395).
  - `DocumentWorkbench.tsx`: three sessions. …01KZK3jg until 01:58Z (board item 6), …01KiDof7 until 11:22Z, …01PwLFr8 until 11:53:54Z. 53237f62 rewrote the header Save control that P11-B-2's fix changes.
  - No §0 claim row names any of these files.
- **Cold files:** `coauthor-status-write.ts`, `coauthor-audit.ts`, `ectd-documents.ts`, `ingestion-service.ts`, `coauthorPutStatus.test.ts`, `ectdCoauthorFinalizedRefusal.test.tsx`, `ectdCoauthorNoFixtures.test.tsx`, `check-lineage-save-gate.mjs`.
- **Recommended hand-on update for board item 5:**
  - Add EctdCoauthor.tsx's holder (…01PwLFr8, until 2026-09-29T11:44:44Z).
  - Fold P11-B-3 into item 5, since it needs the same two files and the reason field must not appear on read-only rows.
  - Record the FK ON DELETE NO ACTION hazard. Once ordinary saves write version rows, DELETE of an edited co-author document becomes a 500 unless handled in the same change. It is already latent for documents with a batch-draft accept.
  - Record that the retake path (coauthor-snapshot.ts:450-476) keeps only sha256 hashes of co-author edits it replaces.
- **Earliest the whole P11-B-1 + P11-B-3 change can land without editing inside another session's window:** 2026-09-29T11:44:44Z. Alternatively …01KiDof7 lands the server half now and discloses the adjacent client hunk.
- **P11-B-2:** hand on to …01KiDof7. It built GE-P-3 (`callerDocumentAccess`/`readDocumentAccess`), and the fix is an `edit` entry plus a per-section flag on that same mechanism. The DocumentWorkbench.tsx half also needs …01PwLFr8's window (11:53:54Z) to pass, or a disclosed additive edit.
- Scratch directory created: <scratch>/triage/ (board0.txt only).
