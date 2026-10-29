# D5: every launch download is recorded before it is sent, or refused (2026-10-29)

Session `…01E8btkB`. `recorded-downloads.contract.test.ts` (mine, `606aa4177`,
2026-10-23) went red: 4 of its cases. Changes after it brought downloads into
launch scope (`62a8d5e7f`, device and diagnostics in Projects) or added them
there (`b03a1cd0d`, the Report OS package). The contract was right about the
first three below. On the fourth, its own parser was wrong.

## What already exists

Searched `sendAuditedDownload`, `createAuditedUnplacedExport`,
`registerExportGovernanceQuick`, `recordReportEvent`, `emitAuditEvent` and
`PACK_DOWNLOADED` in `server/`, and the three routes' existing suites.
`git log --all --diff-filter=D` on `*recorded-download*` found nothing.

| Exists | Path | What it did | What was wrong |
|---|---|---|---|
| IVDR pack download | `server/routes/ivdr-binder-routes.ts` `GET /packs/:packId/download` | Binds the stored bytes to the pack's recorded SHA-256 and size, then writes `PACK_DOWNLOADED` and sends | The write went through `emitAuditEvent`, which swallows a failed write ("never block the primary operation"). A regulated pack could leave with no record |
| RTM CSV | `server/routes/rtm-export.ts` | Records through `registerExportGovernanceQuick`, which fails closed, over the bytes' SHA-256 | It set `Content-Disposition` before recording. A refusal reached the browser as a saved file of error JSON |
| IVDR classification report | `server/routes/ivdr-routes.ts` `GET /classify/:id/report` | The same recorder, the same order | The same |
| Report OS package | `server/routes/report-os.ts` `POST /bundles/:bundleId/export.zip` → `sendReportPackageRoute` → `sendRecordedReportFile` | Records the report event with the SHA-256, and refuses `REPORT_EXPORT_NOT_RECORDED` otherwise | Nothing. The contract's parser read `router.post(path, sendReportPackageRoute);` as a handler whose body was the next 470 lines, and found another function's header there |

Nothing was rebuilt. Each route already had its recorder, and the contract
already existed.

## What changed

- **IVDR pack.** `writeAuditEvent` is the write. `emitAuditEvent` keeps its
  best-effort wrapper for the binder's other events. `recordPackDownload`
  refuses: `PACK_DOWNLOAD_NOT_RECORDED` (503), with no headers and no bytes
  sent.
- **RTM CSV and IVDR classification report.** The file headers are set after
  the record exists.
- **The contract:**
  - `registerExportGovernanceQuick` counts as a recorder, and a handler that
    passes it `allowDegradedMode: true` is not recording.
  - `ivdr-binder-routes.ts` records through its own `recordPackDownload`.
  - The three entries that claimed those routes were not served are removed.
  - A registration that names its handler function is judged by that
    function's body.

## Evidence: seen failing first

| Check | Red | Green |
|---|---|---|
| `server/routes/__tests__/downloads-recorded-or-refused.test.ts` (new) | `route-red.txt`: 3 of 5 fail. The pack is delivered (200) when its record fails, and both refused exports carry an attachment header. The two "delivers once recorded" controls pass both ways | `route-green.txt`: 72/72 with the pack integrity, RTM, IVDR scoping and binder-actor suites |
| `recorded-downloads.contract.test.ts` | `contract-red.txt`: 4 failing at HEAD | `contract-green.txt`: 36/36 |
| The contract holds what it claims | `contract-mutations.txt`: each mutation fails, and each is restored: (1) the pack download recording best-effort again; (2) the RTM call with `allowDegradedMode: true`; (3) the Report OS route, registered by name, setting its own attachment header | — |
