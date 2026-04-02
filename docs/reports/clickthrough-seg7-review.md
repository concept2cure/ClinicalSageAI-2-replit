# Click-Through Audit: Segment 7 — Review, Approval & E-Signature Workflow

## 1. Document Status Lifecycle

- **States**: not-started → drafting → in-review → approved → locked → signed/published
- **Storage**: `status` column on `concept2cureArtifacts` and `authoring_documents` tables
- **Transitions**: Managed via API endpoints in `concept2cure.ts` and `authoring.router.ts`
- **Verdict**: **PASS** — Clear lifecycle with DB-backed state

---

## 2. Reviewer Assignment

- **File**: `client/src/concept2cure/components/editor/ReviewerAssignment.tsx`
- **What user sees**:
  - List of current reviewers with status badges (pending, in_progress, approved, changes_requested, rejected)
  - "Add Reviewer" dropdown to search and select team members
  - "Send Reminder" button per reviewer
  - "Submit for Review" button to initiate review workflow
- **Props-based**: Component receives `onAddReviewer`, `onRemoveReviewer`, `onSendReminder`, `onSubmitForReview` callbacks
- **Server routes**: `concept2cure.ts` lines 7140-7499 — CRUD for reviewer assignments with Drizzle queries
- **Uses**: `Button`, `Input`, `WorkspaceStatusBadge` — governed components
- **Verdict**: **PASS** — Full reviewer management UI with server-backed CRUD

---

## 3. Review Mode in Editor

- **ReviewMode.tsx**: Review-specific toolbar overlay
- **Track Changes**: `TrackChangesExtension` provides insert/delete mark tracking
- **Comments**: `CommentMark` extension for inline threaded comments
- **Compliance Scanner**: `ComplianceScanner` extension runs live checks during review
- **Verdict**: **PASS** — Reviewers have track changes, comments, and compliance tools

---

## 4. Tracked Change Decisions

- **Accept/Reject flow**: Button click → handler in EditorPanel → `POST /api/authoring/documents/{id}/tracked-change-decisions`
- **Server**: `authoring.router.ts` — creates/upserts tracked change decision records
  - Table: `authoring_tracked_change_decisions` (id, artifact_id, change_id, decision, user_id, user_name, tenant_id, decided_at)
  - Single decision: `POST /documents/:id/tracked-change-decisions` with upsert
  - Bulk: `POST /documents/:id/tracked-change-decisions/bulk`
  - Fetch: `GET /documents/:id/tracked-change-decisions`
- **Audit trail**: Each decision logged
- **Verdict**: **PASS** — Real persistence with audit trail

---

## 5. Approval Gating

- **Server**: `concept2cure.ts` ~line 6311 — approval blocked if not all reviewers have approved
- **Logic**: Query reviewer assignments, check all have `status = 'approved'`
- **Response**: HTTP 403 with message if reviewers haven't all approved
- **Verdict**: **PASS** — Real gating, not just UI decoration

---

## 6. Electronic Signatures (21 CFR Part 11)

- **Server endpoint**: `POST /api/authoring/docs/:docId/e-sign` (`authoring.router.ts:2748`)
- **Flow**:
  1. User provides: PIN, meaning (AUTHOR/REVIEWER/APPROVER), intent (free text)
  2. Server: `verifyUserPin(email, pin, tenantId)` — validates PIN against DB
  3. Server: `computeDocHash(docId, tenantId)` — SHA-256 of document content
  4. Server: INSERT into `electronic_signatures` table:
     - id, doc_id, signer_email, signer_name, signature_meaning, signature_intent
     - document_hash, pin_verified, ip_address, user_agent, tenant_id
  5. Server: `createAuditTrail()` with signatureId, meaning, intent
  6. Server: Updates document status to `approved`, freezes content, records hash

- **Compliance fields**: `signature_meaning` + `signature_intent` (21 CFR Part 11 §11.50)
- **Document hash**: Content hashed at signature time for tamper detection
- **IP/User-Agent**: Recorded for audit trail
- **Verdict**: **PASS** — Full 21 CFR Part 11 compliant e-signature implementation

---

## 7. Change Requests (CR) Workflow

- **Server**: `authoring.router.ts` — Change Request CRUD
  - `POST /cr/:crId/approve` (line 3900) — approve CR, records approver email + timestamp
  - `POST /cr/:crId/reject` (line 3928) — reject CR
  - Table: `doc_change_requests` (cr_id, doc_id, section_id, title, reason, apply_kind, patch_json, proposer_email, approver_email, status, resolved_at)
- **Verdicts**: **PASS** — Formal change request tracking

---

## 8. Publishing / Freezing

- **E-sign endpoint**: After signature, document status → `approved`, content frozen, hash stored
- **Lock**: `locked_at`, `locked_by` columns set
- **Freeze**: `frozen_at` timestamp + `frozenContent` blob
- **No further edits**: Document locked after approval
- **Verdict**: **PASS** — Proper freeze-on-approval with tamper detection

---

## Summary

| Feature | Verdict | Issue |
|---------|---------|-------|
| Status Lifecycle | **PASS** | Clear states, DB-backed |
| Reviewer Assignment | **PASS** | Full CRUD, server-backed |
| Review Mode | **PASS** | Track changes + comments + compliance |
| Tracked Change Decisions | **PASS** | Real persistence, audit trail |
| Approval Gating | **PASS** | All-reviewers-must-approve enforced |
| E-Signatures | **PASS** | Full 21 CFR Part 11: PIN, meaning, intent, hash |
| Change Requests | **PASS** | Formal CR workflow with approve/reject |
| Publishing/Freezing | **PASS** | Content frozen, tamper-detected |

**Critical Issues**: None. This is the strongest segment — full regulatory compliance workflow.
