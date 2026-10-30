# A kept sent package above the download limit is delivered, recorded and verified (2026-10-30)

D5/D7 lane (`…01E8btkB`). CSR path review, order of work item 6: "a streamed
download above 25 MiB". Status: **design, not built**. It ranks below the
items that block a first CSR filing: the platform's ESG has never run
against FDA, so no sponsor yet has a sent package to download.

## What already exists

| Exists | Path | What it does | What it does not do |
|---|---|---|---|
| The kept copy | `server/services/submission-gateways/sent-package-archive.ts` | Before the wire, the guarded transmit stores the package's exact bytes and names the copy on the transmittal row (`metadata.sentPackage`: provider, version id, SHA-256, size, filename) | — |
| The reader | `sent-package-read.ts` `readSentPackage` | Checks project access, that the record matches the row's `bundle_sha256`, then reads the whole copy into memory and re-hashes it | Refuses above `getMaxGovernedExportBytes()` (25 MiB by default) with 413 `SENT_PACKAGE_TOO_LARGE` |
| The route | `server/routes/mdx-sent-package.ts` → `sendAuditedDownload` | Records `EXPORT_GENERATED` with the bytes' SHA-256, refuses if the row does not persist, sends the buffer | — |
| The record | `governedExportConsequence.ts` `createAuditedUnplacedExport` | Hashes, writes the audit row, refuses an unpersisted row | Also builds a base64 copy of the whole file for its JSON envelope, which a binary download discards. Above about 400 MB that string cannot exist in V8 |
| The limit | `GOVERNED_EXPORT_MAX_BYTES` | 25 MiB by default. Its reason is a JSON body carrying base64 | No in-repo deployment config sets it |
| The storage interface | `server/services/storage/storage-provider.ts` `IStorageProvider` (local, S3) | `get` returns the whole file as a Buffer, verified against its stored identity | No streamed read. `getSignedUrl` is unused, and the local provider's URL points to `/api/vault/download/:id`, a route that does not exist |
| The screen | `GatewayTransmittals.tsx:353` | Fetches with the bearer token and saves a blob | — |
| The eCTD export | `server/routes/ectd-export.ts` | Anchored projects go through `registerExportGovernanceQuick`, which records size and hash and is not capped. The unanchored branch uses `createAuditedUnplacedExport`, so it is capped and builds the base64 copy | — |

## Design

1. **Split recording from the base64 envelope** in
   `governedExportConsequence.ts`:
   - `recordAuditedExport(input with sha256)` writes the
     `EXPORT_GENERATED` row and refuses one that does not persist.
     `createAuditedUnplacedExport` is that record plus the base64 envelope,
     and keeps the 25 MiB limit, which exists for its JSON body.
   - `sendAuditedDownload` and the eCTD export's unanchored branch record
     with `recordAuditedExport` and send the bytes as they are. This is one
     implementation, not a second.
2. **A streamed read on the storage interface**,
   `openVerifiedRead(vaultVersionId, orgId)` in both providers. It returns the
   stored identity (size, SHA-256, filename) and a readable stream: a file
   stream (local) or the object body (S3), under the same tenant checks as
   `get`.
3. **The route streams in two passes:**
   - **Verify:** stream and hash the copy. A size or SHA-256 that differs from
     the record is refused (`SENT_PACKAGE_INTEGRITY`) before anything is
     recorded or sent.
   - **Record:** record with the recorded SHA-256.
   - **Deliver:** stream with `Content-Length` and `X-Export-Sha256`, hashing
     again. If the second pass differs (the store changed between passes),
     the response is destroyed, so the client sees a broken transfer and
     never a complete-looking file. An `EXPORT_DELIVERY_ABORTED` row is
     written.
   - Every size takes this one path; there is no small-file branch.
4. **A ceiling for the streamed path**: `SENT_PACKAGE_DOWNLOAD_MAX_BYTES`,
   default 2 GiB, refused with 413 naming both numbers. The screen saves a
   blob, so browser memory is the practical bound.

## Red tests first

- A kept 30 MiB package downloads byte-identical, with one `EXPORT_GENERATED`
  row carrying its SHA-256. Today: 413.
- A copy altered after the first pass: the response is destroyed and the
  abort is recorded.
- A copy altered before the first pass: refused, nothing recorded.
- An unanchored 30 MiB eCTD export is delivered. Today it fails after
  assembly.
- `createAuditedUnplacedExport` still refuses above 25 MiB (its JSON body).

## Not decided here

- The ceiling's default (2 GiB). It is an operations choice about container
  memory and abuse; the design only requires that it be stated in the
  refusal.
