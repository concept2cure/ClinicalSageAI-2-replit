## Gap: editor-part11 — governed actions in the Authoring editor core

Scope per harness: `DocumentWorkbench.tsx`, `RichSectionEditor.tsx`, `FileToVaultDialog.tsx`, `ProjectFilesPanel.tsx`, `ReviewTasksPanel.tsx`, `DocumentCanvas.tsx`, `AssignReviewDialog.tsx`, traced into `server/routes/authoring.router.ts` and what it calls. Head: `concept2cure-v2` @ `232ecae9c`. Read-only throughout; no write-baseline gate run; no repo files edited.

Three confirmed, reproducible, previously-unreported defects, most severe first.

### GE-P-1 — blocker — Revert's audit-trail write is not atomic with the mutation it records

`server/routes/authoring.router.ts:2102-2236` (client: `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:2234-2273`).

`POST /sections/:sectionId/revert` runs the content UPDATE, the `doc_revisions` ledger entry and `commitSectionToFiling` in one transaction (`BEGIN` :2154, `COMMIT` :2207, `client.release()` :2212). The Part 11 audit-trail write for that same act — `createAuditTrail(req, docId, sectionId, 'REVERT', ..., metadata)` at :2215-2224 — is called with only 8 arguments, so its `executor` parameter defaults to the bare `pool`, and it runs *after* the transaction has already committed and the client released. Every sibling governed handler in this file does the opposite deliberately: the section-content PATCH passes `client` (:1927-1937), freeze passes `client` and mirrors into the hash chain (:3865-3877, :3892-3901), and e-sign does the same (:4026-4033, :4094-4103).

The consequence follows directly from `writeAuthoringAuditTrail`'s own documented policy (`server/services/authoring/authoring-evidence.ts:237-249`):
- In production, a failure on the standalone (`executor === pool`) path throws `"Audit logging failed - operation aborted for compliance"` — but the revert already committed, so the 500 the author sees is a lie: the record changed, the client says it didn't.
- Outside production, the same failure path returns without throwing, so the route reaches `res.json` and reports success while `authoring_audit_trail`/`audit_logs` carries **no row at all** for that revert — the exact "governed action that looks fine and simply never wrote its ledger entry" this lens exists to catch.

No test anywhere under `server/routes/__tests__/*.test.ts` exercises revert's audit-trail behavior (grepped for `/revert`; none found), so nothing currently pins this either way.

**Fix**: pass the transaction's `client` (not `pool`) into `createAuditTrail` for the revert handler, move the call inside the existing `BEGIN`/`COMMIT` block, and add `writeChainedAuditRow` parity with freeze/e-sign. Add a pglite test that injects an audit-write failure and asserts the whole revert rolls back.

### GE-P-2 — high — The frozen-document notice promises a "new version" capability that does not exist

`client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3747-3754`.

The moment a document is FROZEN/APPROVED, the workbench tells the author: *"This document is frozen... Create a new version to make further changes."* No button accompanies this, and no route/service/dialog anywhere in the authoring store originates a new document from a prior one's content or records a supersession link. The only creation paths are `POST /docs` (blank) and `POST /docs/from-draft`; `POST /docs/:docId/apply-template` (:4703-4880) applies a bare template onto an *existing, unfrozen* document, not a prior document's content onto a new one. `AuthoringCreateExport.tsx`'s "New document" dialog only optionally attaches a `template_id` (:139) — no "start from this document" option, no lineage back to the sealed original. The one remedy the product offers at the exact point a Part 11 seal blocks editing is not a remedy the product has.

**Fix**: build the missing capability (clone-into-new-draft with a recorded supersession pointer, audited like every other governed act), or change the copy to stop promising it.

### GE-P-3 — medium (gap) — Freeze / E-sign / Assign review / File to vault are shown to every user regardless of their actual document permission

`client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx:236-242`; `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3380-3391,4685`; `client/src/concept2cure/v2/editor/ReviewTasksPanel.tsx:379-381`; `client/src/concept2cure/v2/editor/DocumentCanvas.tsx:348-353`.

The server enforces real, independent permission gates the client never consults:
- `server/middleware/authoringObjectAuthorization.ts:246-283` classifies freeze/e-sign as action `'approve'` and requires an `OWNER`/`APPROVER` row in `doc_permissions` (`server/services/authoring/authoring-permissions.ts:79-85,210-236`) — refusing any tenant member without that grant with 403 `AUTHORING_OBJECT_FORBIDDEN`.
- `server/routes/taskManagement.routes.ts:181` gates review-task creation behind `requireEditorAccess`, refusing a viewer-tier org role.

Neither is exposed to the client: `GET /api/authoring/docs/:docId` (`server/routes/authoring.router.ts:1498-1541`) returns no permission/role field at all, and nothing in `DocumentWorkbench.tsx` references a matched role or permission. So Freeze, E-sign, Assign review and File to vault render identically for the document's owner and for a colleague with no grant on it at all — a user fills in the whole governed dialog (freeze reason, assign-review form, e-sign password) before learning, via a 403, that they cannot do this. This is the skill's Rule 6 anti-pattern ("never show a governed action as clickable when the user cannot perform it"); the eventual refusal message is honest and specific, so this is a UI visibility gap over a real, enforced server control, not a missing one.

**Fix**: expose the caller's resolved document permission from `GET /docs/:docId` (or a companion endpoint) and disable these four actions client-side with a tooltip naming the missing role/grant.

## What was checked and found already fixed / not a finding

- The `router.use('/sections/:sectionId', ...)` DOCUMENT_FROZEN gate (`authoring.router.ts:413-463`) does prefix-match onto `/sections/:id/revert`, `/comment`, etc. — revert on a frozen document is correctly refused; not a gap.
- Freeze (`:3707-3921`) itself: reason enforced at ≥8 chars, unresolved-comments/tracked-changes refusal with explicit acknowledgement, atomic snapshot+status+audit+chained-row transaction — solid.
- E-sign (`:3923-4122`): `assertSigningAuthority` (role check) before credential re-verification (no password-oracle), printed name from `resolveSignerName`, signature bound to the frozen snapshot's hash, atomic with the APPROVER auto-freeze — solid.
- `AuthoringSignatures.tsx` (§11.50 manifestation rail): shows printed name (explicitly not falling back to email), meaning, executed timestamp, method, covered frozen version and content hash — solid, already fixed per its own header note.
- `FileToVaultDialog.tsx` / `authoring-file-to-vault.ts`: one governed, atomic export+ingest+file+audit action with a real vault record shown back, compensating rollback on partial failure — solid.
- `AssignReviewDialog.tsx` / `ReviewTasksPanel.tsx`: honest read/failure states throughout, server-issued task id never fabricated, completion correctly deferred to the Task board's own §11.50 ceremony (428 `ESIGN_REQUIRED` handled explicitly, never reported as a generic error) — solid.
- `DocumentCanvas.tsx`: thin host mounting the same `DocumentWorkbench`/dialogs, no independent governed logic — no separate finding warranted.
- Reason-for-change funnel (`DocumentWorkbench.tsx:1976-2129`, `authoring.router.ts:1806-1813`): the ≥8-char floor is enforced both client-side (Save button `disabled`) and server-side (`requireGovernedReason`), and every save path (button, ⌘S) routes through the one funnel — this is Q3 from 2026-09-24, confirmed still fixed, not re-reported.
- Metadata-only saves (rename/track-changes toggle) correctly write their own un-reasoned audit row (`RENAME`/`TRACK_CHANGES`) describing the mechanism, not a fabricated human reason — consistent with the repo's established "a mechanism describing itself is not a person being impersonated" convention (also used correctly by revert's own *reason* text, which is fine — only its *audit-write plumbing*, GE-P-1, is broken).

---

**Covered.** Read line-by-line, for every governed-action call site (save, revert, reorder, AI-draft-accept, tracked-change decision, comment/reply/resolve, rename, freeze, e-sign, file-to-vault, assign-review) and its surrounding context: client/src/concept2cure/v2/editor/DocumentWorkbench.tsx (all governed handlers ~850-880, 1970-2130, 2233-2273, 2340-2534, 2536-2760, 3372-3406, 3740-3770, 4220-4320, 4664-4690, 5010-5020) and RichSectionEditor.tsx (reason-for-change funnel and save contract, ~1-330, 1130-1300) via targeted reads plus full-text grep for every apiRequest/mutation/reason/frozen/revert site. Read in full: FileToVaultDialog.tsx, AssignReviewDialog.tsx, ProjectFilesPanel.tsx, ReviewTasksPanel.tsx, DocumentCanvas.tsx. Traced each into its server route: server/routes/authoring.router.ts (section PATCH ~1647-1990, revert ~2102-2236, freeze ~3707-3920, e-sign ~3923-4122, file-to-vault ~5144-5205, submit ~5211-5344, GET /docs/:docId and /sections ~1498-1600, the section-write-gate middleware ~205-463, template/guidance role gates ~1141-1250), server/middleware/authoringObjectAuthorization.ts (full), server/services/authoring/authoring-permissions.ts (full), server/services/authoring/authoring-evidence.ts (writeAuthoringAuditTrail/writeAuditIndexOrChain), server/services/authoring/authoring-file-to-vault.ts (audit/reason handling), server/services/part11/signing-authority.ts (full), client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx (full) and AuthoringSignatures.tsx (full, the §11.50 manifestation), and server/routes/taskManagement.routes.ts (role-gate grep). Cross-checked docs/evidence/reviews/2026-09-24, -26, -28 (incl. ectd-lane-second-pass) so nothing already open (Q1-Q6, Q-0928-1..3) is re-reported. Confirmed several plausible leads were actually already-fixed/non-issues before discarding them (e.g., the `router.use('/sections/:sectionId', …)` DOCUMENT_FROZEN gate does prefix-match onto /revert; freeze/e-sign/edit ARE object-permission-gated via authoringObjectAuthorization + doc_permissions, contradicting an initial read of authoring.router.ts alone).

**Not covered.** Did not read DocumentWorkbench.tsx (~5,100 lines) or RichSectionEditor.tsx (~2,700 lines) literally line-by-line cover-to-cover — large stretches of pure JSX layout, the AnA chat-panel wiring, and RichSectionEditor's ProseMirror schema/extension configuration were not read verbatim, only the governed-action paths and their immediate context. Skimmed rather than fully read: AuthoringPlaceIntoFiling.tsx, AuthoringCollab.tsx, AuthoringAiDraft.tsx, AuthoringExports.tsx, AuthoringCreateExport.tsx, AuthoringRevisionDiff.tsx (enough to confirm/refute specific claims, e.g. that "New document" has no start-from-existing-document option). Did not read PATCH /comments/:commentId or POST /api/tasks/tasks in full (only confirmed their role gates/attribution pattern via targeted reads and grep). No AnA/chat-tool path for these specific actions was traced (that lane was covered by the 2026-09-28 report). Did not run any test suite or the reference Postgres — findings here are structural/control-flow defects confirmed by reading both the client call and the exact server handler, not data-shape questions, so no BEGIN…ROLLBACK session was needed. No browser/AT pass.

## Independent verification

Each finding went to three agents, each told to refute it through one lens: reachability, reproduction or intent. A finding is confirmed when two of the three could not. Low findings had one reproduction verifier.

### GE-P-1 — **confirmed** (3 of 3)

- **reach** — real: I could not refute it on reachability. The code is live, nothing blocks the path, and no other layer makes the audit write atomic. The reported severity is overstated, though.

Reachable in production:
- server/bootstrap/register-inline-routes.ts:316-317 mounts server/routes/authoring.router.ts at /api/authoring. It sits behind authoringObjectAuthorization (:311), which lets an authorized editor through.
- The UI calls it. DocumentWorkbench.tsx:4278-4285 renders a Revert button on every History-rail revision (disabled only when docSealed), and revert() at :2234-2270 POSTs /api/authoring/sections/:id/revert. No feature flag gates it.
- The code is identical at 232ecae9c and at the current HEAD 494b4fc14 (git diff on the three files is empty).

Defect confirmed at head:
- authoring.router.ts:2154-2213: the section UPDATE, enforceAuthorLineage, createRevision(... client, 'revert') and commitSectionToFiling run inside BEGIN/COMMIT, and then client.release().
- createAuditTrail(req, docId, sectionId, 'REVERT', ...) at :2215-2224 runs after COMMIT with 8 arguments, so executor takes its default, pool (:659-671).
- The siblings enlist their client: the content PATCH at :1927 and :1975, freeze at :3865, e-sign at :4026.
- On the pool path, writeAuthoringAuditTrail (authoring-evidence.ts:237-249) throws "Audit logging failed - operation aborted for compliance" in production after the mutation has already committed. The client then shows "Couldn't revert" (DocumentWorkbench.tsx:2246-2250) although the content, the doc_revisions row and the filing all changed. Outside production the same failure is swallowed and the route returns success.

No other layer prevents it:
- The local DB has no audit trigger on authoring_sections. The only triggers are the append-only ones on doc_revisions.
- authoring_audit_trail has only a PK constraint, so the insert is a separate commit.
- GET /docs/:docId/audit (:5757) reads only authoring_audit_trail, so the Audit rail would be missing the REVERT row.
- Earlier reviews do not record it. Grep of 2026-09-24/26/28 finds only Q6/P6, which is the unrelated "revert not disabled on a sealed doc".

Why the severity is lower than blocker:
1. A user cannot trigger it on demand. The failure needs the post-commit INSERT to fail: a pool-checkout timeout, a lost connection, or a DB error between two separate connections. I found no deterministic cause:
   - auditContextFromRequest only calls getTenantId/getActorId, which already succeeded earlier in the handler.
   - authoring_audit_trail has forced RLS, but poolInstrumentation.ts:145-205 applies the async-local tenant scope to pool.query as well, so RLS does not reject it.
   - The audit_logs index write (recordAuditRow) does not throw.
2. The act is not left without any record. Inside the transaction, doc_revisions gets origin='revert' with created_by = the verified principal. For a document bound to a filing, commitSectionToFiling sets app.actor_id and app.reason='Reverted to revision X', and c2c_document_section_versions snapshots it.

What is lost is the authoring_audit_trail row: the before/after content and hashes and the Audit-rail entry. On failure the operator is also told the revert did not happen when it did.

I did not run the app or inject a fault. The claim rests on reading the code plus checking the schema and triggers in c2c_full (read-only, no data written).

- **repro** — real: Head is 494b4fc14. `git diff 232ecae9c HEAD` is empty for server/routes/authoring.router.ts and server/services/authoring/authoring-evidence.ts, so the line numbers in the finding still hold.

**Code trace**
- POST /sections/:sectionId/revert opens `client` and runs BEGIN (:2154). Inside that transaction it runs the section UPDATE, `enforceAuthorLineage`, `createRevision(..., client, 'revert')` and `commitSectionToFiling({client,...})`, then COMMIT (:2207) and `client.release()` (:2212).
- Only after that, at :2215-2224, does it call `createAuditTrail(req, docId, sectionId, 'REVERT', before, after, reason, metadata)`. That is 8 arguments, so `executor` falls back to its default `pool` (declared at :671).
- In `writeAuthoringAuditTrail`'s catch (authoring-evidence.ts:237-249), `executor === ctx.pool`, so it does not rethrow. In production it throws 'Audit logging failed - operation aborted for compliance'. Outside production it logs and returns.
- The sibling handlers pass `client` instead: PATCH at :1927, freeze at :3865 and e-sign at :4026.

**Reproduction**
I wrote a scratch vitest outside the repo (scratchpad/repro/revert-audit.test.ts plus its own config). It uses the same mocks as server/routes/__tests__/authoring-atomic-mutations.test.ts, with a real HS256 JWT and the real router. The pool is made to throw on `INSERT INTO authoring_audit_trail`. Query order observed in both runs:

client: BEGIN → UPDATE authoring_sections → SELECT chain_sha256 → SELECT citations → INSERT INTO doc_revisions → COMMIT; then pool: INSERT INTO authoring_audit_trail (throws).

| NODE_ENV | HTTP response | What actually happened |
|---|---|---|
| production | 500 `{"error":"INTERNAL_ERROR","message":"Something went wrong while saving revert..."}` | The content, revision and filing changes had already committed. The operator is told the revert failed when it happened. |
| test | 200 `{"success":true,...,"message":"Section reverted to revision R1"}` | The audit insert failed and the route still reported success, so authoring_audit_trail has no REVERT row for this act. |

**Not reported before.** I grepped docs/evidence/reviews/2026-09-24, -26 and -28. The only revert items are Q6 (Revert not disabled on a sealed document, fixed) and unrelated vault and eCTD notes. No test in server/routes/__tests__ exercises the revert handler's audit write.

**Covered:** the revert handler and its audit path in both NODE_ENV branches, via mocked pool and client. **Not covered:** a run against the real Postgres, since the failure is at the connection level and a mock is the faithful way to inject it; and whether the standalone `recordAuditRow` index entry reaches the hash chain for revert.

- **intent** — real: I tried to refute this and could not. The code matches the finding, and the post-commit placement is not a documented, deliberate choice for revert. It goes against the handler's own stated rule, the enlisted-transaction policy in the audit writer, Part 11 §11.10(e), and CLAUDE.md "fail closed".

Checked at HEAD 494b4fc14 on concept2cure-v2 (two commits after 232ecae9c; neither touches this site):

1. **The audit write runs after the transaction, on the pool.** In server/routes/authoring.router.ts, revert BEGINs at :2157. The section UPDATE, enforceAuthorLineage, createRevision(..., client, 'revert') and commitSectionToFiling({client,...}) all run inside that transaction, which COMMITs at :2207 and releases the client at :2212. Only after that does createAuditTrail(...) run at :2215-2224, with 8 arguments. So `executor` takes its default `pool` (signature at :659-672).

2. **On that path a failure is either a false error or silently dropped.** writeAuthoringAuditTrail (server/services/authoring/authoring-evidence.ts:237-249) only rethrows when `executor !== ctx.pool`.
   - In production it throws 'Audit logging failed - operation aborted for compliance'. Nothing is aborted: the content, the revision ledger entry and the filing copy are already committed. The route returns 500 through serverError while the change stands.
   - Outside production it returns quietly and the route answers success with no authoring_audit_trail row.
   - Also, on the pool path writeAuditIndexOrChain (:139-160) writes the audit_logs index via recordAuditRow rather than the enlisted writeChainedAuditRow, so revert never gets the in-transaction chained entry that other transactional acts get.

3. **Intent check: nothing marks this as deliberate for revert.**
   - The revert block comment (:2146-2153) says "Content, its lineage and its ledger entry commit together or not at all — the identical rule the interactive save … follow[s]".
   - The interactive save it cites puts its audit row on `client` before COMMIT (:1923-1937, with the comment "In production createAuditTrail throws on failure, which rolls the whole edit back rather than committing an un-audited change"). So does the metadata branch (:1975-1985), and so do freeze and e-sign.
   - The commitSectionToFiling comment in the revert handler even assumes "the audit trail recorded a REVERT".
   - The "best-effort standalone" policy at authoring-evidence.ts:240-244 is written for audits that cannot enlist ("so an audit-log outage cannot break an otherwise-valid action"). Revert already has a client open at that point, so the policy does not describe a choice for this handler.
   - The only explicit post-commit rationale in the file belongs to AI-draft accept (:3341-3344): "non-fatal … failing here would report failure for a change that succeeded". Revert produces exactly that outcome in production, and that comment's premise is itself wrong, since the pool path throws in production.
   - Code history: the transactional revert block, including the audit call, arrived through merge 2867e5d2e (2026-09-05) and has no commit note keeping the audit outside the transaction.
   - There is no CI baseline exempting revert.

4. **Not a duplicate, and not tested.** grep over docs/evidence/reviews/2026-09-24, -26 and -28 finds only P6/Q6 (Revert button not disabled on a sealed document, since fixed), not this atomicity defect. No test under server/**/__tests__ exercises POST /sections/:id/revert or its audit write.

Severity: I rate it high rather than blocker. It needs the audit insert to fail after COMMIT (connection drop, constraint or tenant-context error). When that happens the result is either a governed content change with no Part 11 audit record, or a 500 telling the user the action was aborted when it was not.

Related, same pattern, not re-rated here: AI-draft accept at :3345-3368 also writes createRevision and createAuditTrail on the pool after its commit.

What I covered: the revert handler (:2102-2236), the createAuditTrail wrapper (:640-700), writeAuthoringAuditTrail and writeAuditIndexOrChain (authoring-evidence.ts:100-250), the sibling call sites (:1923-1990, :3340-3368, :4145-4170), the three prior review directories, git history at the site, and the test tree.

What I did not do: I did not run the pglite or reference-Postgres reproduction (the task was read-only). I did not audit the other pool-path createAuditTrail callers besides AI-draft accept and VIEW_FROZEN, and I did not read the client revert() in DocumentWorkbench.tsx beyond what the finding cites.

### GE-P-2 — **confirmed** (3 of 3)

- **reach** — real: Checked at head 494b4fc14 (the task named 232ecae9c; the cited lines are unchanged at head). The finding holds up against the reachability lens.

Reachable in production:
- DocumentWorkbench is the launch-catalog Authoring editor. It is mounted through surfaces/DocumentAuthoring.tsx, which is registered lazily in client/src/concept2cure/v2/surfaceViews.ts:302.
- `docSealed` (DocumentWorkbench.tsx:869-870) is true when the status is FROZEN or APPROVED. When it is true, :3747-3754 unconditionally renders "... Create a new version to make further changes." No button or link sits next to it.
- A user reaches FROZEN through AuthoringFilingBar.tsx:173 (POST /docs/:docId/freeze, authoring.router.ts:3708). A user reaches APPROVED through the sign and approve paths (authoring.router.ts:5398, 5474).

No other layer supplies the capability or stops the dead end:
- The only document-creation routes are POST /docs (authoring.router.ts:1399) and POST /docs/from-draft (:1457), plus apply-template (:4704), which works on an existing document.
- createDocument's input (authoring-documents.ts:430-437) accepts only title, module, product_code, locale, template_id and client_program_id. It has no source-document or supersedes field.
- The router has no PATCH, PUT or status route that takes a document out of FROZEN or APPROVED. Every status write I found only moves a document to IN_REVIEW or APPROVED (:3860, 4038, 5278, 5398, 5474).
- The client has no duplicate, clone or new-version action anywhere under v2/editor or the Authoring surfaces. The only "Start from" option is a template picker (AuthoringCreateExport.tsx:114).
- The server sends the same false remedy in the 403 DOCUMENT_FROZEN body: document-lock.ts:68-73 (FROZEN_MESSAGE), which the section middleware returns at authoring.router.ts:443-447. So both the UI and the API tell a locked-out author to use a workflow that does not exist.

It is new. The 09-22, 09-24 and 09-28 part11-ux reviews record only Q6, the Revert button not being disabled on a sealed document, now fixed. None of them records this.

Severity is overstated. The seal itself holds: canEditSection and the middleware refuse edits, and no data is corrupted and no record is falsified. The defect is a false statement about a remedy at a Part 11 lock point. The author follows an instruction the product cannot carry out, and any workaround ("New document" and retyping) leaves no lineage link to the sealed predecessor.

- **repro** — real: Reproduced statically at the current head (494b4fc14; the task named 232ecae9c, and the code involved is the same). Every step below is read-only.

1) The claimed copy exists. client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3747-3754 renders, when `docSealed` is true, either "This document has been approved and frozen..." (APPROVED) or "This document is frozen. Its content is sealed under a content hash and cannot be edited." Both are followed by "Create a new version to make further changes." There is no button, link or handler next to it.

2) The server makes the same claim, which the auditor missed. server/services/authoring/document-lock.ts:68-73 `FROZEN_MESSAGE` ends both variants with "Create a new version to make further changes." It is returned as `reason` by `checkDocumentWritable` (:113) and `checkSectionWritable` (:150). The section guard in server/routes/authoring.router.ts:443-448 sends it as the `message` of 403 DOCUMENT_FROZEN on every PATCH/POST/DELETE under /sections/:sectionId. The editor shows that message on a refused save (DocumentWorkbench.tsx:2046). The comment at authoring.router.ts:426 cites "create a new version" as the correct remedy.

3) No such capability exists.
- Every authoring POST route (authoring.router.ts: /docs 1399, /docs/from-draft 1457, /sections 1607, /docs/:docId/freeze 3708, /e-sign 3924, /send-to-packager 4207, /refresh-all 4631, /apply-template 4704, /export 4994, /file-to-vault 5153, /submit 5212, /sign 5542, /sections/reorder 6171, /images 6303, /import/docx 6452) either creates a blank or template document, creates one from a supplied AnA draft, or acts on an existing document. None originates a document from another authoring document.
- `createDocument` (server/services/authoring/authoring-documents.ts:470-471) reads only title, module, product_code, locale, template_id and client_program_id. It has no source-document or predecessor input.
- In the reference database, `\d authoring_documents` (c2c_full) has a free-text `version` column and no parent, supersedes or source-document column, so the schema cannot even record lineage.
- Nothing moves a document out of the sealed state. The only status writes are FROZEN (:3860), APPROVED (:4038, :5398) and IN_REVIEW (:5278, which applies only to an editable document).
- A grep of client/src/concept2cure/v2 and client/src/concept2cure/quality for new version / supersede / clone / duplicate / copy-from / fromDocument finds nothing except this notice.
- The nearest look-alike is POST /documents/:id/save-as-template in server/routes/protocol-templates.ts:94. It works on the separate protocol-document store (integer ids), not authoring_documents (uuid), so it is no path either.
- The AnA "new version" tools (document-surface-tool-defs.ts:171, document-spine.ts:385, governed-write-tools.ts:60) act on vault documents and concept2cure_artifacts, not on authoring documents.

Result: an author who opens, or tries to save into, a frozen or approved authoring document is told twice (banner and 403 message) to use a capability that no route, service, dialog or schema column provides. The only real path is a fresh New document, which has no recorded link to the sealed original.

Not previously reported: a grep of docs/evidence/reviews/2026-09-2{4,6,8}/ for "new version", FROZEN_MESSAGE and document-lock finds only the unrelated note at 2026-09-24/lenses.md:178.

Coverage: I read the notice, the lock helper, the section guard, the createDocument inputs, the full list of authoring router POST routes, the protocol-templates save-as-template route, the authoring_documents schema, and the client v2 and quality trees. I did not execute the UI in a browser and did not write to the database. Rendering is unconditional on `docSealed`, and the 403 is deterministic from `LOCKED_DOCUMENT_STATUSES`, so a browser run would add nothing. I did not audit non-catalog surfaces for a hidden clone path beyond the greps above.

- **intent** — real: I tried to refute this as a deliberate design decision and could not.

**The sentence is at the reported line.** It is at client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3753 at both 232ecae9c and the current HEAD 494b4fc14. It came in with c402dbb6b (2026-09-21, "WN: the canvas that expands into the full editor…").

**The server makes the same promise.** FROZEN_MESSAGE at server/services/authoring/document-lock.ts:68-73 appends "Create a new version to make further changes." to both the FROZEN and the APPROVED refusal. The router sends that text as `message` in the 403 DOCUMENT_FROZEN responses at server/routes/authoring.router.ts:444-448, 4785, 5966 and 6058. The comment at authoring.router.ts:426 names "this content is signed; create a new version" as the right remedy for a sealed record, and contrasts it with "ask an administrator". So the authors thought the remedy existed. Nothing I read (the document-lock.ts header at :1-55, the router comment, or the commit history) records it as deferred, planned, or intentionally absent.

**No path creates a new version from a sealed document:**
- The only document-creating routes in authoring.router.ts are POST /docs (:1399) and POST /docs/from-draft (:1457). POST /docs/:docId/apply-template (:4704) refuses a frozen document (:4785).
- CreateDocumentInput (server/services/authoring/authoring-documents.ts:430-437) takes only title, module, product_code, locale, template_id and client_program_id. It has no source-document or predecessor field.
- authoring_documents has a `version` column (checked on the local c2c_full) but no supersedes or predecessor column. No server code increments authoring_documents.version: the grep hits for `version = version + 1` are in other stores (module3, AnaToolExecutor, artifactVersionStore, protocol_documents).
- The only create action on the client is newDocumentAction (DocumentWorkbench.tsx:67, 2972, 3540), which opens a blank document.

**Vault versioning does not cover it.** POST /docs/:docId/file-to-vault (:5153) files a rendered PDF or DOCX. Nothing brings a new editable version back into Authoring, and it records no lineage to the sealed predecessor.

**Other surfaces show the promise is normally backed.** Where the codebase makes the same promise, a button implements it. RbmSurfacesA.tsx:370/422 has "Amend — new version", which creates a new draft version and leaves the approved one as the historical record. The protocol-consent and protocol-development services also back their "create a new version to edit" messages with real versioning. Authoring is the exception.

**Not a repeat.** No open finding in docs/evidence/reviews/2026-09-24, 09-26 or 09-28 covers this. The only "supersede" hits there are about e-signature supersession (DP-03) and the QMS transition (`superseded_by_id`).

**Conclusion.** This breaks the CLAUDE.md "never fabricate" rule: the UI and the API both tell the user to do something the system cannot do, at the exact moment a Part 11 seal blocks the edit. The only workaround is a blank new document, which has no recorded relationship to the sealed original.

**Coverage.**
- Checked: the notice site and its history, document-lock.ts, every POST/PATCH route in authoring.router.ts by grep, CreateDocumentInput, the authoring_documents columns on the local DB, the client editor and v2 surfaces for new-version, clone or duplicate affordances, and the prior review folders.
- Not checked: legacy (non-v2) client code, and AnA tools that might write authoring_documents. My grep found no INSERT into authoring_documents outside authoring-documents.ts:337, so such a tool is unlikely.
- Nothing was executed against the database beyond a read of information_schema.

### GE-P-3 — **confirmed** (3 of 3)

- **reach** — real: I tried to show this was unreachable or already prevented, and could not. Checked read-only at HEAD 494b4fc14 (the task named 232ecae9c; the files involved match the finding as described).

What makes it reachable:
1. The route is mounted and has no flag. authoringObjectAuthorization is registered in server/bootstrap/register-inline-routes.ts. Its own doc comment says it "is deliberately not feature-flagged". It skips every GET/HEAD/OPTIONS (server/middleware/authoringObjectAuthorization.ts:15, 222). actionFromPath (:35) maps freeze, sign and e-sign to 'approve'. Under ROLE_ACTIONS (server/services/authoring/authoring-permissions.ts:79-85), only OWNER and APPROVER are allowed 'approve'. Global ADMIN, SUPER_ADMIN and PLATFORM_ADMIN are also allowed. Everyone else gets 403 AUTHORING_OBJECT_FORBIDDEN (:276-283).
2. Any tenant member can reach the document. The list, GET /api/authoring/docs (authoring.router.ts:1271), filters only on `WHERE d.tenant_id = $1`, not on doc_permissions. GET /docs/:docId (:1497-1541) is scoped by tenant and not by grant, and it returns no role, permission or matchedRoles field. So a member with no grant, or only a VIEWER, REVIEWER or AUTHOR grant, can list and open any document in their org.
3. The surface is live in the launch catalog. DocumentWorkbench is mounted by DocumentAuthoring.tsx:98 and DocumentCanvas.tsx:386. It renders AuthoringFilingBar whenever activeDoc is set (DocumentWorkbench.tsx:3379-3390), and the workbench has no role or permission reference anywhere.
4. Nothing on the client stops the click. AuthoringFilingBar.tsx:236-239 disables Freeze only when the document is frozen. E-sign (:240-242) is never disabled. So a non-approver can type a reason of at least 8 characters, or pass the EsignModal password (and code) check, before the POST to /freeze or /e-sign (:141) returns 403. No other layer blocks this.

Not previously reported: I grepped 2026-09-24, -26 and -28 for AuthoringFilingBar, approver, doc_permissions and visibility and found no match. The closest earlier item is 09-24 part11-ux Q6: Revert was not disabled on a sealed document. It was graded "Affordance gap only" and fixed in 896e96fb. This is the same kind of issue.

Why severity is low: the server enforces every one of these permissions correctly, and the refusal message is honest. No record is changed, no signature is forged, and attribution is unaffected. The cost is wasted input and a re-authentication before the user learns they are not allowed.

Coverage: I confirmed Freeze and E-sign end to end. I did not re-check the 'Assign review' requireEditorAccess path (taskManagement.routes.ts:181), the gate on 'File to vault', or whether the EsignModal password pre-check counts toward lockout attempts. I did not run anything against Postgres.

Separate possible issue, not verified: actionFromPath classifies every /e-sign as 'approve' whatever the meaning. That suggests a user with only a REVIEWER grant is refused even a 'review'-meaning signature, which AUTHORING_MEANINGS offers and which is the dialog's default meaning. This needs its own check.

- **repro** — real: Reproduced at HEAD 494b4fc14. The task named 232ecae9c; the cited lines are unchanged at head.

Method: a scratch vitest file in the session scratchpad (no repository file edited) drove the real `authoringObjectAuthorization` middleware and the real `decideAuthoringPermission`. Its `getPool` was pointed at a pg client on c2c_full inside BEGIN ... ROLLBACK. Seeded rows:
- a draft doc created by `creator-A`. The live trigger `authoring_document_seed_permissions` granted OWNER+AUTHOR.
- a REVIEWER grant for `reviewer-B`.
- no grant for `nogrant-C`.
- a second doc with status FROZEN, created by `creator-A`.

After the run authoring_documents and doc_permissions still hold 0 rows, so nothing was left behind.

Middleware output:
- GET /authoring/docs/doc1 as reviewer-B -> next(). As nogrant-C -> next(). Any tenant member can open the document, because GET is in SAFE_METHODS (authoringObjectAuthorization.ts:15,222).
- POST .../freeze as reviewer-B -> 403 AUTHORING_OBJECT_FORBIDDEN. Same for nogrant-C.
- POST .../e-sign as reviewer-B -> 403 AUTHORING_OBJECT_FORBIDDEN. This is also true when the requested meaning is "review", because actionFromPath (:35) classifies every e-sign as 'approve' and REVIEWER lacks 'approve' (authoring-permissions.ts:79-85).
- POST .../file-to-vault as reviewer-B -> 403. The path falls through to 'edit'.
- POST .../freeze and .../file-to-vault as creator-A -> next().

Client side:
- GET /api/authoring/docs/:docId (authoring.router.ts:1498-1541) selects only document columns plus provenance. It returns no role, grant or matchedRoles.
- The only permission reader is GET /api/authoring/docs/:docId/permissions (server/routes/authoring-permissions.ts:123), and no client file calls it.
- DocumentWorkbench.tsx:3379-3391 mounts AuthoringFilingBar for any activeDoc.
- AuthoringFilingBar.tsx:236-242: Freeze is disabled only when frozen; E-sign is never disabled, and its dialog defaults to meaning "review" (:257).
- DocumentCanvas.tsx:348 `dc-file-to-vault` and :351 `dc-assign-review` are disabled only on state !== 'ready'.
- ReviewTasksPanel.tsx:379 `rt-assign` has no gate.

User-visible sequence for a reviewer-only or no-grant member:
1. Opens the document, clicks E-sign, and picks "review".
2. Enters their password, which EsignModal.tsx:302 checks with the server (plus MFA at :318).
3. Only then gets the 403 from postAuthoringSignature.

Freeze behaves the same way: the reason is filled in first, then the 403 arrives as a toast (AuthoringFilingBar.tsx:210-215).

The refusal text is honest and the control is enforced, so this is an affordance gap, not an authorization hole. Assign review (requireEditorAccess, taskManagement.routes.ts:180) was checked only by reading the code, not run.

Not a duplicate: grep of docs/evidence/reviews/2026-09-2{4,6,8} finds no record of it. The nearest item is 09-24 Q6 (Revert on a sealed document), which is fixed.

Severity: I would rate it low-medium rather than medium. No wrong record, no bypass, and the message is honest; the cost is wasted governed input and a re-authentication before the refusal.

Separate, more serious defect found while reproducing (not previously reported in reviews 09-22 to 09-28): POST /authoring/docs/<FROZEN doc>/file-to-vault as the OWNER returns 409 AUTHORING_DOCUMENT_IMMUTABLE "Document status FROZEN does not permit this action." The cause:
- actionFromPath (authoringObjectAuthorization.ts:30-41) classifies file-to-vault as 'edit'.
- documentStatusAllowsAction (authoring-permissions.ts:121-129) refuses 'edit' on FROZEN/APPROVED.

So the sealed filing path is unreachable in production for everyone who is not a global admin. That path is what authoring-file-to-vault.ts:338-389 and FileToVaultDialog.tsx:166,216 exist to deliver ("the export is taken from the sealed content and its hash"). The integration test authoringFileToVault.pglite.integration.test.ts does not catch it: makeApp (_authoring-canvas-fixture.ts:138-153) mounts the router without this middleware, and the test never files a sealed doc.

Coverage:
- Covered: the four named controls, the middleware and permission service run against the live DB, the GET doc payload, the client mounts, and prior review files.
- Not covered: the Assign-review 403 was not run against requireEditorAccess (code-read only). No browser run. Other authoring buttons (section edit, comment, AuthoringPlaceIntoFiling) were not checked for the same gap.

- **intent** — real: I could not refute this finding. It breaks the repository's own written rules, and nothing at the site marks it as a deliberate design choice. I checked at HEAD 494b4fc14.

1) Client. In client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx:236-242, Freeze is disabled only when the document is frozen, and E-sign is never disabled. There is no permission prop, and the long header comment (lines 1-28) never says the client leaves permission checks to the server on purpose. DocumentWorkbench.tsx:3379-3391 mounts the bar for any activeDoc. The other entry points check only the load state: DocumentCanvas.tsx:348-353 (dc-file-to-vault, dc-assign-review, both `disabled={state !== 'ready'}`) and ReviewTasksPanel.tsx:379 (rt-assign, never disabled). A grep of DocumentWorkbench, AuthoringFilingBar, ReviewTasksPanel and DocumentCanvas finds no permissions, matchedRoles or docRole anywhere.

2) Server. The server does enforce permissions, and the client has no way to learn them in advance:
- authoringObjectAuthorization.ts:35 classifies freeze and e-sign as 'approve'. The 'deliberately not feature-flagged' mount returns 403 AUTHORING_OBJECT_FORBIDDEN at :275-282.
- Under authoring-permissions.ts:79-85 only OWNER and APPROVER may 'approve', so a REVIEWER cannot apply even a 'review'-meaning signature.
- taskManagement.routes.ts:181 gates POST /tasks with requireEditorAccess.
- The only route that lists grants is GET /api/authoring/docs/:docId/permissions (server/routes/authoring-permissions.ts:123). It calls requirePermissionManager, so an ordinary user cannot read even their own role. The client never calls it.

3) Rules it breaks. .claude/skills/regulatory-compliance-ux/SKILL.md:27, rule 6: "Actions the current user cannot perform MUST be hidden or clearly disabled with a tooltip stating *why* ... Do not let a user click a governed button only to see a 403." The Disabled-With-Reason pattern is at :81-104. docs/design/ANA_DOCUMENT_STUDIO_DESIGN_ADVISORY.md §8.3 (line 267) says "never clickable-then-403", and docs/design/FULL_FEATURE_INVENTORY_FOR_DESIGN.md:41 repeats it.

4) Precedent and novelty. The 2026-09-24 part11-ux review already treated this category as a real defect: Q6 "gap (P6) ... role-scoped visibility", where Revert was clickable and then refused. It was fixed in 896e96fb. None of the 2026-09-24, 26 or 28 reviews records an open finding about permission affordances on Freeze, E-sign, Assign review or File to vault, so this is new. The last three commits to AuthoringFilingBar are fde9d704e, 6f79a000f and 4876e2829. They cover the reason-for-change, the signing ceremony and an unrelated change, and none decides against permission-aware gating.

5) Severity. This is only an affordance gap: the server enforces correctly and the refusal message is honest. That is why I rate it low, not the auditor's medium.

Coverage:
- Covered: the four named files; the server middleware, the permission service and the permissions routes; the task route gate; the skill and the design docs; the three review folders; and the git log of the site.
- Not covered: I did not run the app or reproduce the 403 live against Postgres. I did not check whether the org role in the client's useAuth user would be enough to gate Assign review.

