# D5: an Authoring export record is kept (2026-10-29)

Session `…01E8btkB`. Found by the Part 11 reviewer in the CSR path review for
the LMN-201 / RePreve prospect.

## What already exists

Searched `authoring_export_history`, `export-history`,
`EXPORT_HISTORY_DELETED` and `DELETE FROM authoring_export_history` in
`server/`, `client/src`, `scripts/` and `migrations/`.

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The export record | `authoring_export_history`, written by the export and file-to-Vault paths | Records what was exported, by whom, the bytes' SHA-256, and for a filing the Vault copy it became | — |
| Its readers | `authoring.router.ts` (Exports rail, diff since last export), `document-data-disposition/impact.ts` | Data disposition takes a filed row as the proof that a Vault rendition carries another document's data, so that source cannot be withdrawn while the rendition is a reusable source | — |
| `DELETE /api/authoring/export-history/:id` | `authoring.router.ts` | Hard-deleted the row, for its exporter or anyone with QA in the token, and wrote `EXPORT_HISTORY_DELETED` | Deleting the row removed the disposition proof, so a source could be withdrawn while its filed copy stayed. No client called the route. No migration guards the table |

The QA check read the token's roles, not a caller's header: the router strips
`x-roles` and rebuilds it from the verified token. That part was sound.

## What changed

- **`DELETE /api/authoring/export-history/:id`** answers 409
  `EXPORT_RECORD_RETAINED`, "An export record is kept … Nothing was deleted",
  and writes nothing. The route stays, so a caller learns why.
- **The client.** Its label for the audit event (`DocumentWorkbench.tsx`,
  "export record deleted") stays, so records of earlier deletions still read.

## Evidence: seen failing first

| Check | Red | Green |
|---|---|---|
| `server/routes/__tests__/authoring-export-record-retained.test.ts` (new) | `red.txt`: 2 of 2 fail at HEAD. The exporter's and QA's deletes both returned 200 | `green.txt`: 36/36, with the export-history and schema-contract suites |
| Every test of the Authoring router | — | `green.txt`: 77 of 81 files. The four that fail, fail identically at HEAD and are handed on |
