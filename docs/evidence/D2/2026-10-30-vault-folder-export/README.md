# D2: export a Vault folder, verified, with an index, SHA256SUMS and its audit trail (MR-08 Stage 6 step 3, 2026-10-30)

`docs/work-orders/MR-08-vault-upload-safety-and-document-control.md` Stage 6, step 3; CAT1-14 (bulk export).

A regulatory team hands work over by folder. Module 3 goes to a CMC consultant, the clinical folder to a partner's diligence team, a module to an inspector who asked for it. Until now the Vault could hand over one file at a time, or a sealed data room's closing archive. There was no way to hand over "Module 3 as it stands today" without sealing the whole project.

## What already exists

Searches run, in client and server: `export`, `bulk export`, `vault_exports`, `exports/:exportId`, `openVaultArchive`, `vault-archive-builder`, `archive`, `SHA256SUMS`, `folder export`, `FolderExport`, `downloadBlob`, `X-Content-SHA256`. Deleted history (`git log --all --diff-filter=D`) under those names: nothing.

- **The archive builder** (`server/services/vault/vault-archive-builder.ts`, VR-20 part 1). It stages each document only when its bytes hash to the recorded SHA-256, holds one document in memory at a time, then writes `manifest.json`, `INDEX.txt`, attachments and `SHA256SUMS` into a ZIP on disk and hashes it. The work order's step 3 asks for this builder to be "built once". It was, for the seal. This change is its second caller.
- **The verified reader** (`readVerifiedVaultBytes`, through the route's `readSealedBytes`). It reads a stored file and compares it to its recorded hash. Every Vault download goes through it.
- **The seal's closing archive** (`GET …/seals/:sealId/archive`, `vault-seal-archive.ts`). It already did each step of a verified export for a seal:
  1. verify every file;
  2. stage it;
  3. list withdrawn files as withheld;
  4. write a chained audit row carrying the archive's SHA-256 before a byte is sent;
  5. send the archive with `X-Content-SHA256`.

  Its audit extract was private to the seal. It is now exported as `readArchiveAuditExtract`, and both archives call it.
- **The tree's rows** (`readSealDocumentRows`): the current, eligible version of every document, exactly as the Vault tree shows them, and the cabinet index numbers (`cabinetNumbers`). The export uses both, so it holds what the folder shows.
- **The seal's client download** (`VaultSeals.tsx`). It hashed the received archive and compared the result with `X-Content-SHA256`. That code moved into `vaultArchiveDownload.ts`, which the seal and the folder export now both call. The seal's wording is unchanged and its 10 tests pass.
- **Nothing exported a folder.** No route, no button, no table.

## What changed

| Piece | Where |
|---|---|
| `planFolderExport`: refuses a project not in this organisation (404), a folder the project's view does not have (404 `FOLDER_NOT_FOUND`) or a folder with no documents (409 `FOLDER_EMPTY`) before anything is read. Otherwise it returns the folder's rows, each with its storage address and whether its file is still available. `buildFolderExportContents`: the manifest (`vault-folder-export/1`), the index header and `audit/audit-trail.json`. | `server/services/vault/vault-folder-export.ts` (new) |
| `GET /api/c2c/project-vault/:id/folders/:folderId/export` runs these steps in order:<ol><li>plan the export;</li><li>stage each file through the verified reader, refusing the whole export (409 `EXPORT_FILE_UNVERIFIED`) on the first file that fails its hash, and naming that document;</li><li>list a disposition-withdrawn file as withheld, without reading it;</li><li>build the ZIP;</li><li>commit a chained `vault.folder.export` row with the archive's SHA-256, size, document ids and withheld count;</li><li>send.</li></ol>If the audit row cannot be written, the route returns 500 `AUDIT_WRITE_FAILED` and sends nothing. | `server/routes/c2c/project-vault.ts` |
| `readArchiveAuditExtract`, shared by the seal and the folder export. | `server/services/vault/vault-seal-archive.ts` |
| "Export <folder>" on a filing folder that has documents. It does not appear on the cabinet itself, on Unfiled, on the other view's folders or on an empty folder. The archive is saved only when it hashes to what the server recorded. A refusal is shown in the server's words, and nothing is saved. | `client/src/concept2cure/v2/surfaces/VaultFolderExport.tsx` (new), `Vault.tsx` |
| One verified-save path for every Vault archive. | `client/src/concept2cure/v2/surfaces/vaultArchiveDownload.ts` (new), `VaultSeals.tsx` |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | <ul><li>**Server, before this change, on real PostgreSQL 16 as `app_service` with `RLS_ENFORCE=on`:** the route does not exist. All 6 cases fail.</li><li>**Client:** with the export button taken out of `Vault.tsx`, there is no "Export Module 3 · Quality".</li></ul> |
| `02-green.txt` | <ul><li>**The export dbtest:** 6 of 6. The ZIP holds the folder's two current versions, not the superseded v1 and not module-5's CSR. Each file's SHA-256 equals `vault.documents.content_hash`, and `SHA256SUMS` covers every other entry. The audit trail holds those two documents' rows and not the CSR's. One `vault.folder.export` row carries the archive's SHA-256, and no staging directory is left behind.</li><li>**Who may export:** a viewer the project admits may.</li><li>**Refusals, each recording nothing:** another organisation naming this project gets 404; an unknown folder 404; an empty folder 409.</li><li>**Failures:** an audit failure sends nothing. A `keep_data` disposition is listed as withheld and not read. A tampered stored file refuses the whole export.</li><li>**The seal dbtest:** still green.</li><li>**Client:** 6 of 6.</li><li>**The Vault client, route and Vault-service suites:** 2,776 across 192 files. Two failed on the first run, and both were this change's. Each found the folder's name anywhere in the list, and the new "Export Module 5 · Clinical" button is a second match. Both now look in the breadcrumb, which their comments say they mean, and pass on rerun. The five other suites that render the Vault pass, 60 of 60.</li><li>**Type check:** `tsc` exits 0.</li></ul> |
| `03-mutation.txt` | Eight mutations, each caught by the case written for it:<ul><li>**Server:** the folder filter dropped; a withdrawn file read anyway; a hash failure skipped instead of refused; the archive sent without its audit row; an unknown folder admitted.</li><li>**Client:** Unfiled offered; an empty folder offered; the received file saved without comparing its hash.</li></ul> |

## Decisions recorded here

- **A synchronous, verified download, not the work order's queued job and `vault_exports` table.** FD10 decided the seal's archive as (c): download only, built from a staged and fully verified file. The folder export follows that decision, for three reasons:
  - **One trust model.** Both archives are built and checked the same way, so there is one format and one way to verify it.
  - **No copy at rest.** A job table means a finished archive sits in storage until someone downloads it. That copy is governed content outside the Vault, and it would need its own retention, legal-hold and disposition handling. Stage 5 just made holds and dispositions binding on the Vault itself. An archive that is built, sent and deleted leaves nothing to govern. The audit row keeps its SHA-256, so a recipient's copy can be verified against the record later.
  - **Nothing to build yet.** A queued build is needed only when a folder is too large to build within one request. The builder stages to disk and holds one document in memory at a time, so the queued variant would call the same `put`/`finish` loop from the sweep. It is left until a folder that large exists.
- **The selection is a folder, not an arbitrary list of version ids.** Teams hand over a CTD module or a filing folder, and the folder is what the tree shows, so the export holds what the person saw. A selection-based export would call the same staging loop with a different plan.
- **Anyone the project admits may export, as they may download each file.** An export reveals nothing a download does not. Every export is in the audit trail with the person, the folder and the archive's hash.
- **One file that fails its hash refuses the whole export**, and the refusal names that file. A partial hand-over that looks complete is worse than none.
- **`assertZipWithinLimits` is not applied.** It guards the inflation of an untrusted archive. This archive is built by the server from verified bytes, and nothing inflates it.

## Not done here

- Step 4, previews: it waits on the renditions decision in this work order.
- The queued variant, for a folder too large for one request: see above.
- VR-20 part 2, the tenant data return calling the same builder: it waits on a founder decision about the released D6 lane.
