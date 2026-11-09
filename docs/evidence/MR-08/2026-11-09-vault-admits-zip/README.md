# The Vault admits a `.zip`, stored as one file (P-112 item 1)

**Decision.** P-112 (founder, 2026-11-09), recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md`. The answer was "Yes vaul
accepts zips…". It reverses MR-08's recommendation ("no for the pilot"), but keeps MR-08's rules for an admitted archive
(Stage 3 step 3):
- it is one Vault version;
- it is stored and hashed as it came;
- it is bounded by the one archive helper;
- it is never expanded into Vault documents.

**Lane.** Codebase market readiness (`01Gx2fiw…`), ledger package L1. The hold row was written in
`.design/claude-convergence/COORDINATION.md` before the first edit (`f3fa4ffdd`).

## What already exists

Searched before writing a line, by path:

| Piece | What it did before this change | Changed here |
|---|---|---|
| `shared/constants/document-intake-formats.ts` | The one table of intake formats. `.zip` was `chat: true`, `vault: false`, `textExtraction: 'archive'`, `byteCheckSupported: false`. Every Vault surface reads `vault`: `VAULT_UPLOAD_EXTENSIONS`, `VAULT_UPLOAD_ACCEPT`, the picker in `Vault.tsx`, `VaultUploadStaging.tsx`, `DossierAttachments.tsx`, and the ingest route's allowlist (`server/routes/vault-ingest.ts`). | `vault: true`, `byteCheckSupported: true`. The `limitation` sentence is now true for both places (it said "The archive itself is not stored"). The `'archive'` comment names both behaviours. |
| `shared/constants/upload-name-bindings.ts` | Binds each name to the types it may be declared as. `.zip` had no binding, so `verifyDeclaredTypeForName` returned ok for any declared type. A "filing.zip" declared `text/html` with HTML bytes passed both checks: SEC-A-3's case under a new name. | A `.zip` binding: `application/zip`, `application/x-zip-compressed` or `application/octet-stream`, each checked as a zip container (`PK\x03\x04`). |
| `server/utils/fileSignature.ts` | `application/zip` and `application/x-zip-compressed` are in `ZIP_BASED_MIMES`, checked against the zip signature. | Nothing. |
| `server/middleware/uploadSafety.ts` (`assertUploadSafe`) | For any zip container, by declared type or by its bytes, it runs `assertZipWithinLimits` (`server/services/archive/safeZip.ts`) before the scan. Over the limit is 422 `ARCHIVE_LIMITS_EXCEEDED`. `vault-ingest.service.ts` calls it for every upload. | Nothing. A test now pins it for a `.zip`. |
| `server/services/ocr/extractDocumentText.ts` | A format with no extractor is admitted with `method: 'none'` and no text. | Nothing. The probe shows a zip is read for no text and is not opened (`extraction-probe.md`). |
| `client/src/concept2cure/hooks/archive-intake.ts` | The Data Room opens a zip in the browser and uploads each file inside on its own. It excludes `.zip` from what it opens inside an archive. | Nothing. Still pinned by its own tests. |
| `server/middleware/uploadAllowlist.ts` (`isAllowedUpload`) | A separate allowlist for module-integration attachments; `archive.zip` refused. Not on the Vault path. | Nothing. |
| `VaultPlaceIntoSubmission.tsx` | Only a PDF can be placed into a submission. A non-PDF shows `NotPdfNotice`. | Nothing. A zip in the Vault is refused there, in words. |

## Proof

- **Red before the change** (`red-before.txt`). Eight cases across five files:
  - the `.zip` name binding (3);
  - the format table (1);
  - the Vault staging (1);
  - the ingest route, for `application/zip` and `application/x-zip-compressed` (2): 400 `FILE_TYPE_NOT_ALLOWED` where 201 is wanted;
  - `assertUploadSafe` admitting a `.zip` named file that carries HTML (1): it resolved instead of refusing.
- **Already true, now pinned.** A bomb `.zip` is refused with 422 `ARCHIVE_LIMITS_EXCEEDED`, under both zip types. It passed before the change, because the bound is applied to any zip container.
- **Green after the change** (`green-after.txt`). 109 of 109 in the five files.
- **Regression.** Every test file that reads the format table, the bindings, the signature check, upload safety, the archive intake, chat upload, the Vault staging or upload, or Vault ingest: 57 files, 1012 of 1012.
- **Mutations** (`mutations.txt`). Each applied alone, with the sources restored byte for byte (sha256 checked):

  | Mutation | Failing cases |
  |---|---|
  | M1, the binding removed | 6 |
  | M2, `x-zip-compressed` dropped | 2 |
  | M3, the binding's canonical type made PDF | 4 |
  | M4, `vault: false` | 14 |

## Limits, and what this does not do

- **Size.** The Vault's upload limit is still 50 MB (`VAULT_UPLOAD_MAX_BYTES`). A sent eCTD package is often larger. The
  admission limit is open in P-112 (MR-08 recommends 500 MB) and is the founder's.
- **No expansion.** Nothing in the Vault opens a stored zip. Reading a prior filing from it (MR-10 stage 9) and accepting
  a sponsor's copy of a sent package (P-108 4(a)) are the next steps of their owners:
  - stage 9 still waits on where an imported filing is recorded, and on the DTDs;
  - 4(a) is RIM's.
- **Not walked in the running app.** The upload path is exercised through the real route, signature, bounds and staging
  code in tests. Walking a real upload in the browser needs a running database and the scanner, which this container
  does not have. That walk is owed.
