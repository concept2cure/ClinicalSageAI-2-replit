# URS-002 — User Requirements Specification: Vault

| Field | Value |
|---|---|
| Document ID | URS-002 |
| Version | 0.1 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 |
| Verified by | OQ-002 (`tests/validation/oq/vault/run.mjs`) |

**App:** Vault

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | Drafted from `server/routes/vault-ingest.ts`, `server/services/vault/vault-ingest.service.ts`, `server/routes/c2c/project-vault.ts`, `server/services/vault/vault-placement.service.ts`, `shared/constants/domain/vault-taxonomy.ts` and the `Vault` surface. |

## 1. Intended use

The Vault is the program's document store: the regulatory user uploads source documents (protocols, CSRs, correspondence …) into a program, sees them in a CTD/DHF/TMF-structured data room, searches and downloads them, and files each one into a folder so that submission assembly can place it as an eCTD leaf. Bytes, hashes and filing decisions are the evidence a filing is built from.

## 2. Requirements

| URS id | Requirement | Part 11 | Risk | Source |
|---|---|---|---|---|
| URS-VAULT-001 | Vault read, search, download, ingest and filing endpoints require an authenticated organisation member; anonymous requests are refused. | §11.10(d) | high | `server/bootstrap/register-clinical-intel-routes.ts:187`, `register-inline-routes.ts:861` |
| URS-VAULT-002 | Ingest accepts a multipart upload with `programId` (UUID of a program the organisation owns), `documentCode`, `documentTitle` and `documentType` from the controlled vocabulary, stores one `vault.documents` row with the file's SHA-256 (`contentHash`) and answers 201 with the document and its initial filing. | §11.10(e) | high | `server/routes/vault-ingest.ts:60-63, 165-198`, `vault-ingest.service.ts:193` |
| URS-VAULT-003 | Ingest refuses a file whose extension is outside the allowed set (`.pdf .docx .doc .txt .rtf .xlsx .xls .csv .md`) and files over 50 MB with a 4xx and a message; nothing is stored. | none | medium | `server/routes/vault-ingest.ts:41-55` |
| URS-VAULT-004 | The program's vault read model lists every stored document under its folder tree with an honest `documentCount`; every field is derived from a stored column (no fabricated folders or counts). | none | medium | `server/routes/c2c/project-vault.ts:26-33, 828-1137` |
| URS-VAULT-005 | Search within a program finds documents by title/file name; an empty query is not treated as "match everything". | none | low | `server/routes/c2c/project-vault.ts:1196-1300` |
| URS-VAULT-006 | Download returns the stored bytes unchanged: the SHA-256 of the response body equals the `contentHash` recorded at ingest. | §11.10(e) | high | `server/routes/c2c/project-vault.ts:1318` |
| URS-VAULT-007 | A person confirms the filing decision (folder, evidence kind, CTD section, note); the placement is recorded and audited; a folder from another modality's tree is refused, not stored. | §11.10(e) | high | `server/routes/c2c/project-vault.ts:1445-1500`, `vault-placement.service.ts` |
| URS-VAULT-008 | Ingest and filing are written to the hash-chained audit log, the chain verifies after the writes, and the organisation's audit ledger surface shows them. | §11.10(e) | high | `server/services/auditService.ts` (`writeChainedAuditRow`), `server/services/audit/chain.ts:182`, `server/routes/audit-trail-ledger.routes.ts:160` |
| URS-VAULT-009 | The Vault surface renders the program's data room with the stored documents, the upload control and the filing control. | none | medium | `client/src/concept2cure/v2/surfaces/Vault.tsx`, `useVaultUpload.ts` |
| URS-VAULT-010 | A program the organisation does not own answers 404 on the vault read model; no cross-tenant listing. | §11.10(d) | high | `server/routes/c2c/project-vault.ts:834-845` |

## 3. Assumptions and constraints

- ClamAV scanning is bypassed when `CLAMAV_HOST` is unset (server log at boot); virus scanning is qualified on staging.
- Storage is the local provider on this installation; S3 object-lock retention is qualified with row D1/D6.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
