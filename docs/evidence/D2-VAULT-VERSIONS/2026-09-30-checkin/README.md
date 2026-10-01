# VR-08: check in a new version of a Vault document, with lineage the database validates (row D2)

**Plan item:** VR-08, `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. **Date:** 2026-09-30.
**Depends on:** VR-05 and VR-06 (both done). **Founder decision:** FD1 is decided as (a), sequential majors.

## The finding

The Vault's own 409 says "Upload it under a new version", and nothing could do
that. The version was free text from the client. The lineage fields had been
written unchecked until VR-05 refused them at the route, so no path could
record a successor. And no rule kept a successor in its own family, or kept a
version from being succeeded twice.

## The change

| Piece | File |
|---|---|
| A check-in names the document by one of its versions: `supersedesDocumentId` on `POST /api/vault/ingest`. The raw `supersedesId` and `parentDocumentId` stay refused (VR-05). | `server/routes/vault-ingest.ts` |
| The plan, before any byte is stored, and again under `FOR UPDATE` on the head inside the ingest transaction. It finds the head in the caller's program and organization (404 otherwise), requires it to be current (409 `VERSION_NOT_CURRENT`, naming the end of the chain), and refuses a version that is not a number (409 `VERSION_SCHEME_UNKNOWN`, nothing invented). It refuses bytes the document already holds (409 `CONTENT_ALREADY_A_VERSION`, naming that version), whether or not the program-hash unique index exists, then assigns the next major (FD1). | `server/services/vault/vault-version-checkin.ts` |
| The new row keeps the head's document code and filing, and inherits its classification and retention policy unless they are sent. Its `supersedes_id` is the head. A sent version is 400 `VERSION_IS_ASSIGNED`, and a sent filing is 400 `FILING_IS_KEPT`. The ingest audit row records `lineage: { supersedes, predecessorVersion, filingKept }`. The plain upload's 409 now names the check-in path. | `server/services/vault/vault-ingest.service.ts` |
| The database rule, for every writer: `vault.documents_lineage_guard()` runs `BEFORE INSERT OR UPDATE OF supersedes_id` with a two-key advisory lock. The predecessor must be live and visible, with the same program, code and organization (a NULL organization never matches), and with no other live successor; otherwise `VAULT_LINEAGE_INVALID`. A partial unique index `vault_documents_one_successor` is created only when no version is already forked; otherwise NOTICE and skip, so a data condition never stops a deploy. There is no self-FK (it would break the purge and VR-06's write-once rule). | `migrations/20260930_vault_documents_version_lineage.sql`, `scripts/db/migration-set.mjs` (after VR-06's file) |
| D4: URS-VAULT-011 (v0.2), OQ-VAULT-11 with its runner step (v0.4), RA-001 row (v0.9), TM-001 regenerated. URS-VAULT-011 reads **uncovered** until the OQ run is executed. | `docs/validation/*`, `tests/validation/oq/vault/run.mjs` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| On PostgreSQL as `app_service`, RLS on, through the route and the storage provider (`tests/db/vault-version-checkin.dbtest.ts`) | `red/db-checkin.txt`: 11 of 11 failed at trunk. The check-in field was stripped, so the version was stored at 1.0 under the sent code; another tenant's id gave 409, not 404; the raw INSERTs were accepted; there was no trigger | `green/db-checkin.txt`: 11/11, including the race (exactly one 201, the other 409 naming 2.0) and the replay over seeded duplicate pointers (NOTICE, no failure, a third successor refused, index created once the pair is gone) |
| Without the program-hash unique index (`vault-version-checkin.pglite.test.ts`) | new module | 5/5 |
| The VR-06 suite (`vault-record-immutability.dbtest.ts`) | Its fixture pointed every row at a UUID naming no document, which the new guard refuses | Fixture given a real predecessor. The re-point case now uses a family sibling the guard would admit, so only VR-06's write-once rule refuses it (`green/db-vr06-suite.txt`, 12/12) |
| The full DB tier, and the Vault, route, eSTAR and authoring unit suites | — | `green/db-tier.txt`; 352 files / 3631 tests (eSTAR retention and authoring file-to-vault, the plan's controls, unchanged) |
| Replay | — | `deploy-migrate` applied the file; the dbtest re-runs it twice |

Also green: `ci:migration-set-order`, `ci:migration-drop-safety`,
`ci:vault-document-writers` (no new writer), `ci:validation-traceability` and
its selftest, `tsc`.

## Limits, stated

- No surface uses it yet. VR-09 adds the version list, any-version download
  and "Upload new version" in the Vault, and moves `Etmf.tsx` onto the one
  upload hook (plan critic item 11).
- Authoring and eSTAR rows carry non-numeric versions (`draft-<sha8>`, a hash
  prefix), so a check-in against them is refused with
  `VERSION_SCHEME_UNKNOWN`. What a "family" is for those rows is VR-09's
  definition to make (plan critic item 12), with the authoring lane.
- OQ-VAULT-11 is written, not executed: the run needs the validation
  identities. Handed to W3 with VR-04's re-run.
- The guard reads the predecessor as the writer. Under RLS, a predecessor in a
  program the writer cannot see is refused, which is the safe direction.
