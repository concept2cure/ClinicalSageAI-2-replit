# Completeness critic

As returned.

- **Board claim `37f21ed0` is wrong on three files.** It lists them as cold, but other sessions changed each one after the triage groups read.
  - `server/services/hocuspocus-server.ts`: changed by `dd91ded4` (session_01KiDof7, landed 2026-09-28T17:32:29Z), so it is held until 2026-09-29T17:32:29Z. The coedit-authz group also marked it cold.
  - `server/services/part11/signature-persistence.ts`: changed by `dc48d926` (01KiDof7, 17:32:30Z), held until 2026-09-29T17:32:30Z.
  - `server/services/protocol-development/protocol-development-service.ts`: changed by `25cfc551` (01M8bGFS, 17:18:50Z), held until 2026-09-29T17:18:50Z. That commit rewrote the ordering in `snapshotVersionTx` and `finalizeProtocolTx` (`:377`, `:398`, now `order_index, section_key, id`). These are the two functions P11-C-3-SNAP step 2 edits. The "ordering differs" evidence is now narrower: the binding orders by `order_index, section_key` (`signature-persistence.ts:606`).
  - The claim row (`docs/work-orders/README.md:87-96`) should drop these three files, or hand them on.
- **SEC-A-10 has changed under the coedit-authz triage.** `dd91ded4` fixed two of its sub-items:
  - A token subject that is not a user id is now refused (`denied('invalid-token')`).
  - The IAM-19 / P1-33 re-check of an open connection now exists (`startCollabSessionRecheck`).
  - Still open: `authorizeResource` checks tenant only, with no grant or lock check; the client does not check `!docSealed`; and `onSynced` reports "saved" without comparing the room to the stored text.
  - The server wiring now touches a held file. Hand steps 2-5 to 01KiDof7, or land only a new decision function in `collab-authorization.ts` now. Also add the grant and lock verdict to `collabSessionEndReason`, so a grant revoked mid-session ends or downgrades the connection.
- **Hold times that are stale.**
  - `authoring.router.ts`: the last change is `f0147f45` (01PwLFr8, 17:05:50Z), so the window closes 2026-09-29T17:05:50Z. The ai-authorship group ("router half waits for 16:48Z"), coedit-authz and the P11-B-2 entry all say 16:48:56Z.
  - `audit-trail-ledger.routes.ts`: `f0147f45` also touched it, so it is held until 17:05:50Z, not 11:44:44Z (protocol-history).
  - `protocol-industry-service.ts` and `protocol-redline.ts`: held until 2026-09-29T17:18:50Z (`25cfc551`), not 16:03Z (P11-C-3-SNAP risk).
  - Minor:
    - `coauthor.ts` landed at 02:15:12Z. figure-followons item b5 used the author time, 02:12Z.
    - `d4176395` landed at 16:48:56Z, not 16:43:36Z.
    - `1de78ea8` and `df10de68` are merge commits, not content changes. The content holds on `DocumentWorkbench.tsx` are 01PwLFr8 until 11:44:44Z, 01KiDof7 until 11:22:55Z and 01KZK3jg until 01:16:06Z.
    - This lane's editor-family row is `README.md:78`, not 77.
- **P11-C-3 step 2(e) would now duplicate existing code.** `f0147f45` added `linkedSignatures` (`audit-trail-ledger.routes.ts:360`), and `readRecordAuditHistory` already calls it. It matches `electronic_signatures` rows by the audit id in their manifest, and protocol signatures already record that id (`signature-persistence.ts:750`; `protocol-signature.ts:198`). Drop the `readSignatureFacets` attachment.
- **SEC-C-4(a) and the SEC-C-4 class: the fix misses a fourth host.** `DocumentCanvas` is the conversation canvas pinned by `docs/design/ANA_DOCUMENT_CANVAS.md`.
  - There, `askAna` passes plain text only: `onAsk(clean)` (`DocumentWorkbench.tsx:1147-1150`) → `DocumentCanvas.tsx:104,443` → `ConversationThread.tsx:245` `canvas.onAsk`.
  - Unwired, that path either still splices the selection into the user's words or loses the button.
  - Holds: `DocumentCanvas.tsx` by 01KiDof7 until 05:17:26Z; `ConversationThread.tsx` by 01PwLFr8 (`04e784bc`) until 2026-09-29T12:57:11Z.
- **P11-A-2 is uncovered by any group.** It is a verified medium, still open, and the file is held.
  - `POST /docs/:docId/freeze` (`authoring.router.ts:4032-4046`) checks only the reason and the JWT email. `assertSigningAuthority` and `reverifyAuthoringSigner` appear only at `:4265/:4287` and `:5935/:5957`.
  - The founder decision DP-35 / P1-32 (`docs/work-orders/README.md:266-270`) is still open.
  - Also correct the plan row's acceptance criterion, "→ 428". The shared re-verification answers 400 (`verification.md:190`).
- **Lows: no group re-checked any except P11-A-3 and P11-A-4.** Status at HEAD `37f21ed0`:
  - **Fixed but not recorded:** A-C-9, by `780a0639` (01KiDof7). The reason is now visible text tied to the button by `whyId` (`ProtocolDevReviews.tsx:118-130`).
  - **Partly fixed:** A-A-3. `e1ce5501` made the governed-act refusals visible (`:3436`, `:3453`). File to vault's `dirty` reason (`DocumentWorkbench.tsx:3454-3458`) is still in a title only.
  - **Duplicate:** SEC-B-8 is the same defect as SEC-C-4(a) (`askForSource`). Cross-reference it in the README.
  - **Open, cold files (can start now):**
    - A-C-3: `ProtocolDevRegisters.tsx:94`
    - A-C-4: `ProtocolDevSection.tsx:209/214`, `ProtocolDevSoa.tsx:272/277`
    - A-C-6: `ProtocolDevPanes.tsx` dot
    - A-C-7: `ProtocolDevSoa.tsx:232`, `research-v2.css:210`
    - A-C-10: `ProtocolDevRegisters.tsx`, no `scope`
    - A-C-11: the `ProtocolDevRegisters.tsx` half
    - A-C-12: `ProtocolDevSection.tsx:287`
    - HS-C-2: `ProtocolDev.tsx:81,95-96`
    - M-2: `ProtocolDevWrites.ts:337`
    - M-4: `ProtocolDevDerivation.tsx:443-444`
    - DS-2 siblings: `AuthoringAiDraft.tsx:264,668,679`, `AuthoringExports.tsx:134,275`
    - SEC-B-10: `client/src/concept2cure/lineage/dataOriginsApi.ts:71,92,167`. The lens's `v2/lineage` path is wrong.
  - **Open, held files:**
    - A-A-6 / DS-1: `DocumentWorkbench.tsx:5035-5040`
    - DS-2: `DocumentWorkbench.tsx:3897`
    - HS-A-3: `DocumentWorkbench.tsx:2706-2725`
    - SEC-B-10 upload: `DocumentWorkbench.tsx:2276`
    - A-B-4: `RichSectionEditor.tsx:931,2729,2769`
    - A-B-5: `RichSectionEditor.tsx:2066,2126,2133`
    - SEC-B-9: `RichSectionEditor.tsx:781`
    - A-C-11: the `ProtocolDevReviews.tsx` half
    - M-3: `ProtocolDevDesign.tsx`, `dd52716e` by 01M8bGFS, until 2026-09-29T17:00Z
    - SEC-A-12: `authoring.router.ts:664` records the client's `x-session-id` as the session id; `authoring-evidence.ts:200` falls back to a random value.
  - **No action:** A-B-6 is advisory and exempted by `SKILL.md`.
- **One adjacent defect was recorded but never tracked.** The 409 "unbound" branch in `ProtocolDevDerivation.tsx:108` is dead, because `apiRequest` throws on every non-OK status except 401. It is noted in `verification.md:1197` and `fixes/HS-C-3/README.md:30`, but not in the results table, and no group covered it. The file is cold. It has the same shape as HS-A-3.
- **Cold items the triage says can start now, but the claim does not list:**
  - SEC-A-7: `revision-ledger.ts` and the new `machine-claim-verify.ts`
  - P11-B-1 core and figure item b3: `coauthor-status-write.ts`, `coauthor-audit.ts`, `ectd-documents.ts` (coordinate with board item 5)
  - SEC-A-FO-c helper: `source-usage.service.ts`
  - SEC-B-3 server module: `comment-anchor-save.ts`
  - A-A-4 and A-A-5 CSS: `authoring-v2.css`
  - HS-B-1 halves: `citationNode.ts`, `ProjectFilesPanel.tsx`
  - P11-C-3: `protocol-dev.routes.ts`, `protocol-history.ts`, `ProtocolGov.tsx`
  - the cold protocol lows above

  I checked each of these files with `git log`: none has a commit from another session in the window.
- **Spot-checks of fixed claims: both hold.**
  - HS-B-2 route C: `b43ec3af` (01TTTQ1h), `RichSectionEditor.tsx:1219` calls `cacheDraft(nowSerialized)`.
  - A-A-2 partial: `8a74ed55` (01KiDof7), `DocumentWorkbench.tsx:1183` has the `defaultPrevented` guard and no dialog check.
  - Also correct: the A-A-1 partial fix (`e1ce5501`, `aria-required`) and the A-C-2 tab strip (`780a0639`).

The helper script I used for the hold checks is `<scratch>/triage/critic/holds.sh`.
