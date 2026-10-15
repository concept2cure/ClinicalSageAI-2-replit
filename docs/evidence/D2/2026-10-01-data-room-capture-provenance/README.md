# VR-16b: a data-room capture names who made it, and is in the audit chain (rows D2, D5)

**Plan item:** critique 14 of `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` §4, which extends VR-16.
**Date:** 2026-10-01. **Founder decision:** none.

## The finding

The critique records it: "Data-room intake records no one and writes no audit row."
- `cre_evidence_sources` had no column naming who captured a file.
- Neither capture path (a chat attachment with a project open, or an adopt) wrote a chained audit row.
- A re-capture's retirement of its predecessor wasn't in the chain either.
- `stored_artifact_ref` stayed mutable, so a capture could be re-pointed at other bytes.
- VR-11a's filing recorded the Vault ingest without naming the capture it came from.

A due-diligence data room or a Veeva intake answers "who put this file here, when, and what replaced
it" from its audit trail. This one could not.

## The change

| Piece | File |
|---|---|
| `created_by INTEGER` (additive; NULL for older captures and for system writes). `created_by` and `stored_artifact_ref` join the write-once list. Amended in place in VR-16's file, with a dated header note (Rule 1). `deploy-migrate` applied it twice. | `migrations/20261001_cre_evidence_sources_capture_immutability.sql` |
| `createSource` treats a `client_document` as a data-room capture. It resolves who captured it: the writer's `createdBy`, else the session user the routes put in provenance (`uploadedByUserId`, `adoptedByUserId`), else null. It records that person in `created_by`, and writes a chained `data_room.capture` row naming the person, bytes, upload, project and any predecessor. The row and the INSERT go on the caller's transaction, or one of its own. Any other source type is a single INSERT, as before. | `server/services/clinical-regulatory-evidence/evidence-spine.service.ts`, `data-room-capture-audit.ts` |
| `createSupersedingSource` writes a chained `data_room.supersede` row on the retired capture, naming its successor, in the transaction that retires it | same |
| The Vault ingest's audit row names the capture it was filed from (`dataRoomSource.sourceId`), when VR-11a's "File into Vault" files it | `server/services/vault/vault-ingest.service.ts`, `vault-file-upload-to-vault.ts`, `vault-data-room-filing.ts` |

Neither capture route changed. `server/routes/chat/upload.ts` is inside another lane's 24-hour window, and
both routes reach the writer this change amends.

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/data-room-capture-provenance.dbtest.ts`, plus a new assertion in `tests/db/vault-data-room-file.dbtest.ts`. PostgreSQL as `app_service` with RLS on; the real chat-upload route with a project open. | `red/db.txt`: 6 of 6 new assertions fail on trunk's code and migration set. Trunk has no `created_by`, no capture row and no source in the ingest row, and a failed audit write left the capture behind. | `green/db.txt`: 17 of 17, with VR-16's suite, after `deploy-migrate` ran twice. The chat capture records `created_by` = the session user, with one chained row naming the person, checksum, upload id and project. A re-capture's row names its predecessor, and the retired capture's row names its successor. An injected audit failure leaves no capture. `created_by` and `stored_artifact_ref` changes are refused. A CRL source writes no data-room row (control). The ingest row reads `{ sourceId }`. |
| A mutant that writes the capture outside the transaction | `red/mutation-outside-transaction.txt`: the rollback case fails. Its audit rows, written with no transaction, carried no `chain_seq`, so the verifier found the probe tenant's chain broken, and `licensing-history`'s store-wide check failed on the local database. That is the same failure the transaction prevents. The suite now clears its own tenant's audit rows before and after, as the Vault suites do. | as above |
| The PGlite source suites (identity, usage, versioning, program scope) | Without a pool `connect()` and with no `audit_logs` table, 59 tests failed on the new transaction | 28 files, 320 tests. Fixtures only: the pool mock gains `connect()`, as the versioning suite already had, and the chained writer is captured, as the lifecycle PGlite suite does. No assertion changed. The identity suite gained one: a capture writes one `data_room.capture`. |
| Regression: evidence, routes, chat, project routes, Vault, AnA document tools, audit | — | 191 files, 1916 tests |

Also green:
- Migration gates: `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:migration-deploy-path`.
- Other gates: `ci:runtime-ddl`, `ci:column-reachability`, `ci:tenant-isolation:no-regression`,
  `ci:launch-scope-api`, `ci:check-client-api-calls`, `ci:fixture-fallback`, `ci:unkeyed-request-tables`,
  `ci:tenant-entry-points`, `ci:vault-document-writers`, `ci:validation-traceability`,
  `audit-requestdb-coverage --strict-no-regression`.
- `tsc`.
- Lint: no changed file gained a warning, and the new files have none.

The full DB tier is in `green/db-tier.txt`: 1015 of 1016. The one failure is the MDx audit-list case of `tests/db/actor-displays.dbtest.ts`, red on trunk after `4f74b0f18` and handed to that lane.

## Limits, stated

- **Captures made before this name no one.** `created_by` stays NULL for them. Nothing is back-filled,
  because a guessed author is worse than none.
- **A capture's person comes from provenance the route writes.** The capture routes take it from the
  session, not the request body. A future capture route must do the same, or pass `createdBy`.
- **The adopt now writes two rows.** It already wrote `c2c.project.adopt`, which records the act on the
  project. It now also writes `data_room.capture`, the record every capture writes, whichever way it
  arrived.
