# Document relationships: the replacement for `parentDocumentId` (row D2)

**Plan item:** critique 15 of `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` §4. **Date:** 2026-10-01.
**Founder decision:** none.

## The finding

VR-05 made the upload refuse `parentDocumentId`. The field had taken any UUID, checked against nothing,
and no client sent it. Nothing replaced it, which the working agreement requires: a Vault document
could not name the documents that support it, that it references or that it is based on. Veeva relates
documents this way, and a reviewer follows those links from a clinical study report to its protocol and
its statistical analysis plan.

## The change

| Piece | File |
|---|---|
| **The record.** `public.vault_document_relationships`: one row per relationship, from one Vault version to another of the same organisation, as `supporting`, `references` or `based_on`, with an optional note and who made it. `organization_id INTEGER NOT NULL` in `public` (Rule 1), so the final sweep gives it row security, forced. One live relationship of a kind between two versions. Triggers, for every role: identity, kind, note and creator frozen; `removed_at`, `removed_by` and `removal_reason` write-once; DELETE only by the table's owner, which is also the role a foreign key's cascade runs as, so the tenant purge removing an organisation's documents takes their relationships with it; TRUNCATE refused. Replayable: CREATE … IF NOT EXISTS, CREATE OR REPLACE, each trigger only when absent, no DROP. Inserted before the final sweep pair. | `migrations/20261001_vault_document_relationships.sql`, `scripts/db/migration-set.mjs` |
| **The writer.** `addRelationship`, `removeRelationship` and `listRelationships`. Adding checks the role, the kind, the note's length, that the document is this project's and the target is a live version of the same organisation (any of its projects), that the two are not the same version or two versions of one document, and that the same relationship is not already live. Removing needs a reason for change (`requireGovernedReason`), and keeps the row. Each relate and removal writes a chained row on **both** documents, in the same transaction as the change, with a description each history shows ("Related: supported by Protocol v1.0" on one end, "Related: supports Clinical study report v1.0" on the other). The list answers both directions, each in its own words, names the other version's project, and says when that version has since been superseded. | `server/services/vault/vault-relationships.ts` |
| `GET /:id/documents/:documentId/relationships`; `POST /:id/documents/:documentId/relationships` and `POST /:id/relationships/:relationshipId/remove`, both behind `requireEditorAccess`. | `server/routes/c2c/project-vault.ts` |
| The upload's `LINEAGE_NOT_ACCEPTED` refusal now names where each intent goes: a new version through `supersedesDocumentId`, a related document under the document's Relationships. | `server/routes/vault-ingest.ts` |
| **The Vault.** A "Related documents" section in the detail pane. It lists what the server returned, finds a document to relate through the library search (so it can be in another project), and lets the person choose the kind and add a note. Removing one asks for a reason. A change is claimed only after the server has recorded it. A list that could not be read says so, and never reads as "no related documents". | `client/src/concept2cure/v2/surfaces/VaultRelationships.tsx`, `Vault.tsx` |
| URS-VAULT-019, OQ-VAULT-20 (in the runner's step module), RA-001 v0.17, TM-001 rebuilt | `docs/validation/`, `tests/validation/oq/vault/steps-filing-compare.mjs` |

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| `tests/db/vault-document-relationships.dbtest.ts`: PostgreSQL as `app_service` with RLS on, through the real ingest and routes | `red/db-relationships.txt`: 9 of 9 fail with trunk's code and schema. | `green/db-relationships.txt`: 9 of 9, after a double migrate, alongside the fixity and archive suites (18 of 18). Both ends list the relationship in their own words. A target in another project names that project, and a superseded target says so. Refused: self (400), two versions of one document (409 `SAME_DOCUMENT`), a duplicate (409), an unknown kind (400), another organisation's document (404 `TARGET_NOT_FOUND`), a viewer (403), and another organisation's project, for both writing and reading (404). Removal: no reason → 422; with a reason → 200, and the row is kept with who and why; a second removal → 409. There are four chained rows, one per end for the relate and for the removal, each naming the person, and both histories show them. As the runtime role, a change to the kind, a rewrite of the removal reason and a DELETE are each refused. The owner's UPDATE and TRUNCATE are refused. Another organisation reads nothing. The tenant purge takes one organisation's relationships and leaves the others'. |
| Mutant: DELETE guard admits any role | `red/mutation-delete-unguarded.txt`: the guard case fails at the DELETE | as above |
| Mutant: removal not write-once | `red/mutation-removal-rewritable.txt`: the guard case fails at the rewritten reason | as above |
| Mutant: two versions of one document may be related | `red/mutation-family-relatable.txt`: the refusals case fails | as above |
| Mutant: only the naming end is recorded | `red/mutation-one-end-audited.txt`: the history case fails | as above |
| `client/src/concept2cure/v2/__tests__/vaultRelationships.test.tsx` | `red/client.txt`: 5 of 5 fail with trunk's `Vault.tsx` | `green/client.txt`: 5 of 5 |
| Client mutant: a failed read shown as an empty list | `red/client-mutation-failed-read-as-empty.txt`: the failed-read case fails | as above |
| `vaultSurface.test.tsx` | Its search-failure case met a second alert: the new relationships read fell through the helper's catch-all `ok({})`. The helper now answers it with an empty list, as it already did for history and versions. | `green/client-vault-surface.txt`: 19 of 19 |
| Regression: every `vault*` client suite; Vault services; project routes; the lineage refusal test, which now also checks that the message names the replacements | — | 23 client files, 136 tests; 56 server files, 429 tests |

`green/migrate-twice.txt` shows two `deploy-migrate` runs. Each applied the file, and the sweep
policied the table on the first run only. Afterwards row security is on and forced, the policy is
present, and the table has its three triggers.

Gates (`green/gates.txt`) pass:
- launch-scope-api, check-client-api-calls, undefined-css-classes, internals-in-copy and action-overclaim;
- success-before-ok, design-system, fixture-fallback, unauthenticated-fetch and tenant-isolation:no-regression;
- runtime-ddl, vault-document-writers, column-reachability, tenant-entry-points and sign-ceremony;
- server-error-leaks, migration-set-order, migration-drop-safety and its selftest, and migration-deploy-path;
- validation-traceability and its self-test;
- `tsc`.

Four gates are red on trunk without this change, with identical output:
- `ana-surface-context`: surface-id coverage 116 against a baseline of 115.
- `unkeyed-request-tables`: stale baseline entries.
- `audit-requestdb-coverage`: `governed-signed-act.ts`.
- `purge-coverage`: `coordination_leases` and `session_activity`, from `20261001e`/`20261001f`.

The purge-coverage gate does not report `vault_document_relationships`: the purge reaches it by cascade.

Lint: every changed file has the same counts as on trunk, and the new files have none.

The full DB tier is in `green/db-tier.txt`: 1323 of 1323.

## Limits, stated

- **A relationship names a version, not "the latest".** Veeva can bind a relationship to the latest
  version. Here the list says when the named version has been superseded, and the person relates the
  new version if that is what they mean. Following the latest automatically would change what a
  signed-off relationship points at without anyone deciding it.
- **Three kinds.** Supported by, references, based on. Another kind is a vocabulary change in the
  migration's CHECK and the service's list, together.
- **Not a lineage.** Two versions of one document are ordered by their version history, and cannot
  also be related.
- **OQ-VAULT-20 is written but not executed.** It runs with the other OQ-002 steps in W3.
