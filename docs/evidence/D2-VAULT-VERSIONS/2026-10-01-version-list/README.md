# VR-09: every version of a Vault document is visible, downloadable and addable (row D2)

**Plan item:** VR-09, `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. **Date:** 2026-10-01.
**Depends on:** VR-08 (done, `../2026-09-30-checkin/`). **Founder decision:** FD1 (a), sequential majors.

## The finding

VR-08 let a document take its next version, but the Vault read model still
listed every `vault.documents` row as its own document. Versions 1.0 and 2.0 of
one protocol showed as two documents, were counted twice, and both appeared in
search. The detail pane showed only the row it was opened on, next to a note
that no version history existed. A file refused because a different file was
already recorded under its name led nowhere: the 409 said "upload it under a
new version", and the page had no way to do that.

## The change

| Piece | File |
|---|---|
| One rule for "which versions belong together", shared by every reader. It is the rule the VR-08 trigger admits: same program, document code and organization, both rows live. A pointer that would fail the rule is not treated as lineage. `supersededSql` marks a row that a live family member supersedes. `versionCountLateral` counts a row's versions back through valid predecessors, bounded so a legacy cycle cannot run away. `readVersionFamily` reads the whole family, back and forward from any member, newest first, and the organization check runs through `regulatory_programs`. | `server/services/vault/vault-version-family.ts` (new) |
| The tree lists each document once, at its current version, with `versionCount` and `documentCode`. The page and its counts share one predicate, so `documentCounts.uploads` counts documents. The checksum join still sees every version. | `server/routes/c2c/project-vault.ts` (`GET /:id`) |
| `GET /:id/documents/:documentId/versions` returns the family, with version, SHA-256, size, file name, uploader (name, or user id when the name can no longer be read), date, `current`, and a `link` value of `none`, `verified` or `unverified`. It answers 404 for a document outside this program or organization, 503 when the store is missing, and 500 when the read fails (never an empty list). | `project-vault.ts` |
| Search shows current versions only, unless `includeSuperseded=true` is sent. Each result carries `version` and `current`, and the total counts the same set as the rows. | `project-vault.ts` (`GET /:id/search`) |
| A document's history reads the audit trail of every version in its family. `readRecordAuditHistory` now takes one record id or several (`ANY($3::text[])`). Each entry names the version it was recorded against. | `project-vault.ts`, `server/routes/audit-trail-ledger.routes.ts` |
| A check-in needs no document code (the head's code is kept). The new version inherits the head's document type. The plain upload's 409 now offers the check-in. | `server/routes/vault-ingest.ts`, `server/services/vault/vault-ingest.service.ts` |
| A check-in agrees with the tree about which version is current. The successor walk uses the family rule and the caller's organization. On trunk it walked any row naming the head, so a legacy row of a different document made the check-in say "the current one is 2.0", which is a version of that other document. A row the rule refuses but the trigger still counts as a successor now gets 409 `VERSION_LINK_CONFLICT`, which names nothing about that row. The known-bytes check is now organization-scoped. | `server/services/vault/vault-version-checkin.ts` |
| In the Vault detail pane, `VaultVersions` lists every version, newest first. Each row shows the date in UTC, the uploader, the size, a 12-character SHA-256 prefix (the full value on hover), an "earlier" or "current" label, and a not-linked note where one applies. Each version downloads through the one hash-verified, audited download route. "Upload new version" posts `supersedesDocumentId` to the one upload hook, and the server assigns the version number. "Export signed history" downloads the signed audit export for exactly these versions' records, then says what the file contains: the row count, whether it was truncated, the chain status at export, and the key id. Zero rows is shown as an error. A 403 names who can export. A failed read is shown as an alert, never as "one version". | `client/src/concept2cure/v2/surfaces/VaultVersions.tsx` (new), `Vault.tsx` |
| In `Vault.tsx`, the list row reads `· v2.0, 2 versions`. Search has an "Include earlier versions" checkbox, and an earlier version found that way opens with a note saying so, plus its versions and history. History entries read `v1.0 · <event>`. The refused same-name upload offers "Upload as a new version of <title>" and states the consequence. The empty state no longer claims "version-tracked". | `client/src/concept2cure/v2/surfaces/Vault.tsx`, `useVaultUpload.ts`, `fixtures/vault-data.ts` (types only) |
| The tenant gate now expands fragments built from fragments (bounded, four levels), so a tenant predicate two variables deep counts as a tenant predicate. A two-level fragment with no tenant predicate is still flagged. | `scripts/ci/check-tenant-isolation.mjs` |
| D4 documents: URS-VAULT-012 (URS-002 v0.3; URS-VAULT-004 now says a document's versions count once), OQ-VAULT-12 with its runner step (OQ-002 v0.5), an RA-001 row (v0.10), and TM-001 regenerated. URS-VAULT-012 reads **uncovered** until the OQ run is executed. | `docs/validation/*`, `tests/validation/oq/vault/run.mjs` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| On PostgreSQL as `app_service` with RLS on, through the real ingest and Vault routes (`tests/db/vault-versions.dbtest.ts`) | `red/db-versions.txt`: 6 of 8 failed at trunk. There were two leaves for one document, a count of 4 for 3 documents, no versions route, superseded versions in search, and a history covering one row. The two controls passed: another organization gets 404, and an earlier version downloads with its hash. | `green/db-vault.txt` |
| A check-in agrees with the tree (same file) | `red/db-checkin-agrees-with-tree.txt`: with trunk's `vault-version-checkin.ts`, the check-in answered `VERSION_NOT_CURRENT`, naming another document's version | `green/db-vault.txt`: `VERSION_LINK_CONFLICT`, naming neither that row's version nor its id |
| Vault surface (`vaultCheckInVersion.test.tsx`) | `red/client-checkin.txt`: 7 of 7 failed at trunk. These were the 7 cases the file had then; the export and earlier-version-detail cases were added after the capture. | `green/unit-client-and-route.txt` (9/9 in that file) |
| Tenant gate | `red/tenant-gate-before.txt`: 5 new findings. Two were real: the check-in's successor walk and known-bytes check had no organization filter, and both had been on trunk since VR-08. Three had a tenant predicate the gate could not see. | `green/gates.txt`: 8 current, 8 baseline. `red/tenant-gate-nested-fragment-probe.txt`: after the gate change, a two-level fragment without a tenant predicate is still flagged |
| The Vault, ingest, re-upload, immutability, catalog and actor-vanishing DB suites | — | `green/db-vault.txt`: 7 files, 71 tests |
| The full DB tier | — | `green/db-tier.txt`: 88 files, 883 tests. The earlier run failed one test, `actor-vanishing` (the RBM board), because the local database lacked trunk's `20260930_rbm_plan_versioning`. It passed after `deploy-migrate`. |
| Unit suites that touch the changed modules | — | 166 files passed. All 453 client files (4896 tests) passed. |
| Gates | — | `green/gates.txt`: 21 gates plus `audit-requestdb-coverage`, all exit 0. `tsc` is clean. Lint counts per changed file match trunk, and the new files have no warnings. |

The pre-existing tests that this change made stale were updated in the same
change:

- The search tenant-scope test now parses the statement's own `WHERE`, not the
  inline `WHERE` of the `current` subquery.
- The history route test's mock now answers the family read and asserts the
  ids of every version.
- The check-in pglite DDL gained `document_type`.

## Limits, stated

- **Etmf.tsx still uploads on its own path.** Moving it onto
  `useVaultUpload` (plan critic item 11) was not done here, and it does not
  offer check-in.
- **Authoring and eSTAR rows** carry non-numeric versions. They form a family
  only through a valid `supersedes_id`, and a check-in against them is still
  refused with `VERSION_SCHEME_UNKNOWN`. What a family means for those writers
  (critic item 12) is for the authoring lane to decide.
- **Upload and export buttons are not role-scoped in the page.** The server
  enforces both (the ingest's roles; `requireAuditReader` on the signed
  export), and the page reports a refusal.
- **The signed export takes at most 200 record ids.** A document with more
  versions than that is refused (400), and the page says the export was not
  made.
- **OQ-VAULT-12 is written but not executed.** The run needs the validation
  identities. Handed to W3 along with OQ-VAULT-11 and VR-04's re-run.
- **A version superseded by a deleted successor is current again.** A
  soft-deleted row is not a live family member, so its predecessor becomes the
  current version. This matches the VR-08 trigger, which admits a successor to
  that predecessor.
