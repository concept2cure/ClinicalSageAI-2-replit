# D5: every file a route delivers is recorded first, and a gate holds it (2026-10-23)

Session `…01E8btkB`. This follows the launch-boundary re-proof, which fixed 12
launch-served downloads that delivered a document and recorded nothing
(`../2026-10-22-ind-documents-recorded/`). Those were fixed one by one. Nothing
stopped the next.

## What already exists

Searched: `Content-Disposition`, `res.download`, `res.attachment`,
`res.sendFile` across `server/`; `sendAuditedDownload`,
`createAuditedUnplacedExport`, `createGovernedExportConsequence`; the CI
scripts named `*export*` and `*download*`; the re-proof's 27 launch-served
download candidates and its finders' classification of each.

| Exists | Path | What it does | What it did not do |
|---|---|---|---|
| The one recorded-download implementation | `server/services/export/governedExportConsequence.ts` `sendAuditedDownload` | EXPORT_GENERATED with the SHA-256, nothing delivered without the row | Nothing required a route to use it |
| A governed-export gate | `scripts/ci/check-governed-export-routes.mjs` (`ci:governed-export-routes`) | Checks tokens in two named files (CER v2 exports, the 510(k) eSTAR build) | Sees no other file, so a new unrecorded download passes |
| Domain recorders | `recordVaultDownload` (Vault), `createAuditTrail` (Authoring EXPORT / WORKING_COPY), `exportForTenant` (the signed audit export), `recordGovernedEctdExport` (eCTD), `recordAuditRow` (the operator cost CSV) | Each records its own download before the bytes | — |
| The validation kit | `server/routes/validation-kit.ts` | Served the GAMP 5 protocols from `docs/validation/` to the Admin surface | Streamed them with nothing recorded |

Nothing was rebuilt. The gate is new because no general one existed. The
validation kit now delivers through `sendAuditedDownload`.

## What changed

**The gate**, `server/services/export/__tests__/recorded-downloads.contract.test.ts`,
runs in the unit suite. A route handler delivers a file when it sets
`Content-Disposition` or calls `res.download`, `res.attachment` or
`res.sendFile`. Each delivering handler must do one of three things:

- call a recorder in the same handler: the shared helpers, or a file's own
  recorder, which is named with what it writes;
- be listed as **not served**, with its full path, which
  `launchScopeApiVerdict` must refuse in production. The path's tail must
  be the handler's own route, so an entry cannot name some other path;
- be listed as **unmounted**, a file that no other file imports.

The lists are held honest both ways. An entry whose handler no longer
delivers, now records, or is served fails until it is moved. A handler that
delivers through `sendAuditedDownload` does not count as a delivering handler,
because the header is the recorder's.

Today: 38 handlers deliver a file. 6 record through a domain recorder of their
own file, 30 are not served in production and 2 are unmounted. Every one
served at launch records.

**The validation kit** (`GET /api/validation-kit/:docId`) is served at launch,
from the Admin surface's validation section, and recorded nothing. It now
delivers through `sendAuditedDownload` (`export_stored_file`,
`validation_kit_document`, with the document's version and status). A caller
with no organisation or user is refused 401. A record that does not persist
is refused 503 `UNAUDITED_EXPORT_REFUSED`. The Admin surface already says a
refusal by its status, so no client change was needed.

## Evidence: each check seen failing first

| Check | Red | Green |
|---|---|---|
| The gate on trunk's validation kit | `gate-red-validation-kit.txt`: the handler fails | `gate-green.txt`: 38 / 38 |
| The gate with the Vault download's `recordVaultDownload` call removed | `gate-red-recorder-removed.txt`: the handler and the file's recorder entry both fail | — |
| The gate with a new unrecorded download added to a launch file | `gate-red-new-handler.txt`: it fails by name | — |
| The gate's first draft, which wrongly listed three handlers as not served | `gate-red-first-draft.txt`: the eCTD export, the validation kit and a wrong test-assembly path were each refused by the verdict check. The eCTD export records through its own recorder, the validation kit was the defect, and test-assembly is mounted only with test routes, which production refuses | — |
| `server/routes/__tests__/validation-kit-download-recorded.test.ts` | `validation-kit-red.txt`: 3 failed / 4 (the 404 case passes both ways) | `validation-kit-green.txt`: 4 / 4 |

## Limits a reader should know

- The scan is static: it reads `<router>.<method>('<path>'` registrations
  and cuts a file at each one. A route registered another way (a path from
  a variable, a helper that sets the header) is not seen as delivering. The
  governed helpers set the header themselves, which is the case it must not
  flag.
- A domain recorder is matched per file. A second handler in the same file
  that calls that recorder for something else would pass.
- A not-served path is checked against the verdict as the registry states
  it. The mount prefixes were taken from the route inventory measured on the
  running registration (`../../D2-API-SCOPE/2026-10-15-reproof/`) and the
  mount lines in `server/bootstrap/`.
