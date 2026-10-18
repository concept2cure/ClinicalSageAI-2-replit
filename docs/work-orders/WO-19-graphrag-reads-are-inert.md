# WO-19 — GraphRAG reads return zero rows and report success

**To:** JM Smith · **From:** Claude Code · **Date:** 12 October 2026
**Status:** OPEN — needs a product decision, not a fix (two sections: §1 GraphRAG reads, §2 knowledge_documents)
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

---

# §2 — `knowledge_documents`: a dead table with a dead reader

**Added** 12 October 2026. Same migration
(`db/migrations/20260730_graphrag_knowledge_tables.sql`), same decision class,
different shape — so it belongs here rather than in a work order of its own.

## What it is

`knowledge_documents` is the fourth table that migration creates. The other
three were keyed and policied by
`db/migrations/20260813_knowledge_graph_tenant_keys.sql` — two in 2026-08,
`citation_chains` today. This one was not, and the baseline entry for it reads
"exempt — the unscoped search over it is not reachable", with a note that the
day the search is mounted it must be org-scoped.

That entry is accurate. It is also not the most useful thing that is true,
because measurement changes what this table IS:

| | |
|---|---|
| writers anywhere | **none** — one PGlite test fixture, nothing else |
| seeds in any migration | **none**, so under RULE 1 nothing can reach a deployed database |
| drizzle model | **none** |
| rows on a deploy-shaped database | **0** |
| readers | `getKnowledgeDocuments` in `server/sage-plus-service.ts` — **imported by nothing** |
| tenant column / RLS / policy | none / off / none |

So this is not a latent disclosure waiting for a mount. There is nothing to
disclose. It is a table nothing fills, read by a function nothing calls.

## Why it was not simply keyed

Giving it `organization_id` and the siblings' unconditional policy would have
been the symmetrical move, and it would have been wrong in two ways. There is
no attribution source to backfill from — `citation_chains` could be attributed
through `knowledge_graph_nodes`, and this has no equivalent — so every row
would be NULL and invisible. And the shape (`id, title, content, category,
status, created_at, updated_at`: no author, no project, no organisation) is a
**global reference catalogue**, which the baseline's own vocabulary has a
category for. A tenant key on shared reference data makes it unreadable, not
isolated.

Deciding whether it is global reference data or per-customer content is a
product question, and nothing in the repository answers it, because nothing
writes it.

## What was fixed anyway

Two fabrications on that unreachable path, both safe to change precisely
because there is no caller, and both now honest for whoever the first caller
turns out to be:

- **`getKnowledgeDocuments`** returned a SYNTHESIZED document row when `pool`
  was null — `{ id: 'fallback-1', title: 'Database connection required',
  status: 'active' }` — to a caller asking for knowledge-base documents. It
  throws now. CLAUDE.md: *"Fail closed, never fabricate … An error is never
  rendered as an empty result"*, and a fabricated row is worse than an empty
  one: `status: 'active'` presents an infrastructure failure as a published
  document.
- **`getComplianceStatus`** returned `{ status: 'pending', issues: [] }` for an
  absent row AND for a missing pool — a compliance verdict with an empty issue
  list, synthesized by a service. "No issues" is the most dangerous possible
  default for a compliance read. A missing pool throws now; an absent row
  returns `null`, so a caller can tell "never assessed" from "assessed and
  clear".

`csrReports` and `csrDetails` in the same file are string maps shaped like
schema, exported "for compatibility" and imported by nothing. Left alone:
removing them is the deletion-discipline question below.

## Three options, same as §1

1. **Delete** `getKnowledgeDocuments`, the two schema-shaped constants, and the
   table. The working agreement requires naming the reachable replacement by
   path before removing a capability — there is none, because there is no
   capability, which is exactly the case the agreement says is *"a product
   decision for the founder, not a cleanup"*.
2. **Build it.** If a global regulatory knowledge base is wanted, it needs a
   seed inside `C2C_MIGRATION_FILES` (the only path to a deployed database), a
   row-count assertion in that seed, a mounted route, and a decision recorded
   as global rather than tenant-scoped.
3. **Leave it, now that it no longer fabricates.** The honest status quo: a
   table with no rows and a reader with no callers, both of which now fail
   closed. Costs nothing and hides nothing.

Option 3 is where this change leaves it. Option 1 is cheap and needs one word
from the founder.
