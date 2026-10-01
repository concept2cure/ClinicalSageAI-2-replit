# VR-11a: File into Vault from the data room, with a result for every source (row D2)

**Plan item:** VR-11, first half (`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`). **Date:** 2026-10-01.
**Depends on:** VR-04, VR-05, VR-10 and VR-16 (all done).
**Founder decision:** none. FD11 is only the confirmation that the AnA catalog toggle does not govern a
person's filing. This route does not read `ana.document_catalog`, and neither toggle was changed.
**Second half (VR-11b, not in this change):** "Confirm N suggested" with one written reason, and the
program-wide "awaiting confirmation" count.

## The finding

The data room's capture lane dead-ended. A captured source reached "Filed" only if someone uploaded
identical bytes again on the Vault page. AnA's `file_chat_upload_to_vault` could file an upload, but it
is refused while `ana.document_catalog` is off, which is the default. Its orchestration (load the upload,
admit it through the governed ingest) was private to that tool, so a second caller would have meant a
second copy.

## The change

| Piece | File |
|---|---|
| **One upload-to-Vault orchestration.** `fileUploadIntoVault` does three things. It loads the upload. It refuses bytes that no longer hash to the checksum recorded at capture (`SOURCE_BYTES_CHANGED`), before anything is stored. It admits the rest through `ingestVaultDocument`. AnA's tool now calls it; its private copy and `derivedDocumentCode` moved there. | `server/services/vault/vault-file-upload-to-vault.ts`, `server/services/ana/document-catalog-tools.ts` |
| The upload reader's errors carry a code (`UPLOAD_NOT_FOUND`, `UPLOAD_BYTES_MISSING`, `UPLOAD_INTEGRITY_FAILED`). The messages are unchanged. The shared function returns them as refusals, so AnA now relays a refusal instead of a thrown message. | `server/services/ana/uploaded-file-access.ts` |
| **The data-room filer.** It takes 1–25 source ids and checks that the program is the caller's. Each source is then refused, reported as already in the Vault, or filed, in the order asked and each in its own ingest transaction:<br>• **refused:** another organisation's or another project's source is `NOT_FOUND`; a superseded capture is `SOURCE_SUPERSEDED`; a source with no stored file is `NO_STORED_FILE`.<br>• **already filed:** its checksum is already in the program's Vault.<br>• **filed:** without a folder, so the classifier proposes one and it lands suggested or unfiled, never confirmed.<br>An unexpected failure on one source is that source's `FILING_FAILED`. `complete` is false whenever any source was refused. | `server/services/vault/vault-data-room-filing.ts` |
| The data room's "filed" join (`readFiledAs`) moved into that module. The room's stage and the filer now ask the same question the same way. | `server/routes/c2c/project-vault.ts` |
| `POST /api/c2c/project-vault/:id/data-room/file`, behind `requireEditorAccess` like the other Vault writes. A viewer is refused before any source is read. | `server/routes/c2c/project-vault.ts` |
| Source lookup: `resolveSourceUploadIds` now reads through `readSourceUploads`, which also gives the filer each source's own row (organisation, project, current, checksum, upload). There is one query, not two. | `server/services/clinical-regulatory-evidence/evidence-spine.service.ts` |
| **The data room in the Vault.** Each source not yet filed has a checkbox. "Select N not yet filed" and "File N into Vault" act on the selection. The answer lists every source: filed as v1.0 and where it was suggested, already in the Vault (as which version), or not filed with the reason. A partial batch says "Not every file was filed". A refused request says "Nothing was filed" and why. A dropped connection says the outcome is not known. The Vault is read again after anything was filed. | `client/src/concept2cure/v2/surfaces/VaultDataRoomFiling.tsx`, `Vault.tsx`, `styles/misc-surfaces-v2.css` |
| URS-VAULT-014, OQ-VAULT-15 (with its runner step), RA-001 v0.12, TM-001 rebuilt | `docs/validation/`, `tests/validation/oq/vault/run.mjs` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-data-room-file.dbtest.ts`: PostgreSQL as `app_service` with RLS on, through the real routes and the real ingest. The scanner is mocked for one marked file only. | `red/db-data-room-file.txt`: 6 of 6 fail on trunk's server code (no route). | 6 of 6. `[new bytes, bytes already in the Vault, another org's source]` answers `[filed, already_filed, refused NOT_FOUND]` with `complete:false`. Exactly one row is added, suggested or unfiled, with one `vault.document.ingest` row naming the person. The room then reads the source "filed as 1.0", and a second filing changes nothing. An antivirus refusal on source 2 leaves source 1 filed. Changed bytes are refused `SOURCE_BYTES_CHANGED` with nothing stored. A viewer gets 403 with nothing filed. Superseded, other-project and no-file sources are each refused with their own code. An empty or oversized selection is 400. |
| The same suite against two mutants | `red/mutation-bytes-check.txt`: with the checksum check disabled, the changed-bytes case fails. `red/mutation-project-scope.txt`: with the project scope dropped, the other-project case fails. | as above |
| `server/routes/__tests__/vault-data-room-file.test.ts`: a scanner 503 on source 2, a throw on one source, a viewer, and a source guard | `red/route-and-guard.txt`: 6 of 6 fail on trunk. The guard finds two modules that both load an upload and admit it. | 6 of 6. Source 1 is filed and source 2 refused `FILE_SCAN_UNAVAILABLE`, `complete:false`. A throw is that source's `FILING_FAILED`. A viewer gets 403 with no source, file or query read. `vault-file-upload-to-vault.ts` is the only module that both loads an upload and admits it, and both callers call it. |
| `client/src/concept2cure/v2/__tests__/vaultDataRoomFile.test.tsx` | `red/client.txt`: 5 of 8 fail with trunk's `Vault.tsx`. The 3 copy-function cases pass. | 8 of 8 (`green/route-guard-client.txt`) |
| Regression: AnA's catalog and filing tools, uploads, sources, data room, Vault, chat upload, project routes | — | 307 files, 4005 tests (unit). DB: 22 files, 170 tests (`tests/db/vault-*`, `upload-integrity-check`, `document-catalog-*`, `cre-*`). The PGlite source-identity suite now applies `20260829_cre_source_versioning.sql`, because the shared source reader selects `is_current`, which every deployed database has. |

Also green:
- Gates: `ci:launch-scope-api`, `ci:check-client-api-calls`, `ci:undefined-css-classes`,
  `ci:internals-in-copy`, `ci:action-overclaim`, `ci:success-before-ok`, `ci:design-system`,
  `ci:ana-surface-context`, `ci:fixture-fallback`, `ci:unauthenticated-fetch`,
  `ci:tenant-isolation:no-regression`, `ci:runtime-ddl`, `ci:vault-document-writers`,
  `ci:column-reachability`, `ci:unkeyed-request-tables`, `audit-requestdb-coverage --strict-no-regression`.
- Validation: `ci:validation-traceability` and its selftest.
- `tsc`.
- Lint: no changed file gained a warning. `project-vault.ts` went from 9 to 7, and the new files have none.

`ci:tenant-entry-points` is red on trunk for three `server/jobs` files this change does not touch. They
changed in `4b1583a2c` (lane `…01GSjEDJ`, today); handed to that lane.

The full DB tier result is in `green/db-tier.txt`.

## Limits, stated

- **The ingest's audit row does not name the data-room source.** The link from source to document is the
  checksum, which VR-16 made write-once. A `data_room.file` event naming both is the provenance gap the
  plan's critique 14 already lists for the capture side.
- **A capture with no recorded checksum is refused.** Its bytes cannot be shown to be the ones captured,
  and refusing fails closed. Such a capture has to be captured again.
- **The document type is recorded as OTHER, and the title comes from the file name.** The data room
  records neither, and a Vault upload without a choice does the same. Both are changed with Edit details.
- **At most 25 sources per request.** Each one is a full ingest: scan, extract, classify.
- **OQ-VAULT-15 is written but not executed.** It runs with the other OQ-002 steps in W3.
