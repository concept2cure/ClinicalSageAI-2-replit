# citation_chains gets a tenant key — the structural half

**Row** D3 (tenant isolation). **Date** 2026-10-12.
**Pairs with** `docs/evidence/D3/2026-10-12-graphrag-citation-trace/`, which
closed the route-level disclosure the same day.

## What was open

`db/migrations/20260730_graphrag_knowledge_tables.sql` created three tables.
`db/migrations/20260813_knowledge_graph_tenant_keys.sql` gave two of them a
tenant key, RLS, FORCE and a policy — and left the third out. On a provisioned
database:

```
 citation_chains       | rls: f | force: f | policies: 0
 knowledge_graph_edges | rls: t | force: t | policies: 1
 knowledge_graph_nodes | rls: t | force: t | policies: 1
```

That omission was a live cross-tenant read, not a theoretical one:
`GET /api/graphrag/citation-trace/:documentId` walked
`WHERE source_document_id = ANY($1) OR target_document_id = ANY($1)` from an
unchecked path parameter, one hop per `?depth=`, behind `authenticateToken`
alone. The route was fixed first because that stopped the bleeding. This is the
structural half, so the next reader of the table inherits the isolation instead
of having to remember it.

## What changed

`citation_chains` joins the migration's table list, so it gets the same
`organization_id INTEGER`, index, `ENABLE`/`FORCE ROW LEVEL SECURITY` and the
same unconditional policy as its two siblings. Plus a backfill.

**The backfill's rule.** A citation row records "source cites target", so it
belongs to whoever owns the **citing** document. Attribution reads
`knowledge_graph_nodes`, which already carries `organization_id` for a
`source_document_id`, and only where that document resolves to **exactly one**
organisation. A document named by two organisations' nodes, or by none, keeps
`organization_id` NULL — and NULL matches no tenant under this policy, so the
row is served to nobody while staying on disk for deliberate attribution or
purge. That is the file's existing determinism contract, applied to the new
table rather than reinvented for it.

## Measured — all four properties, as the real runtime role

```
app_service, NO tenant scope                 visible: 0        (fail closed)
app_service, app.current_tenant_id='91001'   probe-cite-A      (its own row only)
app_service, app.current_tenant_id='91002'   probe-cite-B      (its own row only)
91001 inserting a row that claims 91002      ERROR: new row violates
                                             row-level security policy
```

And the backfill:

```
first apply   [kg-tenant] citation_chains gained organization_id
              [kg-tenant] citation_chains: 2 row(s) attributed, the rest stay NULL
re-apply      [kg-tenant] citation_chains: 0 row(s) attributed, the rest stay NULL
```

The re-run attributing 0 is the idempotency proof: it does not re-touch a row
already attributed, so an operator's deliberate attribution survives every
later deploy (RULE 1 — this file is replayed unconditionally).

An ambiguous document, named by nodes of BOTH tenants, stayed NULL:

```
       id       | source_document_id | organization_id
----------------+--------------------+-----------------
 probe-cite-A   | probe-doc-A        |           91001
 probe-cite-AMB | probe-doc-AMB      |
 probe-cite-B   | probe-doc-B        |           91002
```

## The ordering claim, and the first attempt to prove it that failed

The header note says the backfill block must sit ABOVE the loop, because the
loop sets FORCE ROW LEVEL SECURITY and the policy admits nothing without a
tenant GUC — so a backfill written after it would match zero rows and report
success.

**The first attempt to demonstrate that disproved it.** A variant of the
migration with the block moved below the loop, applied with `psql` as
`postgres`, attributed its row normally:

```
[kg-tenant] citation_chains gained organization_id
[kg-tenant] citation_chains policied
[kg-tenant] citation_chains: 1 row(s) attributed
```

The reason is the one this repository has already paid for twice: **a superuser
bypasses RLS outright.** FORCE subjects the table OWNER to policies; it has no
power over a superuser. So the probe proved nothing about the estates that
matter.

Re-measured with a `NOSUPERUSER NOBYPASSRLS` role owning the table — which is
what `deploy-migrate`'s split-role mode (`DATABASE_OWNER_URL`) uses, and what
every AWS RDS estate has, since RDS has no true superuser:

```
 citation_chains_owner | rolsuper | rolbypassrls
-----------------------+----------+--------------
 probe_owner           | f        | f

# the backfill UPDATE, same SQL, no tenant GUC, FORCE RLS on:
probe-c org = NULL
```

Zero rows matched. No error. The UPDATE reported success and did nothing —
exactly the failure the ordering prevents, visible only on a non-superuser
applier. The header now records both measurements and names which applier each
one describes, because the laptop result is the one that would survive review.

## Verify by making the check fail

`tests/db/knowledge-graph-tenant-isolation.dbtest.ts` gained three cases and
its posture assertion went 3 tables → 4. Three runs:

### As shipped — 10 passed (was 7)

```
 ✓ does not serve one tenant's citation context to another
 ✓ refuses a citation row that claims another tenant (WITH CHECK)
 ✓ attributes a citation from its citing document, and leaves an ambiguous one to nobody
 Tests  10 passed (10)
```

### Column and policy removed, and `citation_chains` deleted from the migration
so `beforeAll` cannot restore them — **4 failed:**

```
× carries a tenant key with RLS enabled AND forced on every graph table
    → expected { table: 'citation_chains', …(3) } to deeply equal …
× does not serve one tenant's citation context to another
    → column "organization_id" of relation "citation_chains" does not exist
× refuses a citation row that claims another tenant (WITH CHECK)
    → expected [Function] to throw /row-level security/i but got 'column … does not exist'
× attributes a citation from its citing document, …
    → expected [] to deeply equal [ 'dbtest-kg-isolation-cite-bf-one' ]
 Tests  4 failed | 6 passed (10)
```

### Policy made LEAKY — column present, RLS and FORCE on, `USING (true) WITH
CHECK (true)` under the same name — **3 failed, and the posture assertion
passed:**

```
 ✓ carries a tenant key with RLS enabled AND forced on every graph table
× does not serve one tenant's citation context to another
    → expected [ …(2) ] to deeply equal [ 'dbtest-kg-isolation-cite-90001' ]
× refuses a citation row that claims another tenant (WITH CHECK)
    → promise resolved "Result{ command: 'INSERT', …}" instead of rejecting
× attributes a citation from its citing document, …
    → expected [ …(2) ] to deeply equal [ 'dbtest-kg-isolation-cite-bf-one' ]
 Tests  3 failed | 7 passed (10)
```

Same lesson as the `capa_records` / `q_submissions` pair earlier today: a
policy that exists, is enabled and is FORCEd satisfies the structural check
completely while disclosing everything. The structural assertion cannot see a
wrong predicate; only the behavioural cases can.

### Restored — migration re-applied unchanged, 10 passed.

## The finding this uncovered, recorded not fixed

On the shared pool these policies admit **nothing**, because the policy is
unconditional and `server/db/runtime.ts` sets no session scope. GraphRAG's
reads therefore return zero rows and report success — fail-closed, and inert.
That is `docs/work-orders/WO-19-graphrag-reads-are-inert.md`: a product
decision, because making a non-catalog surface work is a RULE 2 capability
addition. The false comment in `resolvePool` that claimed the pool "carries RLS
tenant scoping when a scope is active on the request" is corrected in place,
with the measurement.
