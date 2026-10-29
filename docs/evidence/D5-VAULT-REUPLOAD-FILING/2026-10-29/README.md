# D5: a same-bytes re-upload says when its filing was not applied (Part 11 review F3, server half, 2026-10-29)

The Part 11 review of the Vault uploader (`docs/evidence/D2-VAULT-UPLOAD-METADATA/2026-10-22/README.md`) found two things.

- **F3, UI half (done 2026-10-22).** A same-bytes re-upload is told nothing was changed.
- **F3, server half (open until now).** "A same-bytes re-upload does not report a different folder, kind or section: `reuploadDiffers` compares title, type and classification only."

Since the uploader sends a folder, kind and CTD section per file (gap 7.1), a person could re-send a file the Vault holds into another folder. They were told "nothing changed", with no word that the folder they chose had been ignored.

## What already exists

- **What a re-upload may change.** `server/services/vault/vault-reupload.ts`, VR-05:
  - a same-bytes retry never changes title, type, classification or filing;
  - those change through Edit details (`vault-metadata-edit.service.ts`), and through Confirm or Move (`placeVaultDocument`), each with its own audit row;
  - write-once fields are recorded before and after as one `vault.document.reupload` row;
  - a value the retry asked for that differs from the record is reported back as `differs` and not applied. Until now that covered the three descriptive fields only.
- **The response.** `POST /api/vault/ingest` returns `reupload: { unchanged, changes, differs }` (`vault-ingest.service.ts`).
- **The client.** `useVaultUpload.ts` reads `differs` as one boolean, and the note says "Its title, type or classification is changed with Edit details". The same hook sends `folderId`, `evidenceKind` and `ctdSection` per file (`appendFileFields`).
- **Searches.** Run on `reuploadDiffers`, `differs`, `alreadyRecorded`, `Edit details, not by uploading`, `VR-05`. Deleted history (`git log --all --diff-filter=D` on `*reupload*`, `*Reupload*`): nothing.

## The change

- **`reuploadDiffers`** also compares `folder_id`, `evidence_kind` and `ctd_section` when the retry states them. None is applied, and the record and its audit trail are unchanged.
- **The upload note** keeps `differs` for the details. `filingDiffers`, present only when true, adds: "Its folder, kind or CTD section is changed with Move in its filing, not by uploading it again."

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | At trunk with the tests only. On real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`), a retry into another folder leaves the record as it was and reports `differs: []`; the upload note's case fails. |
| `02-green.txt` | The re-upload and ingest suites on PostgreSQL, 22/22; the upload hook and the staging list, 18/18. |
| `03-mutation.txt` | Three mutations, each caught: the folder is not compared; the note reads a filing difference as a details one; the note names no way to change the filing. |
