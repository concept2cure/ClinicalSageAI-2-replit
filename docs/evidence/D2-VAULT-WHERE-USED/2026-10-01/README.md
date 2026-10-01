# Where each Vault version is placed (VR-14a, rows D2 and D7)

**Plan item:** VR-14's "Placed in" and critique 15's where-used, in `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`. **Date:** 2026-10-01.
**Founder decision:** none. FD5 governs VR-14's transmit gate, which this change leaves alone.

## The finding

A submission leaf names a Vault version by `submission_leaves.document_uuid`, under
`document_table = 'vault_documents'`. Its one writer is `upsertLeaf`. Before pinning the version's
SHA-256, it checks that the version is live, that it belongs to the organisation, and that it is in the
submission's project. Nothing read that column back for the Vault. A person revising a document could
not see which sequences already carry which version, so could not tell whether the next sequence needs
a `replace` rather than a `new`. Veeva shows this as "where used".

## The change

| Piece | File |
|---|---|
| `readVaultPlacements(q, organizationId, versionIds)`. For each version, the live leaves that name it: the submission (title, type), the sequence (number, region, status), the section, the leaf's title and its lifecycle operation. A removed leaf, or a leaf in a removed sequence or submission, is not a placement. Every table is filtered to the organisation, and row security applies on top. It is read in one query for the whole version family. | `server/services/vault/vault-where-used.ts` |
| `GET /:id/documents/:documentId/versions` gives each version `placements`. A placement read that fails, fails the version list, as an unreadable lifecycle stage already does. "Placed nowhere" would be a claim about leaves nobody read. | `server/routes/c2c/project-vault.ts` |
| **The Vault.** Each version row says where it is placed, e.g. "placed in IND 123456, sequence 0001, 3.2.P.8.1 (replace; sequence draft)". A version the server reports as placed nowhere says "not placed in any submission". A row the server said nothing about claims nothing. | `client/src/concept2cure/v2/surfaces/VaultVersions.tsx` |
| URS-VAULT-020, OQ-VAULT-21 (in the runner's step module), RA-001 v0.18, TM-001 rebuilt | `docs/validation/`, `tests/validation/oq/vault/steps-filing-compare.mjs` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-where-used.dbtest.ts`: PostgreSQL as `app_service` with RLS on. The leaves are written by `upsertLeaf` and read through the real versions route. | `red/db-where-used.txt`: 4 of 4 fail with trunk's route and no service | `green/db-where-used.txt`: 4 of 4. v1 lists sequence 0000 at 3.2.P.8.1 (new), with the submission's title and type and the sequence's region and status. v2 lists sequence 0001 (replace). A removed leaf is not listed, and neither is a leaf in a removed sequence. Another organisation's leaf naming v1 is not listed, and the other organisation reads the program as not found. Run as the table owner, where row security does not apply, the read's own organisation filter still keeps that leaf out. |
| Mutant: removed leaves listed | `red/mutation-removed-leaf-listed.txt`: the removed-leaf case fails | as above |
| Mutant: leaves in removed sequences listed | `red/mutation-removed-sequence-listed.txt`: v2 gains the removed sequence's leaf | as above |
| Mutant: no organisation filter in the SQL | `red/mutation-no-organisation-filter.txt`: the owner-run case fails. Under the runtime role, row security alone still hid the leaf; that is why the owner-run case exists. | as above |
| `client/src/concept2cure/v2/__tests__/vaultWhereUsed.test.tsx` | `red/client.txt`: 3 of 3 fail with trunk's `VaultVersions.tsx` | `green/client.txt`: 3 of 3 |
| Regression: every `vault*` client suite; Vault services and project routes | — | 22 files, 128 tests; 55 files, 426 tests |

Gates are in `green/gates.txt`.
- These pass:
  - launch-scope-api, check-client-api-calls, undefined-css-classes and internals-in-copy;
  - action-overclaim, success-before-ok, design-system and fixture-fallback;
  - unauthenticated-fetch, tenant-isolation:no-regression, runtime-ddl and vault-document-writers;
  - column-reachability, tenant-entry-points, server-error-leaks and sign-ceremony;
  - validation-traceability and its self-test;
  - `tsc`.
- `audit-requestdb-coverage` is red with identical output on trunk. The cause is `server/routes/governed-signed-act.ts` (`ae36f2c81`), which is already on the board for its lane.
- Lint: every changed file has the same counts as on trunk, and the new files have none.

The full DB tier is in `green/db-tier.txt`: 1327 of 1327.

## Limits, stated

- **Submission leaves only.** An eSTAR export records each attachment by file name and SHA-256, not by
  Vault version (`estar-fill.ts` drops the source id when it writes the record). A match by hash would be
  inferred, not recorded. Recording the version id on the export is the next slice; the eSTAR code is
  past its lane's 24-hour window. `vault.evidence_citations` holds search hits, not uses, so it is not
  listed.
- **A read.** It does not refuse anything. Refusing to transmit an unapproved or superseded version is
  VR-14's gate, and that waits on FD5.
- **OQ-VAULT-21 is written but not executed.** It runs with the other OQ-002 steps in W3.
