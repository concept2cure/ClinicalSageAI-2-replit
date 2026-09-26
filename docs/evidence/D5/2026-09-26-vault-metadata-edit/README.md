# D5: a Vault version's descriptive fields get a governed writer

**Row:** D5 (§11.10(e): a change records what it changed, and why).
**Workstream:** the AnA client-files lane (`…01DiJJAk`). **Date:** 2026-09-26.
**Source:** VR-05 in `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` (the
metadata writer "beside placeVaultDocument … with the same shape").

## Why

Until today, a Vault version's title, type and classification changed only as a
side effect of re-uploading it, and the change was recorded without the old
values. `docs/evidence/D5/2026-09-26-vault-reupload/` made the re-upload keep
what was recorded and audit what it changes. This change adds the governed way
to change those fields on purpose.

## What

`editVaultDocumentMetadata` (`server/services/vault/vault-metadata-edit.service.ts`)
has the same shape as `placeVaultDocument`:

1. **The acting role.** `vaultWriteRefusal()` runs first, so a viewer gets 403
   before anything is read.
2. **A reason for change.** It is validated by the platform's one rule,
   `requireGovernedReason` (8 to 2000 characters, trimmed), and recorded
   verbatim. A change without one is 422.
3. **The Vault's vocabularies.** The type is checked against
   `VAULT_INGEST_DOCUMENT_TYPES`. The classification is checked against
   `VAULT_CLASSIFICATIONS`, which now lives in `vault-taxonomy.ts` and which the
   ingest route's schema uses too; it was a literal in the route before. The
   title is 1 to 500 characters.
4. **The row, locked.** It is read `FOR UPDATE` in the same statement as the
   program-ownership check, so another organization's document is reported as
   absent (404).
5. **The update and its record.** `UPDATE` and one chained
   `vault.document.metadata_edit` row, carrying each changed field's `from` and
   `to` and the reason, are written on one client, in one transaction. A
   request whose values are already recorded writes nothing.

Identity, bytes, lineage, retention and filing are not edited here. Filing has
its own writer, and the rest are the record itself (VR-06).

**Not wired here:** the route (`POST /api/c2c/project-vault/:id/documents/:documentId/details`)
and the Vault detail pane's control belong to the Vault surface's lane
(`…01KnUGoX`), per the plan. Once they call this writer, a re-upload can stop
changing descriptive fields at all. That is the working agreement's replacement
for the re-upload path.

## Evidence

On PostgreSQL as the runtime role (`app_service`, RLS on), inside the tenant
scope the request gate opens:

| File | Result |
|---|---|
| `green/db-vault-metadata-edit.txt` | 26 passed across 3 files. `vault-metadata-edit.dbtest.ts` (6) covers: no reason or a too-short one is 422 and changes nothing; with a reason, the three fields change and exactly one chained row carries each before and after and the reason; a no-op writes nothing; an out-of-vocabulary type or classification is 422; a viewer is 403; another organization's document is 404. Also run: `vault-placement.dbtest.ts` and `vault-reupload.dbtest.ts`. |
| `red/reason-check-removed.txt` | The writer with the reason check deliberately removed: 4 failed, 2 passed. A reasonless change went through. |
| `red/audit-write-removed.txt` | The writer with the audit write deliberately removed: 3 failed, 3 passed. A change was made with no record of it. |

Both breaks were reverted, and the suite is green on the shipped file.

Gates: ESLint 0 on the new files and on the route and taxonomy changes. For
`ci:tenant-isolation`, the `UPDATE` carries the program-organization predicate
that `placeVaultDocument`'s does; the first draft lacked it and the gate
flagged it. `ci:discarded-audit-write` and `ci:requestdb-coverage` pass. The
16 unit suites that use the ingest route or the taxonomy pass (199 tests).
