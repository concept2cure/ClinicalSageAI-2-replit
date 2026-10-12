# WO-19 — GraphRAG reads return zero rows and report success

**To:** JM Smith · **From:** Claude Code · **Date:** 12 October 2026
**Status:** OPEN — needs a product decision, not a fix
**Row:** D3 (the isolation half is CLOSED; this is the honest-state half)

---

## The finding, in one paragraph

`server/routes/graphrag.ts` reads `knowledge_graph_nodes`,
`knowledge_graph_edges` and `citation_chains` through `getPool()` — the shared
pool. Those tables are policied by
`db/migrations/20260813_knowledge_graph_tenant_keys.sql` with an
**unconditional** predicate: `organization_id = current_setting(
'app.current_tenant_id')`, with no `app.rls_enforce` bypass arm and no
super-admin arm. That shape is deliberate and correct — it is what makes
unattributed legacy rows reach nobody instead of everybody. But a checkout from
the shared pool carries **no** `app.current_tenant_id`, so the predicate is NULL
for every row and every read returns **zero rows**. The routes then render that
as `success: true` with an empty graph.

So GraphRAG cannot leak, and it also cannot work. It has been returning "no
entities found" where the honest answer is "this connection cannot see the graph
at all."

## Measured, on a deploy-shaped database, as the real runtime role

```
# three nodes seeded, two of them attributed to orgs 91001 / 91002
app_service, NO tenant GUC  (the shared pool's posture)   kg_nodes visible: 0
app_service, app.current_tenant_id='91001'                 kg_nodes visible: 1
```

```sql
-- the live policy, verbatim from pg_policy
(organization_id = (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::integer)
```

No `app.rls_enforce`, no `app_super_admin`. Compare the parent-scoped sweep's
policy, which opens with `NULLIF(current_setting('app.rls_enforce', TRUE), '')
IS DISTINCT FROM 'on'` and is therefore *inert* rather than *closed* on an
unscoped connection. The two shapes behave in opposite directions on the same
connection, which is why this needed measuring rather than reasoning about.

## Why the shared pool carries no scope

`server/db/runtime.ts` (behind the `server/db.ts` re-export facade) sets no
session variables and installs no connect hook. `applySessionScope` is called
from exactly two places —
`server/middleware/establishRequestTenantScope.ts` and
`server/db/withTenantConnection.ts` — and both pin ONE connection and apply the
GUCs to that connection. An active AsyncLocalStorage tenant scope satisfies the
instrumented pool's fail-closed check, so the query is *permitted*; it does not
put a GUC on the connection the query runs on.

A comment in `resolvePool` asserted the opposite — "the canonical instrumented
pool (which carries RLS tenant scoping when a scope is active on the request)".
That sentence was false and is now corrected in place, with the measurement.

## What the fix is, and why a session did not make it

One line per read site: `requestPgClient(req)` from `server/db/requestDb.ts`
instead of `resolvePool(req)`. That client is the request-pinned connection that
carries the scope, and it is fail-closed by contract — it throws
`MissingRequestDbContextError` rather than falling back to the shared pool. The
router is mounted behind `authenticateToken`
(`server/bootstrap/register-advanced-platform-routes.ts:158`), which establishes
the request scope, so `req.dbClient` is present on every request that reaches
these handlers.

Ten call sites, six routes. It is a small change and it would make GraphRAG
serve data for the first time.

**It is not a session's call.** GraphRAG is not in the RULE 2 launch catalog
(Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS
controlled documents, Reporting & analytics, CMC / Module 3). Turning a
currently-inert non-catalog surface into a working one is adding a capability
while the launch rows are open, which RULE 2 reserves to the founder. The
isolation work was in scope and is done; this is not.

`server/routes/__tests__/graphrag.pool.test.ts` pins the CURRENT contract — it
asserts a bare app with no middleware is served by the `getPool()` fallback.
Whoever takes this decision replaces that test, because the premise it pins is
the defect.

## Three options

1. **Make it work.** Move the ten sites to `requestPgClient(req)`. Replace
   `graphrag.pool.test.ts` with one that proves an unscoped request is REFUSED
   with a stated reason rather than served an empty graph.
2. **Make it honest and leave it inert.** Keep the shared pool; have each route
   state that the graph is unavailable on this connection instead of returning
   an empty success. Cheapest, and it stops the surface lying.
3. **Unmount it.** The working agreement requires naming the reachable
   replacement by path before deleting a user-facing capability. There is no
   replacement for entity-graph retrieval today, so this is a product decision,
   not a cleanup.

Option 2 is the smallest change that removes the dishonesty, and it does not
spend the founder's launch budget on a non-catalog surface. Option 1 is what the
feature deserves once a launch row is not the constraint.

## What IS closed

`citation_chains` — the one table of the trio that
`20260813_knowledge_graph_tenant_keys.sql` originally skipped, and a live
cross-tenant read until 2026-10-12 — now carries `organization_id`, RLS, FORCE
and the same unconditional policy as its siblings, backfilled from
`knowledge_graph_nodes` where the citing document resolves to exactly one
organisation and left NULL, visible to nobody, where it does not.
Evidence: `docs/evidence/D3/2026-10-12-citation-chains-tenant-key/` and
`docs/evidence/D3/2026-10-12-graphrag-citation-trace/`.
