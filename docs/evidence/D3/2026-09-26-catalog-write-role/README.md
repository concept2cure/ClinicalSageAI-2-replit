# D3: a viewer could overwrite a document's catalog record through AnA

**Row:** D3 (tenant and role isolation). **Workstream:** the AnA client-files
lane. **Date:** 2026-09-26. **Source:** this lane's security audit (a read-only
auditor: "F2, verified by code path, not executed"), executed here on real
PostgreSQL before the fix.

## The defect

`catalog_project_document` writes `vault.document_catalog`. That table holds
AnA's comprehension record of a document: its kind, purpose, summary and key
data. The tool checked the catalog toggle, read coverage and the key data, but
not the caller's role, and the table's RLS write policy scopes by program, not
role. So a **viewer** could replace an editor's record.

The record is shared with everyone in the organisation:

- its `purpose` line is shown in **every member's** session-start recall;
- its `summary` and key data are returned by every `read_project_document` and
  indexed for `search_project_documents`.

So a viewer's text would reach every colleague's AnA. The 2026-09-24 role check
(`docs/evidence/D3/2026-09-24-vault-write-role/`) covered ingest and placement.
This was the third write through the same door.

## The fix

The tool handler, which is `completeCatalog`'s only caller, asks
`vaultWriteRefusal()` before it parses anything. That is the same check, on the
same `organization_users` role from the tenant scope, that the Vault write
services use. A refusal is `{ ok: false, refused: true, reason }`, and the
reason names the role and says nothing was changed. The service itself is
unchanged. It sits at the 500-line lint limit, and the one door is where the
check is made.

## Evidence

`tests/db/document-catalog-role.dbtest.ts` builds the fixture in rows: a
document with its text, its catalog record in `extracted`, and one read receipt
covering every character. Coverage and key data therefore both pass, and only
the role is left to refuse. It runs as `app_service` with RLS enforced.

| File | Result |
|---|---|
| `red/db-catalog-role.txt` | 1 failed, 1 passed. The viewer's call **stored** the record: `catalog_status` went from `extracted` to `cataloged`. The member case (the positive control) passes. |
| `green/db-catalog-role.txt` | 36 passed: this file, `document-catalog` (18) and `vault-placement`. The viewer is refused and the stored record is byte-for-byte unchanged; the member is accepted. |

Unit: 2,597 pass across `server/services/ana` and `server/services/vault`.
`document-catalog-tools-id-space.test.ts` now runs its calls in a member's
request scope, as production does; without one, the new role check answers
first. ESLint: 0 warnings on all changed files.

## Not changed here

`read_project_document` also writes when a viewer calls it: it adds read
receipts and backfills the extraction tier. Both are derived records of a read,
not content anyone else is shown as fact, so reads stay open to viewers.
