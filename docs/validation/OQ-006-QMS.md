# OQ-006 — Operational Qualification protocol: QMS controlled documents

| Field | Value |
|---|---|
| Document ID | OQ-006 |
| Version | 0.1 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-006 |
| Runner (the executable protocol) | `tests/validation/oq/qms/run.mjs` — `npm run validation:oq -- qms` |
| Record | `docs/evidence/W3/<date>/OQ-QMS/OQ-006-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First protocol; executed locally (see record). |

## 1. Method

As OQ-001 §1. Two SOPs are created: A exercises approve → revise; B exercises the approval-credential check, training acknowledgement, review-due and retire.

## 2. Steps

| Step | URS | Kind | Action | Expected result |
|---|---|---|---|---|
| OQ-QMS-01 | URS-QMS-001 | scripted | `GET /api/mdx/qms/documents` anonymous | 401/403 |
| OQ-QMS-02 | URS-QMS-002 | scripted | create without `docType` | 422 with field errors |
| OQ-QMS-03 | URS-QMS-002, 003 | scripted | create SOP A (`nextReviewDate` +10d); list; detail | 201 draft v1.0 with audit outcome; listed; readable |
| OQ-QMS-04 | URS-QMS-002 | scripted | duplicate `docNumber` | 409 |
| OQ-QMS-05 | URS-QMS-004 | scripted | approve A; approve again | effective, approver/time stamped, audit outcome; 409 |
| OQ-QMS-06a | URS-QMS-002 | prerequisite | create SOP B (`nextReviewDate` +5d) | 201 |
| OQ-QMS-06 | URS-QMS-005 | scripted | approve B with **no** credential | refused (an approval is a signing act) |
| OQ-QMS-07 | URS-QMS-006 | scripted | revise A without reason; with reason | 422; v2.0 draft, approval cleared, audited |
| OQ-QMS-08 | URS-QMS-008 | scripted | training-ack on B; compliance report | 201 with `document_version`; 200 |
| OQ-QMS-09 | URS-QMS-009 | scripted | review-due within 30 days | B listed, `overdue:false` |
| OQ-QMS-10 | URS-QMS-007 | scripted | retire B with reason | retired; reason kept |
| OQ-QMS-11 | URS-QMS-010 | scripted | raise a change; list; summary | 201; listed |
| OQ-QMS-12 | URS-QMS-011 | scripted | create QMP; list | 201 draft; listed |
| OQ-QMS-13 | URS-QMS-013 | ad-hoc | templates | 200, non-empty |
| OQ-QMS-14 | URS-QMS-012 | unscripted (browser) | Open `/concept2cure/quality`; click *Change control* | SOP A number visible; both tabs captured |
| OQ-QMS-15 | URS-QMS-011, 012 | unscripted (browser) | Open `/concept2cure/qmp` | Plan name visible |

## 3. Result of the local execution (2026-09-21)

14 pass, 1 fail, 1 deviation. Fail: OQ-QMS-06 — `POST /qms/documents/:id/approve` with an empty body answered 200 and set the document `effective` with `approver_id` = the session user; the route (`server/routes/mdx-qms.ts:463-501`) verifies no PIN or password and records no signature meaning, so an SOP can be made binding on possession of a session alone — finding F-3 (Part 11 §11.50/§11.200). Deviation: OQ-QMS-11 (`qms_change_controls` unreadable, IQ-DEV-001). Passed: access gate, validation, uniqueness, lifecycle stamps and audit outcomes, revision with reason and major bump, training acknowledgement, review-due, retire, QMP, templates, both surfaces.

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
