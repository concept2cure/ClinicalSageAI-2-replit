# OQ-003 — Operational Qualification protocol: Authoring

| Field | Value |
|---|---|
| Document ID | OQ-003 |
| Version | 0.1 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-003 |
| Runner (the executable protocol) | `tests/validation/oq/authoring/run.mjs` — `npm run validation:oq -- authoring` |
| Record | `docs/evidence/W3/<date>/OQ-AUTHORING/OQ-003-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First protocol; executed locally (see record). |

## 1. Method

As OQ-001 §1. The signing PIN is enrolled by the runner through the product's own endpoint for the test identity (`VALIDATION_SIGNING_PIN`, default `246813`); PIN values are redacted from every record. Steps execute in the order below (review/submit precede freeze because submit requires DRAFT).

## 2. Pre-conditions

IQ-001 executed; a program created by OQ-AUTH-00. The AI-provider steps expect `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` to be **unset** for the fail-closed check and set to a PQ-passed model for the drafting check.

## 3. Steps

| Step | URS | Kind | Action | Expected result |
|---|---|---|---|---|
| OQ-AUTH-00 | — | prerequisite | Create a program | 201 |
| OQ-AUTH-01 | URS-AUTH-001 | scripted | `GET /api/authoring/docs` anonymous | 401/403 |
| OQ-AUTH-02 | URS-AUTH-002 | scripted | Create a document without a title | 400 |
| OQ-AUTH-03 | URS-AUTH-002 | scripted | Create an M2 document bound to the program | 2xx; UUID id |
| OQ-AUTH-04 | URS-AUTH-003 | scripted | Create sections 2.7 then 2.5; list | Two sections in filing order; structure issues reported |
| OQ-AUTH-05 | URS-AUTH-004 | scripted | PATCH content with `changeReason`; read history | 200; ≥1 revision with `content_sha256` and author |
| OQ-AUTH-06 | URS-AUTH-005 | scripted | `GET history/verify` | Chain intact |
| OQ-AUTH-07 | URS-AUTH-004 | scripted | PATCH with a stale `expectedUpdatedAt` | 409 `SECTION_CHANGED`; content unchanged |
| OQ-AUTH-08 | URS-AUTH-006 | scripted | Revert to the first revision | Content restored; history grows |
| OQ-AUTH-09 | URS-AUTH-007 | scripted | Comment on a section; list document comments | Comment listed |
| OQ-AUTH-10 | URS-AUTH-008 | scripted | `GET /docs/:id/audit` | ≥3 events with actor, time, hashes |
| OQ-AUTH-17 | URS-AUTH-013 | scripted | Request review (self); submit without `approver_email`; submit with it; read workflow | Pending review recorded; 400; IN_REVIEW with a PENDING step |
| OQ-AUTH-17b | URS-AUTH-013 | scripted | `GET /api/review/board` | Queue lists the document for the reviewer |
| OQ-AUTH-11 | URS-AUTH-009 | scripted | Freeze v1.0; read frozen; freeze again | Frozen record with content hash; second freeze 400 |
| OQ-AUTH-12 | URS-AUTH-010 | scripted | Enrol the PIN (or rotate with `old_pin` if already enrolled) | 2xx; change without current PIN refused |
| OQ-AUTH-13 | URS-AUTH-010 | scripted | e-sign with wrong PIN; with meaning `WHATEVER` | 401; 400; no signature stored |
| OQ-AUTH-14 | URS-AUTH-010, 011 | scripted | e-sign REVIEWER with PIN and intent; list signatures | One signature: actor, REVIEWER, `pin_verified`, digest, covered freeze hash |
| OQ-AUTH-15 | URS-AUTH-012 | scripted | AI draft with no provider | Refused (≥400); no draft text |
| OQ-AUTH-16 | URS-AUTH-012 | scripted → deviation locally | AI draft with a provider | Governed draft candidate |
| OQ-AUTH-18 | URS-AUTH-014 | ad-hoc | Template stores | 200 / 200 |
| OQ-AUTH-19 | URS-AUTH-015 | unscripted (browser) | Open `/concept2cure/document-authoring` | Document title visible; screenshot |
| OQ-AUTH-20 | URS-AUTH-013, 015 | ad-hoc (browser) | Open `/concept2cure/review` | Renders; screenshot |

## 4. Acceptance

As OQ-001 §4. URS-AUTH-011's negative case (a non-signing role refused) needs a second identity and is executed on staging.

## 5. Result of the local execution (2026-09-21)

9 pass, 1 fail, 1 deviation, 11 not-executed. OQ-AUTH-04 (section create) answered 500 because the runtime role cannot write `document_span_lineage` (IQ-DEV-001), so every step needing a section — revisions, chain verify, stale save, revert, comment, audit, freeze, e-signature, AI draft — is **not-executed**: the Part 11 controls of Authoring are **not yet qualified** on this installation. Fail: OQ-AUTH-17b — a review requested and submitted in Authoring does not appear on the Review board's queue (the board reads `document_workflows`/`workflow_approvals`, authoring stores `authoring_reviews`/`authoring_workflow_steps`) — finding F-6. Passed: access control, creation validation, review request + workflow submit, template stores, both surfaces render.

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
