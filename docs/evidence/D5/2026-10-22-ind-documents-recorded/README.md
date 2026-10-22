# D5 — every generated document leaves the system recorded (2026-10-22)

Part of the launch-boundary re-proof
(`docs/evidence/D2-API-SCOPE/2026-10-15-reproof/`). Session `…01E8btkB`.

The rule was decided on 2026-09-29 and 2026-10-01
(`docs/evidence/D5-EXPORTS-RECORDED/2026-09-29/`;
`server/routes/__tests__/record-exports-recorded.test.ts`). A file the platform
generates, or renders from a record, gets an EXPORT_GENERATED row carrying the
SHA-256 of the exact bytes delivered, and nothing is delivered when that row
does not persist. The re-proof found twelve launch-served downloads that
recorded nothing, each upheld by three skeptics.

## What already exists

Searched: `sendAuditedDownload`, `createAuditedUnplacedExport`,
`isUnauditedExportRefusal`, `EXPORT_GENERATED`, `Content-Disposition` across
`server/routes`, the `sendPdf` helpers, and every client caller of the
routes below (`IndLifecycle.tsx`, `IndFormsPanel.tsx`, `AgencyMeetings.tsx`,
`ComplianceAttestation.tsx`, `GatewayTransmittals.tsx`).

| Exists | Path | What it does | What it did not do |
|---|---|---|---|
| The one recorded-download implementation | `server/services/export/governedExportConsequence.ts` `sendAuditedDownload` / `createAuditedUnplacedExport` | EXPORT_GENERATED with SHA-256, refusal without the row, `X-Export-Sha256` | Not used by the routes below |
| IND lifecycle PDF helper | `server/routes/ind-lifecycle/shared.ts` `sendPdf` | Sent the bytes `inline` | Recorded nothing |
| IND forms PDF helper | `server/routes/ind-forms.routes.ts` `sendPdf` | Sent the bytes, labelled itself "a stateless PREVIEW render: the platform does not record that it was produced" | Recorded nothing |
| Attestation run row | `server/routes/tenant-export.ts` `tenant.attestation.generate` | Records the run and its verdict | No hash, and the report was "returned either way" |

Nothing new was built. Every route now delivers through `sendAuditedDownload`
or `createAuditedUnplacedExport`.

## What changed

| Route | Now |
|---|---|
| `POST /api/ind-lifecycle/cover-letter/pdf`, `/cover-letter/pdf-from-records`, `/annual-report/pdf`, `/loa/pdf`, `/right-of-reference/pdf`, `/briefing-book/pdf` (and `/safety-report/pdf`, `/authorized-persons/pdf`, `/sequence/:currentId/diff/pdf`, `/sequence/:seqId/manifest/pdf`, through the same helper) | `sendPdf` → `sendRecordedFile` → `sendAuditedDownload` |
| `POST /api/ind-lifecycle/annual-report/line-listing?format=csv` | Same, `export_csv` |
| `POST /api/ind-forms/:formId/pdf`, `/:formId/pdf-from-records` | Recorded. Still a preview, not a governed artifact (`X-Form-Untracked-Preview` keeps that meaning; `POST /:formId/artifact` makes one) |
| `POST /api/ind-forms/1572/pdf-all`, `/3455/pdf-all` | The JSON body sent is the bytes recorded, with each PDF's own SHA-256 in the row and beside it in the body. A set with no document (no investigator discloses) records nothing, because nothing left |
| `GET /api/tenant-export/attestation` | Its run row is kept; delivery is gated on an EXPORT_GENERATED row (`export_json`) over the bytes the screen saves |
| `GET /api/mdx/gateways/transmittals/:id/ack` | Recorded with its provenance (`platform-record` or `agency`); `export_txt` or `export_stored_file` |

A refusal answers 503 `UNAUDITED_EXPORT_REFUSED` with no `Content-Disposition`.
The ind-lifecycle `fail()` asks for it before its `CODE:` rule, which would
otherwise have answered it 400 as if the caller had sent something wrong.
Clients read every one of these through `res.blob()` or JSON, so moving from
`inline` to `attachment` changes nothing on screen.

## Evidence — each check seen failing first

| Check | Red (trunk code) | Green |
|---|---|---|
| `server/routes/ind-lifecycle/__tests__/documents-recorded.test.ts` | `test-red.txt`: 12 failed / 12 | `test-green.txt`: 12 / 12 |
| `server/routes/__tests__/ind-forms.contract.integration.test.ts`, "a rendered form is recorded…" (PGlite, real templates) | `forms-red.txt`: 3 failed | `forms-green.txt`: 67 / 67, the whole file |
| `server/__tests__/routes/tenant-export.test.ts` | `attestation-red.txt`: 2 failed / 10 | `attestation-green.txt`: 19 / 19, with the two other tenant-export suites |
| `server/routes/__tests__/mdx-transmittal-ack-recorded.test.ts` | `ack-red.txt`: 2 failed / 2 | `ack-green.txt`: 2 / 2 |
