# D7 (W5): the exact package a transmittal sent can be downloaded (2026-10-29)

Session `…01E8btkB`. This follows `../2026-10-29-sent-package-kept/`, where the
guarded transmit began keeping the package's exact bytes before the wire and
naming the copy on the transmittal row. Nothing could read it back, so the
copy was kept but not reachable.

## What already exists

Searched `sent-package`, `sentPackage`, `downloadAcknowledgment`,
`/transmittals/:id/`, `sendAuditedDownload`, `requireCurrentProgramAccess` and
`getStorageProviderFor` in `server/` and `client/src`.

| Exists | Path | What it does | What it did not do |
|---|---|---|---|
| The transmittal routes | `server/routes/mdx-submission-gateway.ts` | List, `/status`, `/ack` (a recorded download through `sendAuditedDownload`), AS2 receipt, technical rejection | Nothing served the kept package |
| The transmittal log | `client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx` | Each row has Status and ACK, and MDN upload and technical rejection where they apply | — |
| Project read access | `requireCurrentProgramAccess` (`server/services/c2c/current-program-access.ts`) | The one check that a person may read a project's records; already called with `pool` by Vault filing and upload | — |
| Reading a stored object back | `getStorageProviderFor(recorded)` (`server/services/storage/index.ts`) | Opens the store the object was written to; `get` verifies the object's own recorded SHA-256 and size | — |
| The recorded download | `sendAuditedDownload` (`governedExportConsequence.ts`) | Writes an `EXPORT_GENERATED` row with the bytes' SHA-256 before delivery, and refuses when the row does not persist | Refuses above `GOVERNED_EXPORT_MAX_BYTES` (25 MiB by default) |

## What changed

- **`sent-package-read.ts` (new).** `readSentPackage` checks, in order:
  - The transmittal belongs to the organization.
  - It names a project. If not, it refuses: whether you may read the package
    cannot be checked.
  - You may read that project (`requireCurrentProgramAccess`). The package is
    the whole dossier.
  - A kept copy is recorded and well-formed. If not, it says the transmittal
    was sent before packages were kept, and that the agency holds what it
    received.
  - The record names the package the row records as sent.
  - The package is within the download limit.
  - The copy is in its store, and its bytes hash to what was sent.

  Every refusal ends "Nothing was downloaded." A missing or altered copy is an
  error, never a file. The module is kept apart from the archive, so the
  gateway registry does not import project access.
- **`GET /api/mdx/gateways/transmittals/:id/sent-package`** (`server/routes/mdx-sent-package.ts`, registered by the router as `mdx-as2-receipt.ts` is).
  - Serves the bytes through `sendAuditedDownload`: `EXPORT_GENERATED` on
    `submission_transmittal_sent_package`, with the SHA-256 and the stored
    copy's id.
  - A refusal answers its own status, from 403 to 413. A 503 answers a fixed
    sentence and logs the detail.
- **Gateway transmittals.** Each row has a **Package** action beside ACK.
  - Where the row records no kept copy, it is disabled and says "Sent before
    the platform kept the bytes it sends".
  - A refusal shows the server's sentence.
- **Fixed, from the previous slice.** `tests/mdx-submission-gateway-routes.test.ts`
  replaces the whole gateway module. `3cab286e1` made the route reference
  `SentPackageNotArchivedError`, which that mock did not export, so a
  `GatewayError` answered 500 instead of 502. The mock now carries the class,
  as it already did for `PreTransmitBlockedError`. The other three suites that
  replace the module pass unchanged.

## Evidence: seen failing first

| Check | Red (`red.txt`) | Green (`green.txt`) |
|---|---|---|
| `sent-package-download.test.ts` (new) covers:<ul><li>the exact bytes, recorded first;</li><li>project access;</li><li>another organization's transmittal;</li><li>a transmittal sent before packages were kept;</li><li>a transmittal with no project;</li><li>a record naming another package;</li><li>a copy that is missing, changed or reported altered;</li><li>a download record that does not persist.</li></ul> | 10 of 10 fail before the route existed | 10/10 |
| `gatewayTransmittals.test.tsx`: the action, its disabled state with its reason, the server's refusal | The 3 new cases fail against the pushed surface | 16/16 |
| `tests/mdx-submission-gateway-routes.test.ts`: `GatewayError` → 502 | 1 fails as pushed (500) | 41/41 |
| The recorded-downloads contract, the router's other suites, the archive suite | — | 186/186 across 9 files |

## Not done

- **Packages above the download limit** (25 MiB by default) are refused with
  413 `SENT_PACKAGE_TOO_LARGE`, and the response says they are kept,
  unchanged. A CSR sequence with its appendices can exceed that limit. A
  streamed, recorded download is the next step for them.
- **A transmittal with no project** (a dev-only descriptor on the governed
  route, or an unanchored submission) cannot be downloaded here, because no
  project access can be checked for it.
- **Transmittals before `3cab286e1`** kept nothing, and the action says so.
