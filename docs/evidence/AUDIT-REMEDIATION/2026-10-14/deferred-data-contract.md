# Deferred data reads — source contract before implementation

Scope: D01 GraphRAG and D04 MDX analytics. These remain outside the launch catalog; no navigation entitlement, module grant or production feature flag is widened. The user's audit-remediation instruction authorizes fixing the retained code. It supersedes WO-19's earlier decision to leave the graph reader inert; this work does not activate a launch surface.

## GraphRAG

Every graph SQL operation must use `requestPgClient(req)`, the authenticated request's pinned PostgreSQL connection. There is no `req.pool`, `app.pool` or shared-pool fallback. Missing organization identity is a 403; missing request database scope or an unreadable graph is unavailable, not a successful empty graph. Existing graph RLS predicates and organization checks remain intact. A runtime role must read positive rows for its scoped tenant and no other tenant or unattributed legacy rows. Tests must distinguish an initialized empty graph from a missing table. No model or other provider is called during verification.

## MDX analytics

Aggregate SQL uses the same request-scoped client and retains explicit organization predicates. Missing tables/columns and failed reads do not synthesize zero counts. A successful initialized aggregate can return zero activity. Missing peer cohorts or per-tool acceptance sources stay explicitly unavailable; they are never described as zero or populated from unmarked fixtures.

Reports and dossiers come from the canonical `GET /api/report-os/runs` register. Its existing authenticated, licensed and object-access checks remain authoritative; MDX does not introduce a second report-store reader or widen access. Report rows open the saved run through the canonical Reporting surface's existing `reportRunId` deep link. No completion percentage, signature, author or source version is invented for a report run. A report-library refusal, unreadable payload or missing schema is distinct from a confirmed empty register.

The underlying aggregate's monthly series counts actual submission dates, so its UI describes submission pace rather than clearance. Sources that cannot provide a supported pathway filter must not silently present organization totals as that pathway's totals.

Verification and remaining external-data blockers will be recorded here after the implementation checks complete.
