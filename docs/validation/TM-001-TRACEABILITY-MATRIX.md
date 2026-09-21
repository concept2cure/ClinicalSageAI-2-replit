# TM-001 — Requirements Traceability Matrix

| Field | Value |
|---|---|
| Document ID | TM-001 |
| Version | generated 2026-09-21T01:07:58.651Z |
| Status | DRAFT — UNSIGNED — GENERATED, DO NOT EDIT |
| Generator | `scripts/validation/build-traceability.mjs` (`npm run validation:traceability`) |
| Sources | URS-001…006 requirement tables · RA-001 rows · docs/evidence/W3/2026-09-20/OQ-*/result.json · IQ/iq-results.json |

> This file is regenerated from the URS documents and the executed OQ results. Hand edits are overwritten. A requirement with no executed step reads **uncovered**; a requirement with any failed step reads **fail**; pass with deviations reads **partial**. Nothing here is a pass unless a step recorded a pass.

## Summary

- Requirements: **67** — pass 53 · partial 1 · fail 10 · open 3 · uncovered 0
- OQ steps executed: **90** — pass 73 · fail 12 · deviation 2 · not-executed 3
- IQ-001: 10 pass · 0 fail · 5 deviation (executed 2026-09-21T01:02:35.782Z)

| App | Requirements | Pass | Partial | Fail | Open | Uncovered |
|---|---|---|---|---|---|---|
| Projects | 9 | 8 | 0 | 1 | 0 | 0 |
| Vault | 10 | 8 | 0 | 2 | 0 | 0 |
| Authoring | 15 | 10 | 0 | 3 | 2 | 0 |
| Submission Center | 12 | 10 | 1 | 1 | 0 | 0 |
| Submission Readiness | 8 | 7 | 0 | 1 | 0 | 0 |
| QMS controlled documents | 13 | 10 | 0 | 2 | 1 | 0 |

## Protocol executions included

| Protocol | App | Executed | Pass | Fail | Deviation | Not executed | Evidence |
|---|---|---|---|---|---|---|---|
| OQ-003 | Authoring | 2026-09-21T01:05:19.359Z | 16 | 3 | 1 | 2 | `docs/evidence/W3/2026-09-20/OQ-AUTHORING/` |
| OQ-001 | Projects | 2026-09-21T01:02:36.322Z | 14 | 2 | 0 | 0 | `docs/evidence/W3/2026-09-20/OQ-PROJECTS/` |
| OQ-006 | QMS controlled documents | 2026-09-21T01:07:03.022Z | 13 | 2 | 0 | 1 | `docs/evidence/W3/2026-09-20/OQ-QMS/` |
| OQ-004 | Submission Center | 2026-09-21T00:23:17.145Z | 13 | 1 | 1 | 0 | `docs/evidence/W3/2026-09-20/OQ-SUBMISSION-CENTER/` |
| OQ-005 | Submission Readiness | 2026-09-21T01:05:45.948Z | 8 | 1 | 0 | 0 | `docs/evidence/W3/2026-09-20/OQ-SUBMISSION-READINESS/` |
| OQ-002 | Vault | 2026-09-21T01:04:33.310Z | 9 | 3 | 0 | 0 | `docs/evidence/W3/2026-09-20/OQ-VAULT/` |

## Matrix

| URS id | Requirement | Part 11 | Risk | CSA assurance (RA-001) | OQ steps (status) | Verdict |
|---|---|---|---|---|---|---|
| URS-PROJ-001 | Only an authenticated user of an organisation can read or create programs; an anonymous request is refused with 401/403 and no data. Interactive login is via `/concept2cure/login`; in a development install a Demo Access control may substitute the password factor and must be absent when `NODE_ENV=production`. | §11.10(d) | high | scripted | OQ-PROJ-01 (pass)<br>OQ-PROJ-02 (pass) | **pass** |
| URS-PROJ-002 | Program creation validates its inputs: `name` and `programType` are required, `programType` must be in the controlled vocabulary, and the product class is derived from the filing type and may not be contradicted by the client; invalid input is refused with 400 naming the field. | none | medium | scripted | OQ-PROJ-03 (pass)<br>OQ-PROJ-04 (pass) | **pass** |
| URS-PROJ-003 | A created program is persisted under the creating organisation with a UUID id, is listed for that organisation and readable by id, and the intake reports what else it created (scaffolded document, canonical submission). | none | high | scripted | OQ-PROJ-04 (pass)<br>OQ-PROJ-05 (pass) | **pass** |
| URS-PROJ-004 | Program creation is attributable: the activity feed shows who created it and when, the write is entered in the hash-chained audit log, and the organisation's audit ledger surface shows governed writes. | §11.10(e) | high | scripted | OQ-PROJ-06 (fail)<br>OQ-PROJ-06b (fail) | **fail** |
| URS-PROJ-005 | The Projects and Project Home surfaces render the organisation's programs and the open program without runtime errors. | none | medium | unscripted | OQ-PROJ-02 (pass)<br>OQ-PROJ-07 (pass)<br>OQ-PROJ-08 (pass) | **pass** |
| URS-PROJ-006 | A task can be created with a title, module and priority; it is persisted for the organisation, listed on the task board and its creation is written to the governed ledger. | §11.10(e) | medium | scripted | OQ-PROJ-09 (pass)<br>OQ-PROJ-10 (pass) | **pass** |
| URS-PROJ-007 | The Program Journey read model and the Filings Catalog surface answer honestly for a new organisation (empty state or explained unavailability; never fixture data, never a silent 500). | none | low | ad-hoc | OQ-PROJ-11 (pass)<br>OQ-PROJ-12 (pass) | **pass** |
| URS-PROJ-008 | With launch scope enforced, the navigation payload marks every out-of-catalog surface as not entitled with source `launch-scope`, the six launch apps are entitled, and a deep link to an out-of-catalog surface renders the "not in this release" gate rather than the surface. | §11.10(d) | medium | scripted | OQ-PROJ-13 (pass)<br>OQ-PROJ-14 (pass) | **pass** |
| URS-PROJ-009 | A program id that does not belong to the caller's organisation (or does not exist) answers 404 — never 200 with another tenant's data, never 500. | §11.10(d) | high | scripted | OQ-PROJ-15 (pass) | **pass** |
| URS-VAULT-001 | Vault read, search, download, ingest and filing endpoints require an authenticated organisation member; anonymous requests are refused. | §11.10(d) | high | scripted | OQ-VAULT-01 (pass) | **pass** |
| URS-VAULT-002 | Ingest accepts a multipart upload with `programId` (UUID of a program the organisation owns), `documentCode`, `documentTitle` and `documentType` from the controlled vocabulary, stores one `vault.documents` row with the file's SHA-256 (`contentHash`) and answers 201 with the document and its initial filing. | §11.10(e) | high | scripted | OQ-VAULT-03 (pass) | **pass** |
| URS-VAULT-003 | Ingest refuses a file whose extension is outside the allowed set (`.pdf .docx .doc .txt .rtf .xlsx .xls .csv .md`) and files over 50 MB with a 4xx and a message; nothing is stored. | none | medium | scripted | OQ-VAULT-02 (pass) | **pass** |
| URS-VAULT-004 | The program's vault read model lists every stored document under its folder tree with an honest `documentCount`; every field is derived from a stored column (no fabricated folders or counts). | none | medium | scripted | OQ-VAULT-04 (pass) | **pass** |
| URS-VAULT-005 | Search within a program finds documents by title/file name; an empty query is not treated as "match everything". | none | low | scripted | OQ-VAULT-05 (pass) | **pass** |
| URS-VAULT-006 | Download returns the stored bytes unchanged: the SHA-256 of the response body equals the `contentHash` recorded at ingest. | §11.10(e) | high | scripted | OQ-VAULT-06 (pass) | **pass** |
| URS-VAULT-007 | A person confirms the filing decision (folder, evidence kind, CTD section, note); the placement is recorded and audited; a folder from another modality's tree is refused, not stored. | §11.10(e) | high | scripted | OQ-VAULT-07 (pass) | **pass** |
| URS-VAULT-008 | Ingest and filing are written to the hash-chained audit log, the chain verifies after the writes, and the organisation's audit ledger surface shows them. | §11.10(e) | high | scripted | OQ-VAULT-08 (fail)<br>OQ-VAULT-08b (fail) | **fail** |
| URS-VAULT-009 | The Vault surface renders the program's data room with the stored documents, the upload control and the filing control. | none | medium | unscripted | OQ-VAULT-09 (fail) | **fail** |
| URS-VAULT-010 | A program the organisation does not own answers 404 on the vault read model; no cross-tenant listing. | §11.10(d) | high | scripted | OQ-VAULT-10 (pass) | **pass** |
| URS-AUTH-001 | Authoring endpoints require an authenticated actor; identity for every write comes from the verified JWT, never from a header or the body. | §11.10(d) | high | scripted | OQ-AUTH-01 (pass) | **pass** |
| URS-AUTH-002 | A document is created with a title (required, 400 otherwise), a module and an optional program binding (`client_program_id`, validated as UUID); a template that cannot be honoured refuses before anything is written. | none | medium | scripted | OQ-AUTH-02 (pass)<br>OQ-AUTH-03 (pass) | **pass** |
| URS-AUTH-003 | Sections are created under a document with a CTD code and title and are read back in filing order; duplicate codes and order ties are reported as structure issues. | none | medium | scripted | OQ-AUTH-04 (pass) | **pass** |
| URS-AUTH-004 | Editing a section with a reason for change writes a revision carrying the content SHA-256 and the author; a save against a stale `expectedUpdatedAt` is refused with 409 and nothing is overwritten. | §11.10(e) | high | scripted | OQ-AUTH-05 (pass)<br>OQ-AUTH-07 (pass) | **pass** |
| URS-AUTH-005 | The revision ledger of a section is a hash chain that the server can recompute from stored content and report intact or broken. | §11.10(e) | high | scripted | OQ-AUTH-06 (pass) | **pass** |
| URS-AUTH-006 | A section can be reverted to a chosen prior revision; the content is restored and the revert is itself recorded as a revision. | §11.10(e) | medium | scripted | OQ-AUTH-08 (pass) | **pass** |
| URS-AUTH-007 | A comment can be recorded on a section and listed under the document, attributed to the actor. | none | low | scripted | OQ-AUTH-09 (pass) | **pass** |
| URS-AUTH-008 | The document's audit trail lists every operation with type, actor, timestamp, reason and before/after content hashes. | §11.10(e) | high | scripted | OQ-AUTH-10 (pass) | **pass** |
| URS-AUTH-009 | Freezing a document stores an immutable snapshot with a content hash and a version; a frozen record is retrievable and hash-verified; a second freeze is refused. | §11.70 | high | scripted | OQ-AUTH-11 (fail) | **fail** |
| URS-AUTH-010 | An electronic signature requires the actor's PIN (a second component held only by the signer, enrolled and rotated only by the signer with the current PIN), a meaning from {AUTHOR, REVIEWER, APPROVER} and an intent; a wrong PIN answers 401 and an invalid meaning 400 with nothing stored; a valid signature stores signer, meaning, digest and the covered freeze version/hash and is listed with `pin_verified`. | §11.50 §11.70 §11.200 | high | scripted | OQ-AUTH-12 (pass)<br>OQ-AUTH-13 (not-executed)<br>OQ-AUTH-14 (not-executed) | **open** |
| URS-AUTH-011 | Only a role with signing authority may apply a signature (403 `ESIGNATURE_NO_AUTHORITY` otherwise). | §11.10(g) | high | scripted (positive only locally) | OQ-AUTH-14 (not-executed) | **open** |
| URS-AUTH-012 | AI drafting runs only through the governed gateway; with no provider configured the request fails closed with an error and never returns draft text; with a PQ-passed provider it returns a candidate for human acceptance with provenance. | none | high | scripted (fail-closed) / deviation (drafting) | OQ-AUTH-15 (fail)<br>OQ-AUTH-16 (deviation) | **fail** |
| URS-AUTH-013 | A review can be requested from named reviewers and the document submitted into an approval workflow whose steps name their approver; the document moves to IN_REVIEW; a reviewer sees the pending review on the Review surface and records a decision with a meaning. | §11.10(e) | medium | scripted | OQ-AUTH-17 (pass)<br>OQ-AUTH-17b (fail)<br>OQ-AUTH-20 (pass) | **fail** |
| URS-AUTH-014 | Template stores (organisation templates and the global regulatory reference store) answer; an empty organisation store is reported honestly. | none | low | ad-hoc | OQ-AUTH-18 (pass) | **pass** |
| URS-AUTH-015 | The Document Authoring and Review surfaces render the program's documents and the review board without runtime errors. | none | medium | unscripted | OQ-AUTH-19 (pass)<br>OQ-AUTH-20 (pass) | **pass** |
| URS-SUBC-001 | Submission endpoints require an authenticated actor holding the regulatory-author role; anonymous requests are refused. | §11.10(d) | high | scripted | OQ-SUBC-01 (pass) | **pass** |
| URS-SUBC-002 | Submission creation validates title, application type, client type and region against the controlled vocabularies (400 `VALIDATION` with field details otherwise) and records a §11.10(e) audit row whose outcome is reported to the caller. | §11.10(e) | high | scripted | OQ-SUBC-02 (pass)<br>OQ-SUBC-03 (pass) | **pass** |
| URS-SUBC-003 | A sequence is created under a submission with a region and a four-digit sequence number (`0000` …) and a type; it is listed with status `draft`. | none | high | scripted | OQ-SUBC-03 (pass) | **pass** |
| URS-SUBC-004 | A leaf is placed in a sequence by section code and a document reference; the document table must be a placeable leaf source (`vault_documents`, `coauthor_documents`, …) and anything else is refused at the write boundary with the allowed list. | none | high | scripted | OQ-SUBC-04 (pass) | **pass** |
| URS-SUBC-005 | Sequence status follows the lifecycle draft → assembling → validated → frozen → dispatched; a transition the state machine does not allow is refused and the status is unchanged. | none | high | scripted | OQ-SUBC-05 (pass) | **pass** |
| URS-SUBC-006 | `frozen` and `dispatched` cannot be reached through the generic transition endpoint (`GOVERNED_REQUIRED`); the governed endpoints require a `signatureActionId`. | §11.10(e) §11.200 | high | scripted | OQ-SUBC-06 (pass) | **pass** |
| URS-SUBC-007 | The governed `sign` action on a sequence is high-risk: it requires re-authentication (password, optionally TOTP), a reason of ≥ 8 characters and a target the organisation owns; without re-authentication it is refused and no action id, ledger pair or `electronic_signatures` row is created; with it, the signature and the chained ledger rows land in one transaction. | §11.50 §11.70 §11.200 | high | scripted (negative) / deviation (positive) | OQ-SUBC-07 (pass)<br>OQ-SUBC-08 (deviation) | **partial** |
| URS-SUBC-008 | The capabilities endpoint reports each agency gateway (ESG, CESP, …) as configured only when credentials exist; nothing is claimed as configured on an installation without them. | none | medium | scripted | OQ-SUBC-09 (pass) | **pass** |
| URS-SUBC-009 | The dossier map answers per-module (M1–M5) completeness for the program open in the shell. | none | medium | scripted | OQ-SUBC-10 (fail) | **fail** |
| URS-SUBC-010 | eCTD compile for a program answers with a spine/status or an explained refusal; it never answers 500. | none | medium | unscripted | OQ-SUBC-11 (pass) | **pass** |
| URS-SUBC-011 | The Submission Center, eCTD Compile and Publishing surfaces render the organisation's submissions and the open program's sequence. | none | medium | unscripted | OQ-SUBC-13 (pass)<br>OQ-SUBC-14 (pass) | **pass** |
| URS-SUBC-012 | Transmit requires a signature action id and a dispatched, gate-clear sequence; without a configured gateway it reports `transmitted:false` with the reason and never fabricates an acknowledgement. | §11.10(e) | high | scripted (negative) | OQ-SUBC-12 (pass) | **pass** |
| URS-SRDY-001 | Readiness endpoints require an authenticated regulatory author; anonymous requests are refused. | §11.10(d) | high | scripted | OQ-SRDY-01 (pass) | **pass** |
| URS-SRDY-002 | The dispatch-readiness assessment of a sequence is computed server-side from stored facts and returns numeric `validationErrors` and `unacknowledgedShadowCriticals`, the release-signature verdict and a `gate.cleared` boolean with the list of blockers; a never-validated, never-shadow-reviewed, unsigned sequence is not cleared. | none | high | scripted | OQ-SRDY-02 (pass) | **pass** |
| URS-SRDY-003 | Dispatch QC uses the server-side assessment for the sequence (client-supplied counts do not override it) and returns a deterministic QC record without a model in the decision path. | none | high | scripted | OQ-SRDY-03 (pass) | **pass** |
| URS-SRDY-004 | The `submission_readiness_review` orchestration template is registered with its five orchestrator-logic steps; execution validates that a project id is supplied. | none | medium | scripted | OQ-SRDY-04 (pass) | **pass** |
| URS-SRDY-005 | Executing the readiness review for a program starts an execution whose status and steps are readable. | none | medium | unscripted | OQ-SRDY-05 (pass) | **pass** |
| URS-SRDY-006 | A contradiction scan for a project returns a deterministic result (possibly zero findings) from the assumption and decision registries. | none | medium | scripted | OQ-SRDY-06 (pass) | **pass** |
| URS-SRDY-007 | The Dispatch Readiness surface shows the open program's newest sequence and its gate verdict — the sequence the user is working on, not another submission's. | none | high | scripted | OQ-SRDY-07 (fail) | **fail** |
| URS-SRDY-008 | The Orchestration and Inconsistency surfaces render; an unavailable store is shown as an error or empty state, never as data. | none | low | ad-hoc | OQ-SRDY-08 (pass) | **pass** |
| URS-QMS-001 | QMS endpoints require an authenticated organisation member; anonymous requests are refused. | §11.10(d) | high | scripted | OQ-QMS-01 (pass) | **pass** |
| URS-QMS-002 | A controlled document is created with a document number (unique per organisation — 409 on duplicate), title and a document type from the controlled vocabulary; invalid input answers 422 with field errors; creation records a §11.10(e) audit row whose outcome is reported. | §11.10(e) | high | scripted | OQ-QMS-02 (pass)<br>OQ-QMS-03 (pass)<br>OQ-QMS-04 (pass)<br>OQ-QMS-06a (pass) | **pass** |
| URS-QMS-003 | A new document is `draft` at version `1.0`, is listed for the organisation and readable by id; another organisation's document is not found. | none | medium | scripted | OQ-QMS-03 (pass) | **pass** |
| URS-QMS-004 | Approval moves a draft/in-review document to `effective`, stamps approver and approval time, sets the effective date, records an audit row, and is refused (409) for a document not in an approvable state. | §11.10(e) | high | scripted | OQ-QMS-05 (fail) | **fail** |
| URS-QMS-005 | Approval of a controlled document is an electronic signature: it verifies a credential the approver alone holds (PIN or password re-authentication), records the signature meaning, and is refused without them. | §11.50 §11.200 | high | scripted (negative) | OQ-QMS-06 (pass) | **pass** |
| URS-QMS-006 | Opening a revision requires a reason for change (422 otherwise), bumps the major version, returns the document to `draft`, clears the prior approval and records the reason in the audit trail. | §11.10(e) | high | scripted | OQ-QMS-07 (not-executed) | **open** |
| URS-QMS-007 | Retiring a document records the reason, the actor and the time; the document reads `retired`. | §11.10(e) | medium | scripted | OQ-QMS-10 (pass) | **pass** |
| URS-QMS-008 | A training acknowledgement is recorded against the document's current version with the method and an expiry, and the compliance report answers. | §11.10(e) | medium | scripted | OQ-QMS-08 (pass) | **pass** |
| URS-QMS-009 | The review-due report lists effective documents whose next review falls within the window and flags overdue ones. | none | low | scripted | OQ-QMS-09 (fail) | **fail** |
| URS-QMS-010 | Change control: a change record is raised with a number, title, classification and reason, listed and summarised. | §11.10(e) | medium | scripted | OQ-QMS-11 (pass) | **pass** |
| URS-QMS-011 | A Quality Management Plan is created with a name (≥ 3 chars) and listed for the organisation with status `draft`. | none | low | scripted | OQ-QMS-12 (pass)<br>OQ-QMS-15 (pass) | **pass** |
| URS-QMS-012 | The Quality surface renders the SOP register with the organisation's documents and the Change control tab; the QMP surface renders the organisation's plans. | none | medium | unscripted | OQ-QMS-14 (pass)<br>OQ-QMS-15 (pass) | **pass** |
| URS-QMS-013 | The server-curated quality-system template family is served. | none | low | ad-hoc | OQ-QMS-13 (pass) | **pass** |

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Prepared by (generator run by) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
