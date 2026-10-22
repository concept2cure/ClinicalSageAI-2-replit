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
  - each row offers the title, document type (defaulting to the header's type for files added next), classification and folder; the evidence kind and CTD section appear once a folder is chosen;
  - no version is offered: a new document is 1.0, and later versions are numbered by the Vault when they are added;
  - a blank field is not sent, so the Vault's default applies;
  - a file the Vault does not take, a hidden or system file, an empty file, or one over 50 MB is listed as not uploaded, with the reason;
  - a second file with the same name is flagged before it is sent, and a row whose path differs from its name says the folder it came from is not kept;
  - each row then says "Recorded as v1.0 · Module 3 · Quality, filed by you", "…, suggested, awaiting confirmation" or "… · Unfiled, needs a folder", or "Not recorded: <the server's reason>", or that the bytes were already recorded and nothing was changed;
  - a refused row can be removed, or tried again on its own.
- **The hook.** `useVaultUpload.ts` takes `fields` per file, appended only when given (the filing details only with a folder), and an `onFileStatus` callback.
  - It now reads the server's `placementStatus`, so a folder the person chose is said as their filing, both on the row and in the batch note ("Filed … as you chose"). It is no longer called "Auto-filed … suggested until confirmed".
  - Sequential upload and the 409 → new-version offer are unchanged.

## What the two reviews changed (2026-10-22)

The first commit (`cb472b8c0`) was reviewed independently for accessibility and for Part 11 UX and copy before it was pushed. Every blocker and most advisories are fixed in the second commit; `05-red-review-fixes.txt` shows its cases failing on the first.

- **Part 11 F1 (blocker): no client version.** A typed version under an existing file name would have recorded a second, unlinked version of that document. A non-numeric one would have stopped the Vault from numbering it later (`nextMajorVersion`, `vault-version-checkin.ts`). The field is gone, and the hook sends no version.
- **Part 11 F2: placement in words.** "Filed by you", "suggested, awaiting confirmation" and "Unfiled, needs a folder", where the row and the note had made no distinction and the note called the person's own filing a suggestion.
- **Part 11 F3 (UI half): a same-bytes re-upload says nothing was changed, including the details above.**
- **Part 11 F5 and accessibility A10: the header type picker is labelled for what it does** ("Document type for files added next").
- **Part 11 F6 and F8: copy.**
  - The duplicate-name warning says what actually happens.
  - Names are compared exactly, as the code is.
  - A row with a folder path says only the name is kept.
  - "No folder chosen: the Vault suggests one, or leaves it Unfiled".
  - One "Internal (default)".
  - "Close" once anything is recorded.
  - "Add files" and "Add a folder", because the header buttons choose and the panel records.
  - The not-read count is per drop or selection.
  - A hidden or system file, an empty file, and sizes to one decimal.
  - The cabinet's "filed under another view" group, which ingest refuses, is no longer offered as a folder.
- **Accessibility B1-B6:**
  - Each row is a group named by its file, with its status as the group's description.
  - Status is plain text, and one panel-level polite live region says what was added, what is uploading and what became of it.
  - Opening focuses the panel's heading, now a real `<h3>`.
  - Removing a row moves focus to the next row's Remove, or the previous one's, or the heading.
  - The Upload button stays mounted during an upload (`aria-disabled`), and focus moves to Close when it settles.
  - Closing returns focus to Add files.
  - Also from the review: wrapping paths instead of ellipsis, a visible disabled state, `role="list"`, and a drag border at `--accent-200`.
- **Non-a11y defects the accessibility review found:**
  - row keys are now serial, so a removed and re-added file cannot share a key;
  - the Data Room's zone reads folders only where folders are offered, so its behaviour, and the absence of a 500-file cap there, is unchanged.

## Evidence

| File | What it shows |
|---|---|
| `01-red-client.txt` | Trunk `32c2ec138`: the hook sends no per-file field and reports no per-file status; Vault has no drop zone or staged rows. 7 cases fail. |
| `02-green-client.txt` | Every client suite naming Vault, the upload hook, ProjectHome, the drop zone or Coverage: 63 files, 482 tests. |
| `03-mutation-client.txt` | The hook stops sending the folder, and so its kind and section: the two cases that assert it fail. |
| `04-green-db.txt` | Real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`), in two runs. |
| `05-red-review-fixes.txt` | The review-driven cases against the first commit `cb472b8c0`: 9 fail. |

In `04-green-db.txt`:
- A file sent through the route with its row's fields is recorded with exactly those, with placement `confirmed` and `placed_by` the uploader (`vault-ingest.dbtest.ts`, 15/15).
- The vocabulary refusals still hold (`vault-filing-vocabulary.dbtest.ts`, 6/6). It runs on a local recorded fixture database, `platform_ci_vault_fixture_local`, cloned from the migrated test database and re-migrated. The suite's guard admits that name pattern through `C2C_VAULT_LEGACY_FIXTURE_DATABASE`.

## What remains

- **The route accepts a client version unchecked** (Part 11 review F1, server half). `POST /api/vault/ingest` still takes `version` from an API caller. Under a code that already has versions, and without `supersedesDocumentId`, that records an unlinked sibling. The service cannot restrict the format, because eSTAR and authoring retain non-numeric versions through it. The route-level control (refuse a version for an existing code unless it is added as a new version) is its own slice.
- **A same-bytes re-upload does not report a different folder, kind or section** (F3, server half): `reuploadDiffers` compares title, type and classification only.
- **Who filed a document, and when, is stored but not shown** (F4). The read model returns no `placed_by` or `placed_at`.
- **No reason is captured at ingest** (F7). The review judged that correct for a first upload. If one is added, it goes in the ingest schema and audit row too.
- **Accessibility advisories not taken:**
  - the Data Room zone's name drops its explanatory sentence (A2, carried over unchanged);
  - fields are not marked invalid on a refusal (A3);
  - there is no "set for all rows" (A5);
  - reasons for disabled header buttons live in `title` (A9);
  - the CTD section is offered in every view.

- **Per-file byte progress** (MR-08 Stage 6 step 2, XHR at concurrency 2). Rows show queued, uploading, recorded or refused, but not a percentage.
- **Manifest import** (a spreadsheet of fields matched to files), connectors, metadata filters and saved views: gap 7's absent items.
- **Bulk export and preview:** MR-08 Stage 6 steps 3 and 4.
