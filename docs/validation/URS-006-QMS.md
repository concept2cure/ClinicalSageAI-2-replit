# URS-006 — User Requirements Specification: QMS controlled documents

| Field | Value |
|---|---|
| Document ID | URS-006 |
| Version | 0.1 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 |
| Verified by | OQ-006 (`tests/validation/oq/qms/run.mjs`) |

**App:** QMS controlled documents

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | Drafted from `server/routes/mdx-qms.ts` (documents, approve, revise, retire, training, review-due, changes, templates), `server/routes/quality-management-api.ts` (plans) and the `QualityRoute` / `QmpWorkspace` surfaces. |

## 1. Intended use

QMS controlled documents is the customer's own quality system inside the product: SOPs, work instructions, forms and policies with a controlled lifecycle (draft → effective → superseded/retired), versioned revisions with a reason for change, training acknowledgements against a document version, periodic review, change control, and Quality Management Plans. An approval here makes a procedure binding on the customer's staff.

## 2. Requirements

| URS id | Requirement | Part 11 | Risk | Source |
|---|---|---|---|---|
| URS-QMS-001 | QMS endpoints require an authenticated organisation member; anonymous requests are refused. | §11.10(d) | high | `server/bootstrap/register-inline-routes.ts:1167-1190` |
| URS-QMS-002 | A controlled document is created with a document number (unique per organisation — 409 on duplicate), title and a document type from the controlled vocabulary; invalid input answers 422 with field errors; creation records a §11.10(e) audit row whose outcome is reported. | §11.10(e) | high | `mdx-qms.ts:106-139, 330-372` |
| URS-QMS-003 | A new document is `draft` at version `1.0`, is listed for the organisation and readable by id; another organisation's document is not found. | none | medium | `mdx-qms.ts:309, 402-415` |
| URS-QMS-004 | Approval moves a draft/in-review document to `effective`, stamps approver and approval time, sets the effective date, records an audit row, and is refused (409) for a document not in an approvable state. | §11.10(e) | high | `mdx-qms.ts:463-501` |
| URS-QMS-005 | Approval of a controlled document is an electronic signature: it verifies a credential the approver alone holds (PIN or password re-authentication), records the signature meaning, and is refused without them. | §11.50 §11.200 | high | `mdx-qms.ts:463-501` (assessed) |
| URS-QMS-006 | Opening a revision requires a reason for change (422 otherwise), bumps the major version, returns the document to `draft`, clears the prior approval and records the reason in the audit trail. | §11.10(e) | high | `mdx-qms.ts:503-553` |
| URS-QMS-007 | Retiring a document records the reason, the actor and the time; the document reads `retired`. | §11.10(e) | medium | `mdx-qms.ts:555-585` |
| URS-QMS-008 | A training acknowledgement is recorded against the document's current version with the method and an expiry, and the compliance report answers. | §11.10(e) | medium | `mdx-qms.ts:587-622, 660` |
| URS-QMS-009 | The review-due report lists effective documents whose next review falls within the window and flags overdue ones. | none | low | `mdx-qms.ts:383-400` |
| URS-QMS-010 | Change control: a change record is raised with a number, title, classification and reason, listed and summarised. | §11.10(e) | medium | `mdx-qms.ts:1078-1210` |
| URS-QMS-011 | A Quality Management Plan is created with a name (≥ 3 chars) and listed for the organisation with status `draft`. | none | low | `quality-management-api.ts:471, 581-632` |
| URS-QMS-012 | The Quality surface renders the SOP register with the organisation's documents and the Change control tab; the QMP surface renders the organisation's plans. | none | medium | `client/src/concept2cure/quality/App.tsx`, `client/src/concept2cure/v2/surfaces/QmpWorkspace.tsx` |
| URS-QMS-013 | The server-curated quality-system template family is served. | none | low | `mdx-qms.ts:374` |

## 3. Assumptions and constraints

- The change-control store (`qms_change_controls`) must be readable by the runtime role; on this installation it is not (IQ-DEV-001).

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
