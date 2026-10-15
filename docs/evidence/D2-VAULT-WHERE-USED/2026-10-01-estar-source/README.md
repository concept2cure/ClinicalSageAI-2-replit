# An eSTAR's governed record names each attachment's source (critique 15, rows D2 and D7)

**Date:** 2026-10-01. **Founder decision:** none.

## The finding

An official eSTAR export records what it attached: the slot, the chapter, the file name and the SHA-256.
That is the governed record "what did we file into section 5" is answered from: the artifact metadata, or
the `EXPORT_GENERATED` audit row on the unplaced path. The record did not say which document it was.
`toRecord` (`server/services/pathway-engines/estar/estar-fill.ts`) dropped the planned attachment's
`source`, so a Vault version could be identified only by matching its hash. That is an inference, not
a record: two versions with the same bytes match equally. The Vault's where-used therefore could not
list eSTAR exports (`docs/evidence/D2-VAULT-WHERE-USED/2026-10-01/`, Limits).

## The change

`EstarAttachmentRecord` gains `source`. It is the request's own source, already validated by the plan:
`{ kind: 'vault_document', documentId }` for a Vault version, or `{ kind: 'authored_section',
sectionCode }` for a governed section rendered to PDF. Every path that keeps the attachment report
carries it unchanged: the response, the artifact's metadata, and the audit row. The bytes stay out of the
record, as before.

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `estar-fill.test.ts` › "reports what was filed, where, and under what hash": the record carries `source: { kind: 'vault_document', documentId: 'd1' }` | `red.txt`: fails with trunk's writer | `green.txt` |
| `tests/routes/estar-official-pdf.test.ts` › "the governed record names what was filed": the audit row's attachment carries `source: { kind: 'authored_section', sectionCode: 'A.1' }` | `red.txt`: fails with trunk's writer | `green.txt` |
| Every eSTAR suite (`server/services/pathway-engines/estar`) and the official-PDF route | 85 other cases pass on trunk | 21 files, 452 tests |

`tsc` is clean. Lint shows no new warning in any changed file.

## Limit, stated

The record now names the version, but the Vault's where-used does not read eSTAR records yet. The
placed path keeps them in the artifact's metadata and `regulatory_audit_logs`, and the unplaced path in
`audit_logs`. A reader has to read both, and it needs a real-database export test. That is the next step.
Exports made before this change name no source, and stay as they were.
