# D2: the Vault uploader says what each file is before it is recorded (2026-10-22)

Gap 7, work item 1 of `docs/design/VEEVA_GAP_2026-10-22.md`: "Fix the uploader: folder, drop zone, per-row metadata, sending what ingest accepts." This completes MR-08 Stage 6 steps 1 and 2 (`docs/work-orders/MR-08-vault-upload-safety-and-document-control.md`), except byte-level progress. It is a fix to the existing upload path, not a second one. Launch row **D2** (Vault in the launch catalog).

## What already exists

- **The route.** `POST /api/vault/ingest` (`server/routes/vault-ingest.ts`, `IngestBodySchema`) already accepts, per file, these fields; `vault-ingest.service.ts` handles them:
  - `documentTitle`, `documentType`, `version`, `classification`, `folderId`, `evidenceKind` and `ctdSection`;
  - a folder the uploader names is checked against the program's taxonomy and recorded as `confirmed`, `placed_by` the uploader;
  - the evidence kind and CTD section are written only with a named folder, and are checked against `VAULT_DOC_KINDS` and the CTD code rules (`filingVocabularyRefusal`);
  - without a folder, the classifier records a `suggested` placement or leaves the file `unfiled`.
- **The uploader.** `useVaultUpload.ts` is the one upload path, used by Vault, the MDX Document vault and the MDX pathway attach.
  - Every file of a batch was sent with one document type and a title made from its file name.
  - Version, classification, folder, evidence kind and CTD section were never sent.
- **The Vault surface.** `Vault.tsx` uploaded the moment files were chosen, through a hidden `<input multiple>`. There was no drop target, no folder upload, and no per-file fields.
- **The one drop zone that existed.** The Data Room's, written inline in `ProjectHome.tsx`. MR-08 Stage 6 step 1 names it as the one to extract and share.
- **The folder choices.** `cabinetFolders` in `Vault.tsx` holds the program's dossier folders from the server's read model, which the Move-to picker already offers.
- **Deleted, none reachable or on this route.** `git log --all --diff-filter=D` on `*Upload*`, `*Dropzone*`, `*DropZone*` and `*Uploader*` finds these:

  | File | Deleted in | What it did |
  |---|---|---|
  | `DossierUploadClassifier.tsx` | `8ba28dc0d`, zero importers | Per-file CTD section and classification, against the retired `/api/concept2cure/documents/upload` |
  | `DocumentUploadZone.tsx` | `54142cf0b` | Uploaded to `/api/client-intelligence/documents/upload` |
  | `knowledge/DocumentUploader.tsx` | `e5a74a4df` | — |
  | `DropzoneUpload.jsx` | `7a144fd1e` | — |

  None of the four had folder upload, and none posted to Vault ingest.

## The change

- **One drop zone.** `client/src/concept2cure/v2/FileDropZone.tsx` gathers what is chosen or dropped, each file with its path:
  - it reads files and folders, a dropped folder through the browser's entry API and a chosen one through `webkitdirectory`;
  - it stops at 500 files and says how many it did not read;
  - two modes: the whole zone is the button (the Data Room, unchanged for its users and tests), or the zone is a labelled drop group whose own buttons choose files or a folder (Vault), so no control sits inside a button.
  - The Data Room now uses it, and its inline copy is gone.
- **Staged rows.** `VaultUploadStaging.tsx` shows one row per gathered file before anything is sent:
  - each row offers the title, document type (defaulting to the batch type), version, classification and folder; the evidence kind and CTD section appear once a folder is chosen;
  - a blank field is not sent, so the Vault's default applies;
  - a file the Vault does not take, a system file, or one over 50 MB is listed as not uploaded, with the reason;
  - a second file with the same name is flagged before it is sent;
  - each row then says "Recorded as vN · folder", "Not recorded: <the server's reason>" or "Already in the Vault", and a refused row can be tried again on its own.
- **The hook.** `useVaultUpload.ts` takes `fields` per file, appended only when given (the filing details only with a folder), and an `onFileStatus` callback. Sequential upload, the per-file outcome note and the 409 → new-version offer are unchanged.

## Evidence

| File | What it shows |
|---|---|
| `01-red-client.txt` | Trunk `32c2ec138`: the hook sends no per-file field and reports no per-file status; Vault has no drop zone or staged rows. 7 cases fail. |
| `02-green-client.txt` | Every client suite naming Vault, the upload hook, ProjectHome, the drop zone or Coverage: 63 files, 482 tests. |
| `03-mutation-client.txt` | The hook stops sending the folder, and so its kind and section: the two cases that assert it fail. |
| `04-green-db.txt` | Real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`), in two runs. |

In `04-green-db.txt`:
- A file sent through the route with its row's fields is recorded with exactly those, with placement `confirmed` and `placed_by` the uploader (`vault-ingest.dbtest.ts`, 15/15).
- The vocabulary refusals still hold (`vault-filing-vocabulary.dbtest.ts`, 6/6). It runs on a local recorded fixture database, `platform_ci_vault_fixture_local`, cloned from the migrated test database and re-migrated. The suite's guard admits that name pattern through `C2C_VAULT_LEGACY_FIXTURE_DATABASE`.

## What remains

- **Per-file byte progress** (MR-08 Stage 6 step 2, XHR at concurrency 2). Rows show queued, uploading, recorded or refused, but not a percentage.
- **Manifest import** (a spreadsheet of fields matched to files), connectors, metadata filters and saved views: gap 7's absent items.
- **Bulk export and preview:** MR-08 Stage 6 steps 3 and 4.
