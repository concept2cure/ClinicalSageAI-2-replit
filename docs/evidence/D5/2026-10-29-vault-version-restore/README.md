# D5: restore an earlier Vault version as the next version (MR-08 Stage 5 steps 1–2, 2026-10-29)

`docs/work-orders/MR-08-vault-upload-safety-and-document-control.md` Stage 5, steps 1 and 2 (restore only; CAT1-04).

A Vault version is a write-once row, so going back to version 1 after version 2 means adding version 3 with version 1's bytes. Nothing did that. Uploading version 1's file again was refused `CONTENT_ALREADY_A_VERSION`, because the document already held those bytes. No route restored a version. On an install with the governed-content schema, the database refused the same bytes twice in a program outright, under any name.

Now an editor restores an earlier version from its row in the versions panel, with a written reason. The new version holds that version's exact bytes, has no review of its own yet, and says which version it restores.

## What already exists

Searches run:
- by name: `restore`, `restoreVaultVersion`, `planRestore`, `vault.version.restored`, `versions/:versionId/restore`, `CONTENT_ALREADY_A_VERSION`, `DUPLICATE_CONTENT`, `idx_vault_documents_program_hash_unique`;
- by area: the version family, check-in and ingest services, `company-document-actions.ts`, `VaultVersions.tsx`.

Deleted history (`git log --all --diff-filter=D` on `*estore*`): only unrelated files, a chat session-restore hook and a co-author page.

- **The check-in** (`planCheckIn`, `recheckUnderLock`, `server/services/vault/vault-version-checkin.ts`) adds the next version to a document's current version. It assigns the number, keeps the code and filing, and refuses bytes the document already holds. Restore is a check-in, so it goes through it.
- **The one ingest** (`ingestVaultDocument`, `vault-ingest.service.ts`) does everything a new version needs:
  - scans the bytes;
  - stores them through the storage provider;
  - reads their text;
  - keeps the filing;
  - writes the row and its chained audit row in one transaction;
  - withdraws the replaced version's open review route.

  Its `assertSourceAccess` hook rechecks a source inside that transaction. Restore calls it unchanged except for one server-owned argument.
- **`company-document-actions.ts`** already copies a version's verified bytes into a project through the same ingest. Restore follows that pattern rather than adding a second writer.
- **The verified reader** (`readVerifiedVaultBytes`, `project-vault.ts`) refuses bytes that do not match their recorded hash. Restore reads through it.
- **The versions read and panel** (`readVersionFamily`, `GET …/versions`, `VaultVersions.tsx`) list every version, with Download, View and Compare. Restore is one more action on an earlier row.
- **`idx_vault_documents_program_hash_unique`** (`db/migrations/044c_gcc_vault_schema.sql`) makes `(program_id, content_hash)` unique on installs built with the governed-content tree. Ingest maps a breach to `DUPLICATE_CONTENT`. It refused every restore.
- **Nothing restored a version**, in any form.

## What changed

| Piece | Where |
|---|---|
| `restoreVaultVersion` checks the restore and hands it to the one ingest. It refuses a reason under the governed minimum, a version of another document or program, the current version, and a stored file that does not match its hash. It checks the document's current version back in with those bytes and the current title, and rechecks the source under the ingest's transaction. | `server/services/vault/vault-version-restore.ts` (new) |
| The check-in admits bytes the document already holds only when they are the version being restored, and refuses them when the current version already holds them (`CONTENT_ALREADY_CURRENT`) | `sameBytesRefusal` in `vault-version-checkin.ts` |
| Ingest takes a server-owned `restoreOf`. It writes `restored_from_id` and names the version restored and the reason (`restoredFrom`) in the ingest's chained audit row. | `vault-ingest-types.ts`, `vault-ingest.service.ts` |
| `vault.documents.restored_from_id`, and a trigger that admits it only for a live version of the same program, organization and document code holding the same bytes, write-once. The program-hash unique index is narrowed to rows that are not restores, under the same name, only while it has no predicate. | `migrations/20261029_vault_documents_restored_from.sql`, in `C2C_MIGRATION_FILES` after the lineage guard; `shared/schema/vault.ts` |
| `POST /api/c2c/project-vault/:id/documents/:documentId/versions/:versionId/restore`, behind `requireEditorAccess`, returns the service's refusals verbatim | `server/routes/c2c/project-vault.ts` |
| The versions read says which version a row restores | `readVersionFamily` (`restoredFrom`) |
| "Restore vN as a new version" on an earlier row, for the roles the route admits, with a reason held back until it is long enough; the row of a restored version says "restored from vN" | `client/src/concept2cure/v2/surfaces/VaultVersionRestore.tsx` (new), `VaultVersions.tsx` |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The final suite against HEAD's server code, on real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`): all 8 cases fail. The restore route does not exist, so v1 cannot be had back. |
| `02-green.txt` | <ul><li>**The migration:** applied twice to each of two databases; the second run is a no-op. The index ends narrowed on both.</li><li>**Gates:** `ci:migration-drop-safety` and `ci:migration-set-order` pass.</li><li>**The restore suite on real PostgreSQL 16:** 8 of 8.</li><li>**The neighbouring Vault dbtests:** 73 of 73 across check-in, versions, ingest, re-upload, fixity, data-room filing, compare and the processing sweep.</li><li>**Unit and client:** 1,213 of 1,213 across 113 files, including the two fixtures given the new column.</li><li>**The broader unit run** fails in exactly the eight files that fail on HEAD without this change, and nowhere else.</li><li>**Type check:** `tsc` exits 0.</li><li>**Client:** `vaultVersionRestore.test.tsx`, 4 of 4. Restore is not offered to a viewer. The reason is held back until it is long enough. A refusal is the server's words with "Nothing was restored.", and a dropped connection says the outcome is unknown.</li></ul> |
| `03-mutation.txt` | Nine mutations, seven in code and two in the database, each caught. One, skipping the recorded-hash check, first survived, because the storage provider also checks a file against its own record. A case that rewrites both was added, and that mutation is now caught. The database trigger then refused the forged bytes (`VAULT_RESTORE_INVALID`), so nothing was saved even with the application's check removed. |

## Decisions recorded here

- **A restore is a check-in through the one ingest, not a second writer.** The work order proposed factoring ingest's `INSERT` into a shared row writer for restore. Calling the ingest itself gives the scan, storage, text, filing, review-route withdrawal and audit row with no second path. The bytes are re-read and re-scanned, which costs one read of a file already held.
- **The restored row is one audit event.** It is the version's `vault.document.ingest` row, with `lineage.restoredFrom: { versionId, version, reason }`. A separate `vault.version.restored` action, as the work order named it, would have hidden the new version from every reader of ingest rows, such as who uploaded it.
- **The unique index is narrowed, not removed.** A second copy of a file under another name is still refused by the database, and a row that claims to be a restore must prove it to a trigger. The index keeps its name, so 044c's `CREATE UNIQUE INDEX IF NOT EXISTS` stays a no-op, and ingest still answers `DUPLICATE_CONTENT`. The replacement runs only while the index has no predicate, so a replay is a no-op. Its one creator runs only in install-fresh's governed-content step, never on a deploy, so there is no create-then-drop cycle (`ci:migration-drop-safety` passes).
- **The restored version takes the document's current title**, as a data-room check-in does. The bytes are the earlier version's; the title belongs to the document.
- **The verified reader stays in `project-vault.ts`.** The work order moves it to `server/services/vault/vault-bytes.ts`. Eleven callers and seven test mocks import it from the route today. Moving it is its own change, and restore imports it as they do.

## Not done here

Stage 5 steps 3–6: activating withdrawal (needs the owner's staging acceptance), append-only legal holds, holds in the product, and check-out (a founder decision).
