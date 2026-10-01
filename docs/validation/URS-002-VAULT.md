# URS-002 — User Requirements Specification: Vault

| Field | Value |
|---|---|
| Document ID | URS-002 |
| Version | 0.8 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 |
| Verified by | OQ-002 (`tests/validation/oq/vault/run.mjs`) |

**App:** Vault

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | Drafted from `server/routes/vault-ingest.ts`, `server/services/vault/vault-ingest.service.ts`, `server/routes/c2c/project-vault.ts`, `server/services/vault/vault-placement.service.ts`, `shared/constants/domain/vault-taxonomy.ts` and the `Vault` surface. |
| 0.2 | 2026-09-30 | `…01DiJJAk` (VR-08) | URS-VAULT-011, version check-in, verified by OQ-VAULT-11. Not yet executed: the run needs the validation identities (W3). |
| 0.3 | 2026-10-01 | `…01DiJJAk` (VR-09) | URS-VAULT-012, a document's versions, verified by OQ-VAULT-12. URS-VAULT-004 now says a document's versions count once. Not yet executed (W3). |
| 0.4 | 2026-10-01 | `…01DiJJAk` (VR-13) | URS-VAULT-013, review and approval of a Vault version with an e-signature, verified by OQ-VAULT-13 and OQ-VAULT-14. Not yet executed (W3). |
| 0.5 | 2026-10-01 | `…01DiJJAk` (VR-11) | URS-VAULT-014, filing captured sources from the data room into the Vault with a result for each, verified by OQ-VAULT-15. Not yet executed (W3). |
| 0.6 | 2026-10-01 | `…01DiJJAk` (VR-11b) | URS-VAULT-015, confirming suggested filings together with one reason, and the count awaiting confirmation, verified by OQ-VAULT-16. Not yet executed (W3). |
| 0.7 | 2026-10-01 | `…01DiJJAk` (critique 15) | URS-VAULT-016, comparing two versions of a document, verified by OQ-VAULT-17. Not yet executed (W3). |
| 0.8 | 2026-10-01 | `…01DiJJAk` (critique 15) | URS-VAULT-017, the library search across the organisation's projects, verified by OQ-VAULT-18. Not yet executed (W3). |

## 1. Intended use

The Vault is the program's document store: the regulatory user uploads source documents (protocols, CSRs, correspondence …) into a program, sees them in a CTD/DHF/TMF-structured data room, searches and downloads them, and files each one into a folder so that submission assembly can place it as an eCTD leaf. Bytes, hashes and filing decisions are the evidence a filing is built from.

## 2. Requirements

| URS id | Requirement | Part 11 | Risk | Source |
|---|---|---|---|---|
| URS-VAULT-001 | Vault read, search, download, ingest and filing endpoints require an authenticated organisation member; anonymous requests are refused. | §11.10(d) | high | `server/bootstrap/register-clinical-intel-routes.ts:187`, `register-inline-routes.ts:861` |
| URS-VAULT-002 | Ingest accepts a multipart upload with `programId` (UUID of a program the organisation owns), `documentCode`, `documentTitle` and `documentType` from the controlled vocabulary, stores one `vault.documents` row with the file's SHA-256 (`contentHash`) and answers 201 with the document and its initial filing. | §11.10(e) | high | `server/routes/vault-ingest.ts:60-63, 165-198`, `vault-ingest.service.ts:193` |
| URS-VAULT-003 | Ingest refuses a file whose extension is outside the allowed set (`.pdf .docx .doc .txt .rtf .xlsx .xls .csv .md`) and files over 50 MB with a 4xx and a message; nothing is stored. | none | medium | `server/routes/vault-ingest.ts:41-55` |
| URS-VAULT-004 | The program's vault read model lists every stored document under its folder tree with an honest `documentCount` (a document's versions are one document: URS-VAULT-012); every field is derived from a stored column (no fabricated folders or counts). | none | medium | `server/routes/c2c/project-vault.ts:26-33, 828-1137` |
| URS-VAULT-005 | Search within a program finds documents by title/file name; an empty query is not treated as "match everything". | none | low | `server/routes/c2c/project-vault.ts:1196-1300` |
| URS-VAULT-006 | Download returns the stored bytes unchanged: the SHA-256 of the response body equals the `contentHash` recorded at ingest. | §11.10(e) | high | `server/routes/c2c/project-vault.ts:1318` |
| URS-VAULT-007 | A person confirms the filing decision (folder, evidence kind, CTD section, note); the placement is recorded and audited; a folder from another modality's tree is refused, not stored. | §11.10(e) | high | `server/routes/c2c/project-vault.ts:1445-1500`, `vault-placement.service.ts` |
| URS-VAULT-008 | Ingest and filing are written to the hash-chained audit log, the chain verifies after the writes, and the organisation's audit ledger surface shows them. | §11.10(e) | high | `server/services/auditService.ts` (`writeChainedAuditRow`), `server/services/audit/chain.ts:182`, `server/routes/audit-trail-ledger.routes.ts:160` |
| URS-VAULT-009 | The Vault surface renders the program's data room with the stored documents, the upload control and the filing control. | none | medium | `client/src/concept2cure/v2/surfaces/Vault.tsx`, `useVaultUpload.ts` |
| URS-VAULT-010 | A program the organisation does not own answers 404 on the vault read model; no cross-tenant listing. | §11.10(d) | high | `server/routes/c2c/project-vault.ts:834-845` |
| URS-VAULT-011 | A new version of a document is recorded by naming the document (`supersedesDocumentId`). The server assigns the next major version (1.0 → 2.0), keeps the document code and filing, and links the predecessor. It refuses a version that is not the current one, bytes the document already holds, and a document outside the caller's program or organisation, and the database refuses a link outside the document's family. | §11.10(e) | high | `server/services/vault/vault-version-checkin.ts`, `vault-ingest.service.ts`, `migrations/20260930_vault_documents_version_lineage.sql` |
| URS-VAULT-012 | A document is listed once, at its current version, with how many versions it has. Every version of a document is listed newest first with its version, SHA-256, size, uploader and date, and each downloads hash-verified. The document's history carries the events of every version, each naming its version. Search lists current versions unless earlier ones are asked for. A predecessor link the lineage rule would refuse is shown as not linked, never as lineage. | §11.10(e) | high | `server/services/vault/vault-version-family.ts`, `server/routes/c2c/project-vault.ts` (`GET /:id/documents/:documentId/versions`), `client/src/concept2cure/v2/surfaces/VaultVersions.tsx` |
| URS-VAULT-013 | A Vault version is reviewed and approved on the document lifecycle, apart from its filing. Sending it for review starts one record per version, taking title, type and content hash from the stored version. The review and the approval are electronic signatures: the signer re-authenticates, states a reason, and the record holds the printed name, meaning and time, bound to the version's SHA-256. The uploader and whoever sent the version for review may neither review nor approve it, the reviewer does not approve it, and only the current version is approved. Approving a version supersedes the earlier approved versions of the same document in the same transaction. An approved version's details cannot be edited. A version counts as settled only when approved. | §11.10(e), §11.50, §11.70, §11.200 | high | `server/services/regulatory/vault-lifecycle-record.ts`, `server/routes/document-lifecycle.ts`, `server/services/vault/vault-lifecycle.ts`, `client/src/concept2cure/v2/surfaces/VaultLifecycle.tsx`, `migrations/20261001_canonical_documents_vault_version.sql` |
| URS-VAULT-014 | A person files captured sources from the project's data room into the Vault. Each source goes through the same governed ingest as a Vault upload and lands suggested or unfiled, never confirmed by the system. The answer names each source as filed (with its version and where it landed), already in the Vault (with its version), or refused with the reason. One source's refusal does not undo another's filing, and the batch reports that it is not complete. A source whose stored bytes no longer match the checksum recorded at capture is refused and nothing is stored. A viewer is refused. Another organisation's or another project's source is refused as not found. | §11.10(c), §11.10(d), §11.10(e) | high | `server/services/vault/vault-data-room-filing.ts`, `server/services/vault/vault-file-upload-to-vault.ts`, `server/routes/c2c/project-vault.ts` (`POST /:id/data-room/file`), `client/src/concept2cure/v2/surfaces/VaultDataRoomFiling.tsx` |
| URS-VAULT-015 | A person confirms the suggested filings in one folder together, with one reason for change that is required, and is recorded on each document's filing and in its own audit row. Each document is confirmed on its own. A document whose folder or status changed since the person loaded the list is refused, and not touched. The answer names each document, and the batch reports when not every filing was confirmed. The Vault shows how many suggested filings await confirmation, counted over the whole program. | §11.10(e) | high | `server/services/vault/vault-placement-batch.ts`, `vault-placement.service.ts` (`expected`), `server/routes/c2c/project-vault.ts` (`POST /:id/file-batch`, `awaitingConfirmationCount`), `client/src/concept2cure/v2/surfaces/VaultConfirmSuggested.tsx` |
| URS-VAULT-016 | Two versions of one document are compared: whether their bytes are the same (from the recorded SHA-256s), each recorded detail that differs, and the lines of their extracted text that changed, unchanged runs collapsed. A comparison that was capped says so. A version with no extracted text gets no text comparison and the answer names it. Versions of different documents are refused, and another organisation's document is not found. | none | medium | `server/services/vault/vault-version-compare.ts`, `server/routes/c2c/project-vault.ts` (`GET /:id/documents/:documentId/compare`), `client/src/concept2cure/v2/surfaces/VaultVersionCompare.tsx` |
| URS-VAULT-017 | A search across every project the organisation holds finds documents by title, file name and content, each named with its project, ranked, paginated with a real total, current versions unless earlier ones are asked for. Another organisation's documents are never among them. An empty query answers no results, and a failed search is reported as a failure, not as no matches. A project's own search still searches only that project. | §11.10(d) | medium | `server/services/vault/vault-search.ts`, `server/routes/c2c/project-vault.ts` (`GET /search`, `GET /:id/search`), `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx` |

## 3. Assumptions and constraints

- ClamAV scanning is bypassed when `CLAMAV_HOST` is unset (server log at boot); virus scanning is qualified on staging.
- Storage is the local provider on this installation; S3 object-lock retention is qualified with row D1/D6.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
