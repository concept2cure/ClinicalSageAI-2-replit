# Conversation-file adoption: bounded D4 handoff contract

Continue W3/D4 validation of the existing Projects → Data Room capture path.
This is not a new intake integration, extraction engine, store, or surface.

## Approved scope

1. The canonical upload reader and metadata filter must reject a storage path
   that names the caller's tenant in raw text but resolves outside that tenant's
   upload directory. Preserve legacy/unscoped access rules; foreign paths remain
   indistinguishable from missing uploads. This proves lexical resolved-path
   containment, not symlink or filesystem immutability guarantees.
2. `POST /api/c2c/projects/:id/adopt` must verify bytes through the canonical
   `loadUploadedFile`, require verified SHA-256, and recheck current upload
   identity and disposition eligibility inside its capture transaction.
3. Adoption must take the canonical disposition program lock before program
   row/write locks, and reserve impact tables in the established
   `cre_evidence_sources`, then `file_uploads` order before eligibility reads.
   This serializes the protected database handoff with same- and cross-program
   withdrawals. No independent-connection concurrency claim from mock tests.
4. Preserve organization/program mutation authorization, duplicate adoption,
   transactionally paired capture/audit, and the original upload. Missing
   checksum remains `409 FILE_IDENTITY_UNKNOWN`; loader failures map to safe
   `404` (unknown/foreign), `410` (bytes missing), `409` (integrity failure).
5. Successful adoption remains capture with extraction `pending`, not parsing,
   scientific qualification, curation, Vault filing, approval, or submission.

## Ownership and proof

- Ingestion worker: only `uploaded-file-access.ts`, its tenancy tests, and the
  resolved-path evidence receipt. No edits to the derivation implementation.
- Handoff worker: only the adoption route in `projects.ts`, dedicated adoption
  tests, and the adoption evidence receipt. A narrow approved extension to
  `findSourceByChecksum` accepts the existing `SourceExecutor` as an optional
  fourth argument so duplicate lookup uses the capture transaction. Preserve
  historical duplicate semantics; no new current-version policy. Use the
  existing reader/lock/audit implementations, not a parallel integrity checker.
- Control tower: review lock ordering, regression coverage, local lint/build,
  exact-source GitHub TypeScript/lint evidence, and direct canonical push. Own
  actual-SQL PGlite adoption tests and the existing founder-lineage fixture's
  upload/adoption working-directory alignment.

Both workers must demonstrate failing regressions before implementation, then
report exact passing commands and limitations. No worker commits or pushes.
No dependencies, migrations, baselines, hooks, approval/export gates, or client
surfaces change under this contract.
