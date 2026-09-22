# OQ-003 — Operational Qualification protocol: Authoring

| Field | Value |
|---|---|
| Document ID | OQ-003 |
| Version | 0.3 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-003 |
| Runner (the executable protocol) | `tests/validation/oq/authoring/run.mjs` — `npm run validation:oq -- authoring` |
| Record | `docs/evidence/W3/<date>/OQ-AUTHORING/OQ-003-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First protocol; executed locally (see record). |
| 0.2 | 2026-09-21 | WF | VSR-001 §8.3 P-1: the comment recorded in OQ-AUTH-09 is resolved through the comment-resolution API (new OQ-AUTH-11b, audited) before the freeze; the refusal of a freeze over an open comment is kept as the negative case (new OQ-AUTH-11a); the `acknowledgeUnresolved` confirm flag is not the happy path. OQ-AUTH-15/16 moved before the freeze (a FROZEN document refuses every edit-class route with 409, which answered the AI-draft check for the wrong reason). Re-executed locally (§5). |
| 0.3 | 2026-09-22 | W3 | §5 records the 2026-09-22 execution under the production posture (RLS enforcing, non-owner runtime role, credentialed second signer); earlier results are kept below it as superseded. No step changed. |

## 1. Method

As OQ-001 §1. The signing PIN is enrolled by the runner through the product's own endpoint for the test identity (`VALIDATION_SIGNING_PIN`, default `246813`); PIN values are redacted from every record. Steps execute in the order below: review/submit precede freeze because submit requires DRAFT; the AI-draft steps precede freeze because a FROZEN document refuses every edit-class route; the comment from OQ-AUTH-09 is resolved through the product's comment-resolution API (OQ-AUTH-11b) before the freeze, after the refusal of a freeze over an open comment has been observed (OQ-AUTH-11a). The freeze confirm flag `acknowledgeUnresolved` is never sent.

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
| OQ-AUTH-15 | URS-AUTH-012 | scripted | AI draft with no provider (before the freeze) | Refused (≥400, not the 409 immutability refusal); no draft text |
| OQ-AUTH-16 | URS-AUTH-012 | scripted → deviation locally | AI draft with a provider (before the freeze) | Governed draft candidate |
| OQ-AUTH-11a | URS-AUTH-009, 007 | scripted (negative) | Freeze v1.0 while the OQ-AUTH-09 comment is open; read frozen | 409 `DOCUMENT_NOT_SETTLED` counting 1 open comment; nothing frozen |
| OQ-AUTH-11b | URS-AUTH-007, 008 | scripted | `PATCH /api/authoring/comments/:id {status:"resolved", resolution_note}`; list comments; read audit | 200; status resolved with `resolved_by` = actor and `resolved_at`; audit event `comment_resolved` naming the comment |
| OQ-AUTH-11 | URS-AUTH-009 | scripted | Freeze v1.0 (document settled); read frozen; freeze again | Frozen record with content hash; second freeze 400 |
| OQ-AUTH-12 | URS-AUTH-010 | scripted | Enrol the PIN (or rotate with `old_pin` if already enrolled) | 2xx; change without current PIN refused |
| OQ-AUTH-13 | URS-AUTH-010 | scripted | e-sign with wrong PIN; with meaning `WHATEVER` | 401; 400; no signature stored |
| OQ-AUTH-14 | URS-AUTH-010, 011 | scripted | e-sign REVIEWER with PIN and intent; list signatures | One signature: actor, REVIEWER, `pin_verified`, digest, covered freeze hash |
| OQ-AUTH-18 | URS-AUTH-014 | ad-hoc | Template stores | 200 / 200 |
| OQ-AUTH-19 | URS-AUTH-015 | unscripted (browser) | Open `/concept2cure/document-authoring` | Document title visible; screenshot |
| OQ-AUTH-20 | URS-AUTH-013, 015 | ad-hoc (browser) | Open `/concept2cure/review` | Renders; screenshot |

## 4. Acceptance

As OQ-001 §4. URS-AUTH-011's negative case (a non-signing role refused) needs a second identity and is executed on staging. A freeze must never be obtained by the confirm flag in this protocol; a run whose OQ-AUTH-11a passes for any reason other than 409 `DOCUMENT_NOT_SETTLED` is invalid.

## 5. Result of the local execution (2026-09-22, production posture — VSR-001 §12)

**23 pass, 0 fail, 1 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-22/OQ-AUTHORING/`, executed 2026-09-22T22:36:01Z UTC at `e2d910d6f`). Installation: a database provisioned from empty by `npm run up`; the server booted from the checkout with `RLS_ENFORCE=on` as runtime role `app_service` (not superuser, no BYPASSRLS, owns no table — IQ-07 and IQ-08 pass, `docs/evidence/W3/2026-09-22/IQ/`); no AI provider configured. This is the first execution with RLS enforcing and as a role that owns no table. The executions filed before it record `RLS_ENFORCE=off` (IQ-DEV-003), under which the tenant-isolation policies are inert, and runtime role `c2c` on `clinicalsage`, which owns 61 RLS-enabled tables without FORCE — `vault.documents` among them — whose policies therefore never applied to it (VSR-001 §12). OQ-AUTH-13/14: wrong PIN 401, bad meaning 400, no signature stored; a REVIEWER signature covering the v1.0 freeze (F-12 closed). OQ-AUTH-15: 503 `GATEWAY_UNAVAILABLE`, "Nothing was changed" (F-10 closed). OQ-AUTH-17b: the review requested in Authoring is on the Review board queue (F-6 closed, VSR-001 §11.2). Deviation: OQ-AUTH-16 — no AI provider is configured; URS-AUTH-012 stays partial until a PQ-passed provider is. The same 23 / 0 / 1 was recorded at `8a40bb187` (2026-09-22 00:08 UTC, owner role; `docs/evidence/W3/2026-09-20/OQ-AUTHORING/`).

### 5.1 Result of the local execution (2026-09-21, version 0.2 — worker WF, superseded)

**19 pass, 3 fail, 1 deviation, 1 not-executed** (24 steps; record regenerated under `docs/evidence/W3/2026-09-20/OQ-AUTHORING/`, transcript `docs/evidence/WF/2026-09-21/`). P-1 is closed by protocol change: OQ-AUTH-11a observed the 409 `DOCUMENT_NOT_SETTLED` refusal, OQ-AUTH-11b resolved the comment (status `resolved`, `resolved_by` = actor, audit event `comment_resolved`), OQ-AUTH-11 froze v1.0 with a content hash and the second freeze was refused. Fail: OQ-AUTH-17b (F-6, unchanged); OQ-AUTH-15 (F-10 reproduces before the freeze: `POST …/ai/draft` with no provider answered HTTP 200 `degraded:true, source:"template"` with a full template draft); **OQ-AUTH-13 (new): `POST /docs/:id/e-sign` on the FROZEN document answered 409 `AUTHORING_DOCUMENT_IMMUTABLE`** — `server/middleware/authoringObjectAuthorization.ts:31` classifies the path as `edit` (its regex matches `sign` only as a whole segment; the segment is `e-sign`), so the immutability guard refuses the signature the route itself binds to the frozen snapshot (`covered_freeze_version`). OQ-AUTH-14 is not-executed behind it; the PIN refusal, the meaning refusal and the positive REVIEWER signature remain unqualified. Deviation: OQ-AUTH-16 (no AI provider).

### 5.2 Result of the local execution (2026-09-21, version 0.1 — W3a, superseded)

9 pass, 1 fail, 1 deviation, 11 not-executed. OQ-AUTH-04 (section create) answered 500 because the runtime role cannot write `document_span_lineage` (IQ-DEV-001), so every step needing a section — revisions, chain verify, stale save, revert, comment, audit, freeze, e-signature, AI draft — is **not-executed**: the Part 11 controls of Authoring are **not yet qualified** on this installation. Fail: OQ-AUTH-17b — a review requested and submitted in Authoring does not appear on the Review board's queue (the board reads `document_workflows`/`workflow_approvals`, authoring stores `authoring_reviews`/`authoring_workflow_steps`) — finding F-6. Passed: access control, creation validation, review request + workflow submit, template stores, both surfaces render.

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
