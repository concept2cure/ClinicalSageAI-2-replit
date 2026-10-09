# D3 — the cortex query route took its tenant from a client header

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-24. **Finding:** the vault re-baseline's unclaimed D3 item,
*"The cortex vault Q&A route takes its tenant key from the client's `x-org-uuid`
header"* (`docs/work-orders/README.md`). **Database:** PostgreSQL 16, provisioned
from empty by `scripts/db/provision-test-db.sh` at `0521402e`; the runtime
connects as `app_service` (not superuser, no BYPASSRLS) with `RLS_ENFORCE=on`.
See `posture.txt`.

**What this is not:** the row's closing evidence, which is the contract against
staging with the production image, owed with D1.

## It was not a fallback

`server/routes/cortexQueryRoutes.ts` read

```ts
req.tenantContext?.organizationUuid || req.headers['x-org-uuid']
```

It is mounted under `server/routes/cortex-unified.ts` at `/query`. That router's
own `extractTenantContext` **replaces** `req.tenantContext` with
`{ organizationId, clientWorkspaceId, module }` and never sets
`organizationUuid`. So on the mounted route the left side was always undefined,
and the header was the only tenant key the handler ever used:

- with a header naming another tenant, every mode queried that tenant;
- with no header, search ran `searchHybrid`'s branch with **no org predicate**,
  and graph mode answered an empty graph with `success: true`;
- a session with no usable org reached the pool with no tenant scope and failed
  closed as a 500.

The shared `tenantContext` middleware has had the opposite rule, pinned, for
some time — `server/__tests__/security/tenant-isolation-org-uuid.contract.test.ts`,
*"ignores a forged x-org-uuid header"*. This route never went through it.

## What contained it, and what did not

**Corrected the same day — the first version of this section was wrong for
half the route.** For the atom corpus, the database contained it:
`lumen_data_atoms` is FORCEd with `tenant_isolation_policy` keyed on the
**session's** GUC, `search_atoms_hybrid` is not SECURITY DEFINER, and
`/api/cortex` is not in `SYSTEM_SCOPE_PREFIXES`. A header naming B gave search
and graph modes "B's key under A's policy", which found nothing, and RLS was
the only thing in the way (mutation M1).

**For the vault corpus it was not contained.** Generate and advisory modes pass
the handler's `organizationUuid` into `ragRouter`. The RAG pipeline then
**writes that uuid into `app.current_org_id`**, the GUC vault RLS reads, and
uses it as the vault arm's SQL predicate too. So the old handler's header
decided which tenant's vault those two modes read, **with RLS enforcing**. The
re-baseline's original wording, "both its SQL predicate and RLS trust it", was
right. The pipeline mechanism is shown directly, as app_service with RLS on,
and fixed for every caller, in `../2026-09-24-rag-pipeline-tenant/`. The fix
here (the session's key only) had already closed this route's side of it.

## The contract

`tests/db/cortex-query-tenant-header.dbtest.ts` is its own file on the shared
two-tenant fixture, following the rule in `docs/work-orders/README.md`. It is
mounted exactly as production mounts it: the global `/api` auth boundary
(`createAuthBoundary`, which opens the request's tenant scope), then
`cortex-unified` at `/api/cortex`, which mounts this router at `/query`.
`initializeCortexAPI` receives `getPool()`, as `server/startup/routes.ts` passes
it. Only the query embedding is stubbed: a model call is irrelevant to tenancy
and unavailable offline.

| # | Case | Old handler, RLS on | Fixed, RLS on |
|---|---|---|---|
| 1 | A as itself finds its own atom, not B's (positive control) | pass | pass |
| 2 | A naming B in the header is served nothing of B's | pass (RLS) | pass |
| 3 | …and is served **its own** atom | **fail** — nothing | pass |
| 4 | no header: scoped to the session, not to nothing | **fail** — empty graph | pass |
| 5 | search mode asks `searchHybrid` for the session's key | **fail** — asked B's, then `undefined` | pass |
| 6 | a session with no usable org is refused (403) | **fail** — 500 | pass |

With RLS enforcing, cases 3–6 are the only ones that tell the handlers apart.
Case 2 passes both, because the database answered for the handler. That is the
same lesson as the Report OS contract (`../2026-09-24-report-os-tenant/`):
positive controls, not negative ones, are what fail when the app is wrong and
the database is right.

| File | Shows |
|---|---|
| `red/unfixed-route-rls-on.txt` | The old handler, RLS on: **4 fail, 2 pass** (cases 3–6). |
| `red/M1-rls-off-old-handler.txt` | RLS off on `lumen_data_atoms`, old handler: **5 fail**. Case 2 now reads *"tenant B's atom must never reach tenant A: expected … not to contain 'cortex-secret-B'"*. Naming B in a header was enough to be served B's atom. |
| `green/M2-rls-off-fixed-handler.txt` | RLS off, fixed handler: **6 of 6**. The fix holds without the policy. |
| `green/fixed-route-rls-on-6-of-6.txt` | The fix, RLS on: **6 of 6**. |

RLS was restored and re-read (`rls=true force=true`) after each mutation.

## The fix

`sessionOrgUuid(req)` in `cortexQueryRoutes.ts` works from the verified session
only. It takes the org from `authedOrgId` and narrows it with `usableOrgId`,
because `organizationId` 0 is a resolution failure, not an org. The org uuid
comes from the request's tenant scope when that carries one, and otherwise from
the organizations row for that id. A session with no usable org is answered
403, so no query runs without a tenant key, which also retires the unfiltered
branch on this route.

`tenant-isolation-org-uuid.contract.test.ts` and `evidence-ask.test.ts`, the
other tests that touch this header or route, still pass (12 of 12). ESLint
warnings on the route go from 3 to 2, and the new file has none.

## Found on the way — recorded, not fixed here (outside D3)

1. **`search_atoms_hybrid` cannot return a row on any installation built from
   empty.** It declares `structured_data jsonb`; `lumen_data_atoms.structured_data`
   is `json`. Every call fails, including against an **empty table** and a query
   matching nothing: *"structure of query does not match function result type —
   Returned type json does not match expected type jsonb in column 5"*
   (`red/search_atoms_hybrid-type-mismatch.txt`, both cases). Its callers are on launch
   paths:
   - `authoring.router.ts` (Authoring's AI draft). It handles the failure honestly as
     `retrievalStatus: 'failed'`, so every draft is reported ungrounded.
   - `chat/send-message.ts` (AnA chat).
   - `c2c/ai-editing.ts`, `evidence-ask.ts`, `deep-research.ts` and
     `advancedRAGPipeline.ts`.

   So search mode here is pinned only at the tenant key it requests, and graph
   mode, whose `searchSimilar` works, carries the end-to-end cases. Creators:
   `db/migrations/20260730_fix_atom_embedding_dimension.sql` and
   `20260125_add_atom_embeddings.sql`. Handed on in `docs/work-orders/README.md`.
2. **The same function is called with its arguments out of order.** The org
   branch passes `(query, vector, semanticWeight, limit)` into
   `(query_text, query_embedding, semantic_weight, keyword_weight, …)`, so the
   result limit becomes the keyword weight. The no-org branch passes
   `(query, vector, limit, semanticWeight)`, so the limit becomes the semantic
   weight. That is ranking, not isolation. It is handed on with item 1, since it
   cannot be observed until item 1 is fixed.
3. **`chat/send-message.ts` has the identical header fallback.** The D4 lane
   noted it (`../../D4/2026-09-24-passage-search-entry-points/`). It is the chat
   lane's file, so it is reported there, not edited here.
