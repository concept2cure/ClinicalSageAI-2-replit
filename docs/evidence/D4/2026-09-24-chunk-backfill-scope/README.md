# D4: the passage-index backfill could not run where RLS is enforced, and a half-scope reported "nothing to do"

**Row:** D4 (the Vault's retrieval honest state). **Workstream:** the AnA
client-files lane. **Date:** 2026-09-24. **Reach:** `scripts/backfill-vault-chunks.mjs`,
the one operator tool for indexing the documents a tenant uploaded before
`ana.vault_chunking` was on for it. That toggle is off in every deployment, and
turning it on is the founder's decision. This tool is what makes turning it on
cover the tenant's existing documents.

## The defect

The script called `backfillVaultChunks(orgId)` with no tenant scope. Production
accepts only `RLS_ENFORCE=on`, and there the pool refuses every query issued
outside a scope, so the tool failed on its first query.

The obvious repair, a scope carrying the integer tenant id, has a worse failure.
The vault's RLS policies resolve the tenant from its **UUID**
(`identity.current_org_id()` reads only that). A scope without it sees no
documents, and the sweep reports `examined 0`. That is a backlog reported as
complete, which is what an operator would have got from the natural fix.

## The fix

`backfillVaultChunksForTenant(orgId, opts)` in
`server/services/vault/document-chunking-backfill.service.ts`:

1. Looks up the organization's UUID, for that one row, under the audited
   system scope.
2. Refuses an organization that does not exist, rather than sweeping nothing.
3. Runs the unchanged sweep in the tenant's own scope (integer id and UUID),
   where RLS confines it to that organization.

The script now calls it. `backfillVaultChunks` itself is unchanged; its
database-free unit tests (8) still drive it through `exec`.

## Evidence

The db runs are CI-shaped: `RLS_ENFORCE=on`, server pool as `app_service`.

| File | Result |
|---|---|
| `red/db-chunk-backfill.txt` | 2 passed, 2 failed. The two passing cases **characterise the defect**: the script's unscoped call is refused, and an id-only scope sees no document and reports `examined 0`, although the tenant has an unindexed document with text. The two failures are the missing entry point. |
| `green/db-chunk-backfill.txt` | 4 passed. The scoped entry point finds the tenant's document on a dry run, which embeds nothing and writes nothing, and it refuses an unknown organization. |

`ci:tenant-isolation`: 8 candidates before and after. ESLint: 0 on the service
and the test (the `.mjs` script is outside ESLint's scope).

## Not done here

An **applied** run embeds through the configured provider. It is not exercised
here, because a test must not spend on or send data to an external embedding
API. The embedding-residency question (chat and vault text sent to OpenAI for
every organization, while the DPA lists OpenAI as opt-in) is already with the
founder.
