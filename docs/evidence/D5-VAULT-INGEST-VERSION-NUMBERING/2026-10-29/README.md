# D5: the Vault numbers a version once a document has one (2026-10-29)

The Part 11 review of the uploader (`../../D2-VAULT-UPLOAD-METADATA/2026-10-22/`, finding F1) found that a version typed by the sender, under a document code that already had versions and without naming it as the next version, recorded a second, unlinked version of the same document:
- no supersession and no lineage;
- a version the Vault's own numbering (`nextMajorVersion`, `vault-version-checkin.ts`) never assigned, which then blocks it.

The uploader stopped sending a version that day; that was the client half. `POST /api/vault/ingest` still accepted one from any API caller; that is the server half, fixed here.

## What already exists

- **A new version is named, not typed.** `supersedesDocumentId` (VR-08): the server assigns the version, keeps the code and filing, and records the link (`planCheckIn`, `recheckUnderLock`).
- **A version already recorded is guarded.** `readRecordedVersion` reads it under lock:
  - different bytes are `409 VERSION_CONTENT_CONFLICT`, naming the head;
  - the same bytes are a retry that changes nothing (`vault-reupload.ts`).
- **Services keep their own numbering.** eSTAR and authoring file through the same service with non-numeric versions. A rule in the service for every caller would break them, so the control is one the caller asks for.
- **No client sends a version.** Searched across `client/src` for `/api/vault/ingest`: `useVaultUpload.ts`, `Etmf.tsx` and the MDX pathway attach.

## The change

- **`VaultIngestArgs.numberedByVault`.** The upload route sets it. With it, inside the ingest transaction and after the locked read of the recorded version, `typedVersionRefusal` refuses a typed version when:
  - the code already has a version in the project;
  - the typed version is not one already recorded;
  - the upload is not a check-in.
- **The answer:** `409 VERSION_FOR_EXISTING_DOCUMENT`. It names the current version and its id, and says to send the file as that document's next version, or under a new code. Nothing was saved.
- **What still works:**
  - a version already recorded goes on to the conflict and retry rules;
  - a first version of a new code may be typed (`0.1`).
- **The route now passes the head on every refusal that names one,** `VERSION_CONTENT_CONFLICT` included. It used to drop it.

## Evidence

| File | What it shows |
|---|---|
| `01-red-db.txt` | Trunk `86473731a` on real PostgreSQL 16 (`RLS_ENFORCE=on`, `app_service`, the recorded Vault fixture database): a typed `2.0` under a code holding `1.0` is accepted (201) and recorded unlinked. The two narrowing cases already pass. |
| `02-green-db.txt` | Every database suite that posts to `/api/vault/ingest`: 20 files, 164 tests. |
| `03-mutation.txt` | Three mutations, each caught: the route does not ask; the refusal is computed and ignored; the refusal also takes the recorded version. |
| `04-green-unit.txt` | The ingest route, Vault service and upload client unit suites: 61 files, 764 tests. |

Also clean: `tsc --noEmit` and the lint warning ratchet.

## What remains

- **Two first uploads of a new code, in parallel, with different typed versions,** can both be recorded. The refusal reads the code inside the transaction, but a code with no row yet has nothing to lock. One of them would still be unlinked. The same race exists today for the version itself, and `ON CONFLICT` settles only that.
- **The uploader review's other server items:**
  - F3: a same-bytes re-upload does not report a different folder, kind or section;
  - F4: `placed_by` and `placed_at` are stored but not shown.
