# A live cross-tenant read, found by working the baseline the gate told us to work

`ci:unkeyed-request-tables:unreviewed` has one sentence in its baseline header
that is the whole case for it:

> "unreviewed" is a DEFECT awaiting triage, not a category — three cross-tenant
> disclosures on 2026-09-10 were all tables that would have sat here as
> "unreviewed".

`citation_chains` sat there as "unreviewed". Working it produced a fourth.

## The exposure

`GET /api/graphrag/citation-trace/:documentId` read:

```sql
SELECT id, source_document_id, target_document_id, citation_type, context,
       page_number, section_id, confidence, created_at
FROM citation_chains
WHERE source_document_id = ANY($1::text[]) OR target_document_id = ANY($1::text[])
```

with `$1` initialised as `[req.params.documentId]` — **the request path
parameter, unchecked** — and widened by one hop per `?depth=` on each loop.

And `citation_chains` has no backstop. Measured on a deploy-shaped database:

```
columns:  id, source_document_id, target_document_id, citation_type, context,
          page_number, section_id, confidence, created_at
rls:      OFF
policies: 0
```

No tenant column, row-level security off, zero policies — while the two
sibling tables created by the *same* migration
(`db/migrations/20260730_graphrag_knowledge_tables.sql`),
`knowledge_graph_nodes` and `knowledge_graph_edges`, were given
`organization_id` **and** `tenant_isolation_policy`. The router is mounted
behind `authenticateToken` alone
(`bootstrap/register-advanced-platform-routes.ts:158`).

So **any authenticated user of any tenant** could pass another tenant's
document id and walk that tenant's citation graph: the linked document ids, the
citation type, the **`context` — the quoted source text** — the page number and
the section id, expanding to neighbouring documents at every hop.

The same file's *write* path already resolved an organisation and said why, in
a comment at `:762`, three hundred lines above a read that did not:

> tables now have organization_id with RLS enabled and FORCED, and the policy
> compares organization_id against the session tenant.

## The fix

The organisation is required, and a traversal may only start from — and step
through — documents this organisation can see, proved against
`knowledge_graph_nodes`, which **is** org-keyed and policied:

```sql
WHERE (
        (c.source_document_id = ANY($1::text[]) AND EXISTS (
           SELECT 1 FROM knowledge_graph_nodes n
            WHERE n.organization_id = $2::int
              AND n.source_document_id = c.source_document_id))
     OR (c.target_document_id = ANY($1::text[]) AND EXISTS (
           SELECT 1 FROM knowledge_graph_nodes n
            WHERE n.organization_id = $2::int
              AND n.source_document_id = c.target_document_id))
      )
```

Both arms are needed: a chain is reachable from either end, and the end that
matched the frontier is the one that must be visible. A request with no
resolvable organisation is refused `403 ORG_REQUIRED` before any read, matching
the house pattern.

The second citation read, inside `POST /query`, took its ids from an RLS-scoped
traversal and was therefore already this tenant's — but the constraint is now
stated there too rather than assumed, and when no organisation resolves the
citation enrichment is **skipped** rather than run unscoped.

**The structural fix is not this.** `organization_id` on `citation_chains` with
RLS is the durable answer, and its backfill source is the same
`knowledge_graph_nodes` this query uses — so it is a data migration with a
known source, not a guess. That is the follow-up; this closes the read today.

## Measurements

`measured.txt`: the table's posture read live; the two cases red on the
unfixed route; green with the fix alongside both existing graphrag suites
(3 files, 11 tests); `tsc --noEmit` exit 0; and two mutations each caught by
the case written for it — dropping the organisation refusal, and dropping the
org-keyed `EXISTS`.

## Why this one was reachable and `submission_projects` was not

Worth recording together, because the same sweep found both.
`submission_projects` / `submission_tasks` carry no tenant column either and
their routes read them with no predicate at all — but
`server/bootstrap/register-governance-routes.ts:51-63` deliberately does not
mount that router, and says so at length, ending: *"this is an unscoped write
API with no consumer, one INSERT away from being a live cross-tenant hole.
Unmounting removes that today."* That is the difference between a defect that
is contained and one that is live. GraphRAG is mounted.
