# Regulatory commitments — UI advisory for Claude Design

**Audience:** Claude Design. **Author:** Claude Code (backend).
**Status:** backend shipped on `concept2cure-v2`; UI designed in `ui_kits/` first (per `CLAUDE.md`).

Commitment tracking closes the post-approval lifecycle loop: the living record
captured what you *submitted*; commitments are what *came back* (inbound) and
what you *owe forward* (outbound). A commitment is a **Claim with a deadline +
owner + provenance**. The backend now extracts them source-anchored, structures
them, and tracks them with governed, audited status changes.

## 1. What exists (the substrate)

- **Model:** `c2c_commitments` (migration `20260603_commitments.sql`) — direction
  (inbound/outbound), type (PMR/PMC/REMS/annex_ii/specific_obligation/PASS/PAES/
  pma_condition/522_study/self_commitment), authority, title/description,
  **source_document_id + source_quote + source_locator + provenance_ref**, owner,
  due_date(+text), status, linked_task_id, extracted_by, groundedness, needs_review.
- **Service:** `server/services/commitments/commitments-service.ts` —
  `extractCommitments` (via the governed AI gateway, source-anchored), pure
  `parseCommitmentsJson` / `commitmentClock` / `commitmentGroundedness`, and CRUD.
- **Routes:** `/api/c2c/commitments/*` (auth-gated). Status changes write a
  hash-chained 21 CFR Part 11 audit (`audit_logs`).
- **AnA + governance:** capabilities `extract-commitments` + `track-commitments`
  registered in the registry under a new **high-risk** `commitments` governance
  tier (requires human review; a missed commitment is pure liability).

## 2. What the UI must do (the commitments surface)

1. **Register** — a filterable table of all commitments: direction badge
   (inbound/outbound), type, authority, title, owner, **due-date clock**
   (on_track/due_soon/overdue from `commitment.clock`), status. Split or filter
   by inbound vs outbound — lead with **outbound** (self-made promises are the
   ones that silently accumulate).
2. **Extract** — drop/select a document (approval letter, meeting minutes, your
   own submission) → call `POST /extract` → show the extracted commitments as a
   **review queue** with each item's **verbatim source quote** shown inline
   (provenance), its groundedness, and accept/edit/reject. This is the headline
   flow: "extract is a feature, not a form field."
3. **Review gate** — extracted commitments arrive `needs_review=true`,
   `status='proposed'`. A human reviews each against its source span, then
   confirms (status→open) — a governed status change (reason-for-change).
4. **Track to closure** — owner + due date + status; surface **overdue** and
   **due-soon** prominently (calm status, not alarm — except a genuine overdue).
   "Submit confirmatory data by Q4" → link/spawn a task (`linked_task_id`).
5. **Inspection view** — "show me every commitment with status + evidence":
   filter to a product/project, show status + source provenance, exportable.

## 3. Dependencies (exact contracts)

All under `/api/c2c/commitments`, auth-gated; org/user from tenant context.
Responses `{ success, data }`.

| Action | Method + path | Notes |
| --- | --- | --- |
| List | `GET /` | query: `projectId`, `direction`, `status` |
| Create | `POST /` | manual; body `{ title, direction, commitmentType, authority?, description?, owner?, dueDate?, dueDateText?, sourceQuote?, sourceDocumentId?, projectId? }` |
| Extract | `POST /extract` | body `{ text, documentId?, projectId?, persist? }` → `{ extracted[], createdIds[], count, persisted }` |
| Status | `PATCH /:id/status` | body `{ status, reason (>=8), clearReview?, linkedTaskId? }` → governed + Part-11 audited |

**Commitment row shape** (list/extract): `{ id, direction, commitmentType,
authority, title, description, sourceQuote, sourceLocator, owner, dueDateText,
status, linkedTaskId, extractedBy, groundedness, needsReview, clock: { dueDate,
daysRemaining, overdue, dueSoon, status } }`.

## 4. Backend follow-ups (mine; additive, validate on preview DB)

- Auto-create a **task** from a commitment (wire `linked_task_id` to the tasking
  module) on review-accept.
- Parse `dueDateText` → `due_date` (NLP date) so the clock fires automatically.
- Bind commitments into the **living-record / provenance graph** (`provenance_ref`
  → canonical fact) so a labeling/PSUR §16 change flags affected commitments.
- **Contradiction check** across outbound commitments (the non-obvious win:
  catch "Type B minutes committed to X but the submission did Y" before the agency does).
- Reconcile with the existing `reg_obligations` table (one canonical store).
- Formal `extract_commitments` AIActionType handler (today it's a service + route).
- **The migration must be validated against the preview DB** before "done" deployed.

## 5. Design-system non-negotiables (from `CLAUDE.md` / `README.md`)
Sentence case; no emoji/exclamations; second person; body 13px; max title 18–24px;
Claude orange once per screen; Lucide icons; 200ms ease-out. Overdue/at-risk are
the one legitimate focal escalation — render as focused status, not a red wash.

## 6. Build order
1. Register (table + clocks + inbound/outbound filter).
2. Extract → review queue with inline source quotes (the headline).
3. Track-to-closure + task link.
4. Inspection/export view.
