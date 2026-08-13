-- 20260813_knowledge_graph_tenant_keys.sql
--
-- Give the shared knowledge graph a tenant key, so one organization's document
-- entities stop surfacing to another.
--
-- ── The exposure ─────────────────────────────────────────────────────────────
-- The 2026-08 assessment: "The shared knowledge-graph (GraphRAG) and the
-- CSR-analytics cache are tenant-less — one tenant's document entities and
-- portfolio metrics surface to another." Still true when checked against a
-- freshly provisioned database:
--
--   knowledge_graph_nodes         org column: NONE   RLS: off
--   knowledge_graph_edges         org column: NONE   RLS: off
--   lumen_knowledge_graph_edges   org column: NONE   RLS: off
--
-- while their siblings extracted_graph_edges, rag_knowledge_graph and
-- section_graph_nodes all carry organization_id WITH RLS on — so this is drift,
-- not a deliberate design.
--
-- server/routes/graphrag.ts writes extracted document entities into these tables
-- ("Store entities in knowledge_graph_nodes") and reads them back with no tenant
-- predicate at all — the file contains no getSecureOrgId, no requestDb, no
-- req.user. The clearest instance is the vector search:
--
--   SELECT id, name, entity_type, 1 - (embedding <=> (...)) AS similarity
--     FROM knowledge_graph_nodes
--    WHERE embedding IS NOT NULL
--    ORDER BY embedding <=> (...)
--
-- Tenant A ingests a protocol; the entities it mentions become rows here.
-- Tenant B asks a semantically related question; the nearest neighbours are A's
-- rows. For a regulated platform holding unannounced programmes, the leaked
-- entity NAMES are the confidential part.
--
-- ── Why nullable, and why NULL is invisible ──────────────────────────────────
-- Existing rows cannot be attributed: nothing recorded who wrote them, so any
-- backfill would be a guess, and guessing wrong assigns one tenant's data to
-- another — the very failure being fixed. The column is therefore nullable, and
-- the policy below makes NULL rows visible to NOBODY rather than to everybody.
-- Unattributed history stops being served (fail closed); it is preserved on disk
-- for an operator to attribute or purge deliberately. The alternative — leaving
-- them readable until someone backfills — keeps the leak open for exactly as
-- long as the cleanup is postponed.
--
-- ── Why the policy is written here rather than left to the sweep ─────────────
-- 20260801_tenant_isolation_sweep.sql auto-policies org-keyed tables and runs
-- after this file, so it WOULD cover them. It is allowed to: this file's
-- policies are created IF NOT EXISTS-style (guarded on pg_policies) and the
-- sweep only adds where none exists, so whichever runs first wins and the other
-- is a no-op. Writing them here means the tables are never policy-less between
-- the two migrations, and it states the NULL-invisible rule explicitly rather
-- than inheriting whatever the generic sweep would emit.
--
-- Idempotent throughout; safe to re-run on every deploy.

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['knowledge_graph_nodes', 'knowledge_graph_edges', 'lumen_knowledge_graph_edges'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '[kg-tenant] % absent — skipping', t;
      CONTINUE;
    END IF;

    -- INTEGER to match organizations.id and every other tenant key in public;
    -- ci:tenant-column-types fails the build on a TEXT-typed tenant column.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN organization_id INTEGER', t);
      RAISE NOTICE '[kg-tenant] % gained organization_id', t;
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id)', 'idx_' || t || '_org', t);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

    -- USING and WITH CHECK both compare against the session tenant. The NULL
    -- comparison yields NULL — not true — so unattributed rows match no tenant
    -- and are served to no one. That is the intended fail-closed behaviour, and
    -- tests/db/knowledge-graph-tenant-isolation.dbtest.ts pins it.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t AND policyname = 'tenant_isolation_policy'
    ) THEN
      EXECUTE format($p$
        CREATE POLICY tenant_isolation_policy ON public.%I
          USING (organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER)
          WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER)
      $p$, t);
      RAISE NOTICE '[kg-tenant] % policied', t;
    END IF;
  END LOOP;
END
$$;

COMMIT;
