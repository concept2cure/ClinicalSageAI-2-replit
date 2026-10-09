# D4 — a refused Vault upload kept its file while saying nothing was kept

**Row:** D4 (Validation package) — the Vault's honest-state behaviour on the
ingest path. **Workstream:** the AnA client-files lane. **Date:** 2026-09-24.
**Reach:** every caller of `ingestVaultDocument`: `POST /api/vault/ingest`
(the Vault upload), AnA's `file_chat_upload_to_vault`, authoring's
file-to-vault, and eSTAR artifact retention. Not behind a toggle.

## The defect

`ingestVaultDocument` stores the bytes through the storage provider, then
writes the record. It has to be in that order: the record carries the storage
version id. Four refusals come after the store:

| Refusal | Status | What the user was told |
|---|---|---|
| `INVALID_FOLDER`: a folder outside the program's taxonomy | 400 | (names the folder) |
| `VERSION_CONTENT_CONFLICT`: different bytes at an occupied code and version | 409 | "Nothing was changed." |
| `DUPLICATE_CONTENT`: the same bytes under a second code | 409 | "Nothing was changed." |
| `INGEST_FAILED`: the transaction failed (audit write, commit, …) | 500 | "Nothing was saved." |

Any exception thrown between the store and the transaction (the pool, the
feature-toggle read, the view resolver) came after the store as well.

In every one of these cases the file stayed in the tenant's storage with no
record pointing at it. No surface lists such a copy and no deletion reaches it.
A customer who deletes everything they can see in their Vault still has these
files held for them. The user was told nothing was saved, and the file was
kept.

The most common trigger is the default path. The Vault client sends the file
name as the document code, so uploading a revised `Protocol.pdf` hits
`VERSION_CONTENT_CONFLICT`, and uploading the same PDF under two names hits
`DUPLICATE_CONTENT`. Each attempt leaves a copy behind.

## The fix

`ingestVaultDocument` is now a wrapper around the unchanged admission
(`admitVaultDocument`). The admission records the version id it stored, and it
records whether its `COMMIT` returned. One exit covers every refusal and every
throw. If a copy was stored and no commit returned,
`server/services/vault/vault-ingest-discard.ts` removes it:

- It deletes **only the refused attempt's own version.** Every `put` mints a
  fresh random version id, so the delete cannot reach the bytes of a record that
  already exists. That includes the record a `DUPLICATE_CONTENT` refusal points
  at, and the db suite reads those bytes back afterwards.
- **It asks before it deletes.** A `COMMIT` whose acknowledgement is lost leaves
  the row committed while the caller sees an error. Deleting then would leave a
  governed record whose bytes are gone, which is worse than a leak. So
  `storedVersionIsReferenced` asks the database whether any record in the
  organization points at the version. If one does, the copy is kept. If the
  question cannot be answered, the copy is also kept: a leak can be cleaned up
  later, but a record whose bytes are gone cannot be repaired.
- **The message says what actually happened.** If the copy could not be
  removed, or could not be shown to be unreferenced, "Nothing was saved."
  becomes "No record was created." and the refusal adds that the file is still
  held in storage. If a record does refer to it, the refusal says so and tells
  the user to check the Vault before uploading again. The version id and org
  are logged at error level, so an operator can find the copy.
- The admission and its three refusals are unchanged. So are the 201 path and
  the idempotent re-upload of the same bytes to the same place.

## Evidence

`red/` is the tree before the fix, with only the new tests added. `green/` is
after. The db runs are CI-shaped (`RLS_ENFORCE=on`, server pool connected as
`app_service`, the runtime role).

| File | Result |
|---|---|
| `red/unit-vault-ingest-storage.txt` | 8 failed, 6 passed. Each refusal leaves the copy; a failed delete, and a record that refers to the copy, both still say "Nothing was saved". "An admitted upload keeps its bytes" passes, as it should. |
| `red/db-vault-ingest.txt` | 3 failed, 7 passed. Against real PostgreSQL through `POST /api/vault/ingest`, each of `VERSION_CONTENT_CONFLICT`, `DUPLICATE_CONTENT` and `INVALID_FOLDER` leaves a new object in the provider's listing for the program. The admitted-upload case passes: exactly one new object, the one its record names. |
| `red/db-reference-check-blinded.txt` | The check was broken on purpose (`storage_version_id::text = upper($1)`, which never matches a lowercase uuid). The case "the reference check the discard relies on sees an admitted record, as the runtime role" goes red. A check that RLS or a bad predicate blinded would answer "no" every time, and the discard would then delete a record's bytes. This is the case that catches that. The file was restored immediately after. |
| `green/unit-vault-ingest-storage.txt` | 34 passed. The 14 ingest cases, plus the two suites that mock `ingestVaultDocument` (the AnA catalog tools' id space, eSTAR retention). |
| `green/db-vault-ingest.txt` | 41 passed. The 11 ingest cases, plus `vault-placement` and `document-catalog`, which ingest through the same service. |

## Gates

- `ci:tenant-isolation`: 8 candidates before and after, none in these files.
  The new query filters on `organization_id`.
- ESLint: `vault-ingest.service.ts` has the same 2 warnings as HEAD (the long
  admission function, now named `admitVaultDocument`), and the new module has 0.
  `check-eslint-warning-ratchet.mjs --since origin/concept2cure-v2` reports no
  changed file whose warning count grew. The cleanup lives in its own module so
  the service stays under `max-lines`.

## Not done here

- **The idempotent re-upload still orphans a copy.** Re-uploading the same
  bytes to the same code and version succeeds, and the `ON CONFLICT … DO UPDATE`
  points the record at the new version id. The previous version, with identical
  bytes, is left with no record. Deleting it is not safe from here. Audit rows,
  package manifests and signatures may name the old version id, so which
  version a record should keep is a decision for the Vault owner, not a cleanup.
- **Copies already orphaned before this change** stay where they are. Finding
  them means comparing each provider listing against `vault.documents.storage_version_id`
  per organization. That is a one-off operator job, which needs its own review
  because it deletes customer bytes.
