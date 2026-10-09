# D6 — a tenant erasure could destroy vault documents the data return never contained, 2026-09-24

**Launch row:** D6, security posture — the per-tenant data-retention statement
(`docs/LAUNCH_DEFINITION_OF_DONE.md`). An offboarding customer receives a data
return (`exportTenantFull`); its receipt is what authorizes the purge
(`purgeTenant` verifies it). The return must therefore contain everything the
purge destroys.

**Whose defect.** Mine, from 2026-09-19 (this session). I widened the purge's
vault predicate to reach documents through their programme — the fix for vault
bytes surviving a GDPR erasure — and left the export reading
`vault.documents` by `organization_id` alone. Found by the 2026-09-24
re-verification of `VAULT_DATA_ROOM_ASSESSMENT_2026-09-05.md` and confirmed by
its adversarial skeptic.

## What was wrong

`vault.documents.organization_id` is nullable by design: NULL means the
programme is missing or soft-deleted. The purge
(`organization_id = $1 OR program_id IN (programmes of $1)`) reaches such a
document. The export (`organization_id::text = $1`) does not. So the purge's set
was strictly larger than the export's: a document on a soft-deleted programme
was destroyed without ever having been returned.

## The fix

One predicate, `VAULT_DOCUMENT_TENANCY` in
`server/services/tenant/vault-tenancy.ts`, read by both the purge
(`PURGE_PARENT_SCOPED`) and the export (`EXPORT_SCOPED_PREDICATES`). It lives in
its own module because the two cannot import each other: the purge already
imports the export to verify its receipt. Two copies is how they disagreed.

`vault.document_chunks` is still not exported, deliberately: it has no tenant
column and is derived — its passages are cut from each document's
`extracted_text`, which is exported with the document.

## Proof — real PGlite

`server/services/tenant/__tests__/tenant-purge-vault-scope.pglite.integration.test.ts`
now asserts, for each tenant, that **the purge set is a subset of the export
set** (equal here), and that no other tenant's document is exported.

| | |
|---|---|
| `red/export-vs-purge-before-fix.txt` | 2 of 9 fail: *"org 11 purges 44444444-…-000000000002 it never exported"* — the soft-deleted-programme document. |
| `green/export-vs-purge-after-fix.txt` | 9 of 9. |

## Not done here — owed, confirmed by the same re-verification

These are tenant-offboarding defects outside this fix; listed on the work-order
board for whoever takes the offboarding lane:
- the purge's `BEGIN`/`COMMIT`/`ROLLBACK` run on a Pool, not one checked-out
  client, so the "transaction" is not atomic;
- a partial or truncated export (`truncatedTables`, `tablesFailed`) still
  authorizes a full purge;
- the purge consults no legal hold;
- the data return carries no document **bytes** — rows only.
