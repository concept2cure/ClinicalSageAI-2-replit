# A seal's closing archive (VR-20, part 1), 2026-10-29

`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` VR-20. FD10 is decided as (c): download only, built from a staged and fully verified file, and the tenant data return calls the same builder so the return carries bytes. MR-08 Stage 6 step 3 names the same builder (`server/services/vault/vault-archive-builder.ts`) for a bulk export of a selection, "later the seal will call the same builder". This change is part 1: the builder, and a seal's archive. Part 2, the tenant data return calling it, edits the released D6 lane's `tenant-full-export.service.ts` and is its own change.

**Veeva capability:** a data room's closing archive; the Submissions Archive export. **User outcome:** for a seal, a person the project admits downloads one ZIP holding:

- every sealed document's original bytes, at an index-ordered path;
- `manifest.json`: the seal, its manifest exactly as signed, and each file's path and SHA-256;
- `INDEX.txt`, a printable index;
- `SHA256SUMS` over every other file;
- `audit/audit-trail.json`: the chained audit rows of the seal and of each sealed version, with the chain's verdict at export.

The archive is built and verified in full before any byte is sent. If a document is no longer recorded, is recorded with a different hash than the seal's, or its stored file cannot be read or does not match, the request is refused with the list, and nothing is sent.

## What already exists

Searches run: `archiver`, `zip`, `archive`, `export`, `SHA256SUMS`, `manifest.json`, `bulk export`, `closing` across `server/` and `client/src`. Deleted history: `git log --all --diff-filter=D` on `*archive*builder*`, `*[Bb]ulk[Ee]xport*`, `*vault*export*` finds nothing.

- **No Vault archive or bulk export exists.**
- **Zip builders that are not this:**
  - The universal packager (`server/services/universal-packager.ts`) builds a document's HTML, JSON and attachments into a ZIP, in memory, with `archiver`.
  - The eCTD packager (`package-leaf-bytes.ts`) builds a submission sequence.
  - CER and eSTAR exports build their own packages.
  - None reads Vault versions through the verified reader, and none verifies a seal.
- **`server/services/audit/audit-archive.service.ts`** moves audit rows to cold storage. It is not a download.
- **Pieces this extends, each called and not copied:**
  - `readVerifiedVaultBytes` (`project-vault.ts`): the one verified reader, which refuses bytes that do not match their record.
  - `verifySeal` (`vault-seal.service.ts`, VR-19): the seal's own verdict, used first, so an archive is never built for a seal that is not intact.
  - `readRecordAuditHistory` (`audit-trail-ledger.routes.ts`): the one record-history reader, with each row's chain position and verdict, as the document history uses it.
  - The audit-before-send order of the Vault download (`recordVaultDownload`): a chained row is committed before a byte leaves, and a failed audit write sends nothing (500 `AUDIT_WRITE_FAILED`).
  - `archiver`, which the universal packager already depends on, streaming to a staged file rather than to memory.

## The change

- **`server/services/vault/vault-archive-builder.ts`: `openVaultArchive`**, the one builder.
  - It opens a staging directory. The caller hands documents in one at a time with `put(document, bytes)`. Each document names the hash its bytes must have.
  - `put` writes the bytes to the staging directory only when they hash to that value. It refuses a mismatch, a document with no recorded hash, and the same document twice. The heap holds one document at a time.
  - `finish` writes `manifest.json`, `INDEX.txt`, the caller's attachments and `SHA256SUMS` beside the staged files into a ZIP in the staging directory, with `archiver`. It then hashes the ZIP and returns its path, size, SHA-256 and file list.
  - `cleanup` removes the staging directory.
  - Paths are `documents/<NNN>-<safe file name>`, in index order (the seal's index number, then title, then id), so the same seal gives the same paths. A file name is reduced to one segment of plain characters, so it cannot leave its folder. An attachment cannot overwrite a file or name a path outside the archive.
  - **Built differently from the first draft of this design.** The draft had the builder call a reader. For a seal, the archive is staged instead from the seal's own byte check: `verifySeal`'s `checkBytes` reads each file through `readVerifiedVaultBytes` and hands the bytes to `put`. Each file is read once, and the bytes that made the verdict are the bytes archived. A reader-driven caller (the data return, a bulk export) calls `put` in its own loop.
- **`server/services/vault/vault-seal-archive.ts`: `buildSealArchiveContents`.** This module builds what the archive says about itself:
  - the manifest: the seal, its manifest exactly as signed, each file's path and SHA-256, and the audit extract's count and chain verdict;
  - the index header;
  - the audit extract. This is the seal's chained rows and each sealed version's, read through `readRecordAuditHistory` in the tenant's scope and projected with `projectVaultRelationshipHistory`, as the document history is. It is written oldest first, with the chain verdict.
  - A trail at the reader's ceiling of 1,000 rows is refused rather than cut (409 `ARCHIVE_AUDIT_TOO_LONG`).
- **`GET /api/c2c/project-vault/:id/seals/:sealId/archive`:**
  1. The seal is verified with `verifySeal`, re-reading every file, and each file is staged as it is read. Anything but intact returns 409 `SEAL_NOT_INTACT` with the verdict, and nothing is built. A file that cannot be read, or does not match, is part of that verdict ("could not verify"), so there is no separate `ARCHIVE_INCOMPLETE`.
  2. The archive is finished and hashed.
  3. `recordVaultArchive` commits a chained `vault.data_room.archive` row carrying the archive's SHA-256, size and document count, in its own transaction in the tenant's scope. If that fails, the response is 500 `AUDIT_WRITE_FAILED` and nothing is sent.
  4. The ZIP is streamed with `X-Content-SHA256`. The staging directory is removed when the response closes, or at once on any refusal.
  - A seal in another organisation or project is 404. Any role the project admits may download, as the document download is.
  - **A sealed document whose original file was removed under a data disposition** (`keep_data`, which `vaultBinaryAvailableSql` refuses to the download) is not read. The manifest's `withheld` list and the index name it, with its sealed hash and the reason, and `X-Archive-Withheld` gives the count.
- **`verifySeal`** now passes the sealed document to `checkBytes` and returns the stored manifest. The verify route and the archive route share one reader of a sealed version's bytes (`readSealedBytes`).
- **Client:** each seal in `VaultSeals.tsx` offers "Download closing archive" once it verifies intact.
  - The file received is hashed in the browser and compared with `X-Content-SHA256` before it is saved. A mismatch, or a missing hash, is not saved.
  - The hash is stated. Where the browser cannot hash, it says so and points to `sha256sum`.
  - A refusal shows the server's verdict in words.

## Tests first

- **Real PostgreSQL 16 as `app_service`, with row security on:** a three-document seal's archive.
  - It unzips to three documents, `manifest.json`, `INDEX.txt`, `SHA256SUMS` and the audit extract.
  - `SHA256SUMS` verifies every file, and each document's bytes hash to its sealed hash.
  - The manifest embeds the seal's manifest, and that manifest hashes to `manifest_sha256`.
  - The audit extract holds each sealed version's rows and the seal's, oldest first, with the chain verdict.
  - One `vault.data_room.archive` row carries the SHA-256 of the body received.
  - No staging directory is left behind.
- **Refusals:**
  - With one stored object removed: 409 `SEAL_NOT_INTACT` naming it, no archive, and no archive audit row.
  - A foreign seal is 404, and no row is written.
  - When the archive audit write fails: 500 `AUDIT_WRITE_FAILED`, no ZIP and no hash header, no row, and no staging directory left.
  - A viewer the project admits may download.
  - A document under a `keep_data` disposition is listed as withheld, and its file is not in the archive.
- **Unit:**
  - Paths and order are deterministic.
  - A file name cannot leave its folder.
  - A mismatch, a missing hash and a duplicate are refused.
  - An attachment cannot overwrite or escape.
  - Cleanup leaves nothing.
- **Client:**
  - The download is offered only for an intact seal.
  - A received file that does not match the recorded hash, or has none, is not saved.
  - A refusal reads as the server's verdict.

## Not in this change

- **A 200 MB room under a heap bound.** No test proves it. The builder holds one document at a time by construction: `put` writes the bytes and keeps only the path. Each read goes through `readVerifiedVaultBytes`, which reads one whole file into memory, as the single download does. A room of many files is bounded by its largest file, not its total. A streamed verified reader would bound that too, and would be a change to the one reader.
- **Part 2:** the tenant data return carries bytes through `openVaultArchive` (FD10 (c)). It edits `tenant-full-export.service.ts`, the released D6 lane's file.
- **MR-08 Stage 6 step 3:** a bulk export of a chosen selection, through the same builder.
- **Streaming the ZIP without staging.** Staging is the plan's time-of-check/time-of-use fix: the bytes served are exactly the bytes verified.
