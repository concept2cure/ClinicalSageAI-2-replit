# D5: an upload no longer sets a Vault version's lineage

**Row:** D5 (the record of what was admitted). **Workstream:** the AnA
client-files lane (`…01DiJJAk`). **Date:** 2026-09-26. **Source:** VR-05's test
list in `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`: "A raw
supersedesId or parentDocumentId in the ingest body returns 400. Red today:
persisted."

## The defect

`POST /api/vault/ingest` accepted `parentDocumentId` and `supersedesId` as any
UUID and wrote them to the new version's record. Nothing checked that they
named a document at all, or one in the same program or organization. No client
sends them (`useVaultUpload.ts`, `Etmf.tsx`, AnA's filing tool, which calls the
service directly), so the only way to set a version's lineage was a raw API
call that could name anything. Lineage is part of the record VR-06 freezes.

## The fix

The route refuses either field with `400 LINEAGE_NOT_ACCEPTED`, before
validation and before anything is stored, with a message that says nothing was
saved. It is refused rather than dropped, so a caller that sent lineage is not
told a record was made the way it asked. The schema no longer carries the
fields, and the route no longer passes them to the ingest. How lineage should
be set (a governed, program-checked writer) is for whoever defines it; nothing
sets it today.

## Evidence

| File | Result |
|---|---|
| `red/unit-vault-ingest-lineage.txt` | Before the fix: 2 failed, 1 passed. Each field was accepted and passed to the ingest. The control (an upload with no lineage) passes. |
| `green/unit-vault-ingest-route.txt` | 197 passed across 18 files: the new suite and every suite that drives the ingest route. |

`tests/db/vault-ingest.dbtest.ts` and `vault-reupload.dbtest.ts` pass on
PostgreSQL as `app_service` with RLS on. ESLint is 0 on the route and the new
test, as at HEAD.
