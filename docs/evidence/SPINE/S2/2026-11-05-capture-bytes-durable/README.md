# S2: a Data Room upload's bytes survive a deploy and are readable from every API task (LX-02, the bytes half)

**Spine step 2, the data room** (`docs/design/ONE_DESIGN_PLAN.md` §1a): "Each item is immutable once captured …
Its lineage … is kept in perpetuity." **Committed under `Plan: F1`**, because the defect is in shipped behaviour
and the change spans the upload route, the AnA upload loader and a migration, which no single S package's ledger
paths cover. The spine step it serves is S2's. Session `session_01QoxbLcnW5jPvJSjjKQtvTA`, 2026-11-05.

## The defect, in production

Every upload (a Data Room drop, AnA's paperclip, an edited workbook, an editor figure) wrote its bytes **only** to
`process.cwd()/uploads/org-<id>/<fileId>`, the serving task's own container disk:

- `terraform/stack/main.tf` runs the API on Fargate with `STORAGE_PROVIDER=s3`, and `api_max_count` is 2;
- `terraform/modules/ecs-fargate/main.tf` mounts no volume, and `Dockerfile.optimized` says the server creates
  `uploads/` under `/app` at run time.

So a file uploaded through one task could not be read through the other. Every deploy then erased every upload's
bytes, while its `file_uploads` and `cre_evidence_sources` rows kept a checksum that nothing could be verified
against again. The loader already had the message for it: "its bytes are no longer available — ask the user to
re-upload the file". This is finding DR-ANA-11, hop A1 of `docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md`, and
it was the walk's first baselined gap, `capture/bytes-durable`.

## What already exists (RULE 3)

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The upload route | `server/routes/chat/upload.ts` | Scans, checks the project, stores the bytes, records `file_uploads` and the source identity. Since 2026-10 a failed write refuses with 503. | It stored the bytes only on the task's disk. |
| The one upload loader | `server/services/ana/uploaded-file-access.ts` (`loadUploadedFile`) | Resolves an upload id to bytes for 30 callers, including Data Room processing (`clinical-regulatory-evidence/data-room-processing.ts:313`), Vault admission, editor figures and AnA's document tools. It enforces tenancy by the org column and the `uploads/org-<id>/` key, and verifies the SHA-256. | It read only `fs.readFile(cwd/storage_path)`. |
| Derived uploads | the same file: `saveDerivedUpload`, `saveAuthoringImageAssociation`, `saveSpreadsheetDerivation` | Writes edited workbooks and editor figures as new uploads, with capture and audit in one transaction. | The same local-only write. |
| The byte store | `server/services/storage/` (`getStorageProvider`, `getStorageProviderFor`, local and S3 providers) | Tenant-scoped, integrity-checked object storage. Vault ingest and rendered leaves already use it (`server/services/ectd/rendered-leaf-files.ts`). | Uploads never used it. |
| The tenancy key | `storage_path` = `uploads/org-<id>/<fileId>` | Pinned as `cre_evidence_sources.stored_artifact_ref` by the processing store (`data-room-processing-store.ts:63`) and sweep, and checked by disposition (`document-data-disposition/impact.ts:68`, `recorded-lineage.ts:117`). | — (kept unchanged) |
| Path-based AnA tools | `server/services/ana/document-workspace.ts` | Confine model-supplied paths to `uploads/org-<id>/…` and hand them to Python and LibreOffice workers. | They need a file on the task's disk. |
| The walk | `tests/lineage/founder-path-lineage.*` | LX-00: project → agency by recorded keys, with a shrink-only baseline. | — |

Searches run: `storage_path` across `server/`; `readFile(…storage_path|storagePath|uploads)`;
`uploads/org-`; `readLocalUploadBuffer` (it serves `ctd_onboarding_documents`, a different store, which is out of
this change); `loadUploadedFile(` callers (30); `CREATE TABLE … file_uploads` in fixtures (8);
`git log --diff-filter=D` was not needed, since nothing was removed.

## The change

1. **`migrations/20261105_file_uploads_durable_object.sql`** (in `C2C_MIGRATION_FILES` before the isolation tail)
   adds two nullable columns, `file_uploads.storage_provider` and `storage_object_id`. It is additive and
   `IF NOT EXISTS`, with no table, constraint or DROP.
2. **`server/services/ana/upload-object-store.ts`**, split from `uploaded-file-access.ts` inside its own folder
   (RULE 6), holds:
   - `putUploadObject`, which refuses when the store records other bytes than it was given;
   - `discardUploadObject`;
   - `readUploadObject`, which answers missing, integrity failure and store unavailable separately;
   - `durableOrganizationId`, one rule shared by the route and the derived writers.
3. **Writers.** Each of the four puts an organization's bytes in the byte store **first**, then writes the task's
   working copy at `storage_path` (kept for the path-based tools: zero capability loss), then records the provider
   and object in its `file_uploads` INSERT. A failure before commit removes both copies. After an ambiguous COMMIT
   both are kept, as the working copy already was.
4. **The reader.** `loadUploadedFile` reads the recorded object when a row has one. Otherwise it reads the local
   path as before: rows written before this, and uploads with no organization. The SHA-256 check against
   `checksum_sha256` then runs on whichever bytes were read. A store that cannot be read now is
   `UPLOAD_STORE_UNAVAILABLE`, never reported as missing. The two places that map every code to an HTTP status
   answer it with 503: project adoption (`server/routes/c2c/projects.ts`) and filing an upload to the Vault
   (`server/services/vault/vault-file-upload-to-vault.ts`). The typecheck found both. Data Room processing already
   treats an unknown code as `retryable_failure`.
5. **The walk's check** follows recorded keys: source → upload by `stored_artifact_ref = storage_path` →
   provider and object, read from a fresh provider instance. It then reads the upload as another task would: with
   the working copy parked and `cwd` pointed where the copy was (so a fallback would find it if the loader took
   one), through `loadUploadedFile`. The baseline entry is removed and the ceiling lowered from 15 to 12, the size
   the baseline now has.

## Evidence

- `01-red-without-fix.txt`: the walk with the two production files reverted: `capture/bytes-durable FAILS and is
  not baselined … observed null`.
- `02-green-with-fix.txt`: with the fix, `green bytes-durable`, 15 of 15.
- `03-running-app.json`: the running app (dev server, PostgreSQL 16 with the full migration set applied). A
  conversation file was uploaded; its record names its object (`storage_provider` local, `storage_object_id`). The
  server's working copy at `storage_path` was deleted, as a redeploy or the other task would leave it. Adopting the
  file into a project then answered 201, processing completed, and the Data Room lists it extracted with its
  original available. An upload written the old way (no object recorded), with its working copy deleted, answered
  410: "The file bytes are no longer available".
- Affected suites (89 files that reach the route, the loader, the derived writers or the eight `file_uploads`
  fixtures): 1,590 passed, 12 failed. All 12 are `server/routes/__tests__/authoringSelectedSources.pglite.test.ts`,
  which fails identically at trunk without this change.
- New cases in `server/routes/__tests__/chat-upload-durability.test.ts`:
  - the store refusing the bytes refuses the upload before the disk, metadata or capture;
  - the store recording other bytes refuses it;
  - a disk failure after the store took the bytes removes the object.

  `derived-spreadsheet-capture.test.ts`: a rolled-back derivation removes only its new object, and an ambiguous
  COMMIT removes nothing.

## What this does not do (still open)

- **Existing rows.** Uploads written before this have no object recorded, and their bytes may already be gone in
  production. They read as before. Nothing can backfill bytes that were erased.
- **The rest of LX-02.** The route's five writes are still not one transaction. Program-scoped dedupe (VR-10 of
  the Veeva parity plan) is not done. The client still drops `sourceId` (`client/src/concept2cure/hooks/useChatUpload.ts`).
- **Path-based tools on the other task.** A path-based AnA tool (`document-workspace.ts`) reading an upload that
  the other task received, or one received before a deploy, still finds no working copy. Writing the copy back from
  the byte store on such a read is the follow-up. The id-based tools, and every reader through `loadUploadedFile`,
  are durable now.
- **`ctd_onboarding_documents`** (`server/routes/ctd-onboarding.ts`, read by `readLocalUploadBuffer` in
  `server/services/ectd/`) is a separate local-disk store with the same class of defect. It is not changed here.
