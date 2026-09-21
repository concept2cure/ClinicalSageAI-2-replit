# URS-004 — User Requirements Specification: Submission Center

| Field | Value |
|---|---|
| Document ID | URS-004 |
| Version | 0.1 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 |
| Verified by | OQ-004 (`tests/validation/oq/submission-center/run.mjs`) |

**App:** Submission Center

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | Drafted from `server/routes/submissions.ts`, `server/services/submission-service/submission-service.ts`, `server/services/ectd/leaf-document-tables.ts`, `server/routes/c2c/actions.ts`, `server/routes/dossier-map.routes.ts`, `server/routes/ectd-compile.ts` and the `SubmissionCenter`, `EctdCompile`, `PublishingCenter`, `DossierMap` surfaces. |

## 1. Intended use

The Submission Center plans, assembles, validates and dispatches a regulatory submission: a canonical `submissions` row per application, eCTD sequences under it, leaves that point at governed documents, a lifecycle whose irreversible transitions (freeze, dispatch, transmit) are gated behind a Part 11 e-signature and a deterministic readiness gate, and honest reporting of which agency gateways are configured.

## 2. Requirements

| URS id | Requirement | Part 11 | Risk | Source |
|---|---|---|---|---|
| URS-SUBC-001 | Submission endpoints require an authenticated actor holding the regulatory-author role; anonymous requests are refused. | §11.10(d) | high | `server/routes/submissions.ts:209-212` (`requireRole(AUTHOR)`), `register-governance-routes.ts:65` |
| URS-SUBC-002 | Submission creation validates title, application type, client type and region against the controlled vocabularies (400 `VALIDATION` with field details otherwise) and records a §11.10(e) audit row whose outcome is reported to the caller. | §11.10(e) | high | `server/routes/submissions.ts:50-57, 222`, `submission-service.ts:161-183` |
| URS-SUBC-003 | A sequence is created under a submission with a region and a four-digit sequence number (`0000` …) and a type; it is listed with status `draft`. | none | high | `server/routes/submissions.ts:58-62, 866-895` |
| URS-SUBC-004 | A leaf is placed in a sequence by section code and a document reference; the document table must be a placeable leaf source (`vault_documents`, `coauthor_documents`, …) and anything else is refused at the write boundary with the allowed list. | none | high | `server/routes/submissions.ts:66-80, 919`, `leaf-document-tables.ts:31-118` |
| URS-SUBC-005 | Sequence status follows the lifecycle draft → assembling → validated → frozen → dispatched; a transition the state machine does not allow is refused and the status is unchanged. | none | high | `submission-service.ts:76-97, 334-348` |
| URS-SUBC-006 | `frozen` and `dispatched` cannot be reached through the generic transition endpoint (`GOVERNED_REQUIRED`); the governed endpoints require a `signatureActionId`. | §11.10(e) §11.200 | high | `submission-service.ts:65, 340-345`, `server/routes/submissions.ts:1604-1642` |
| URS-SUBC-007 | The governed `sign` action on a sequence is high-risk: it requires re-authentication (password, optionally TOTP), a reason of ≥ 8 characters and a target the organisation owns; without re-authentication it is refused and no action id, ledger pair or `electronic_signatures` row is created; with it, the signature and the chained ledger rows land in one transaction. | §11.50 §11.70 §11.200 | high | `server/routes/c2c/actions.ts:58-89, 240-251, 402-480, 543-547` |
| URS-SUBC-008 | The capabilities endpoint reports each agency gateway (ESG, CESP, …) as configured only when credentials exist; nothing is claimed as configured on an installation without them. | none | medium | `server/routes/submissions.ts:236` |
| URS-SUBC-009 | The dossier map answers per-module (M1–M5) completeness for the program open in the shell. | none | medium | `server/routes/dossier-map.routes.ts:39-63`, `client/src/concept2cure/v2/surfaces/DossierMap.tsx:64` |
| URS-SUBC-010 | eCTD compile for a program answers with a spine/status or an explained refusal; it never answers 500. | none | medium | `server/routes/ectd-compile.ts:425, 984` |
| URS-SUBC-011 | The Submission Center, eCTD Compile and Publishing surfaces render the organisation's submissions and the open program's sequence. | none | medium | `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx`, `EctdCompile.tsx`, `PublishingCenter.tsx` |
| URS-SUBC-012 | Transmit requires a signature action id and a dispatched, gate-clear sequence; without a configured gateway it reports `transmitted:false` with the reason and never fabricates an acknowledgement. | §11.10(e) | high | `server/routes/submissions.ts:1644-1680` |

## 3. Assumptions and constraints

- The password re-authentication in URS-SUBC-007 can only be exercised by a tester who holds the identity's password; the dev-login identity used locally has none available to the runner.
- Real gateway transmission is qualified under row D7 against FDA's test environment.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
