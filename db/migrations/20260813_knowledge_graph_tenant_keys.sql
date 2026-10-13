-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Give the shared knowledge graph a tenant key and RLS, so one
--          sponsor's extracted document entities stop surfacing to another.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting — entities are extracted from any module's
--     source documents (protocols, CSRs, CMC narratives)
--   - Integrity Risk Addressed: tenant isolation. Semantic search returned
--     nearest-neighbour entities across organizations; on a platform holding
--     unannounced programmes the entity NAMES are the confidential part.
--
-- Determinism Contract:
--   - Rows that cannot be attributed keep organization_id NULL and are visible
--     to NOBODY (fail closed) rather than to everybody. Unattributed history is
--     preserved on disk for deliberate attribution or purge, never served.
-- =============================================================================
--
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
-- ── AMENDED IN PLACE 2026-10-12 (D3) ────────────────────────────────────────
-- citation_chains joins the list. It is the third table 20260730_graphrag_
-- knowledge_tables.sql created and the only one of the trio this file left
-- out, so on a provisioned database it stood at: org column NONE, RLS off,
-- zero policies — while its two siblings were keyed and policied by the loop
-- below. On 2026-10-12 that was found to be a LIVE cross-tenant read:
-- GET /api/graphrag/citation-trace/:documentId walked
-- `WHERE source_document_id = ANY($1) OR target_document_id = ANY($1)` from an
-- unchecked path parameter, one hop per `?depth=`, behind authenticateToken
-- alone — so any authenticated user of any tenant could read another tenant's
-- citation graph: the linked ids, the citation type, the quoted `context`, the
-- page and the section. The route was fixed the same day
-- (docs/evidence/D3/2026-10-12-graphrag-citation-trace/); this is the
-- structural half, so the next reader of this table inherits the isolation
-- instead of having to remember it.
--
-- The backfill is in its own block ABOVE the loop, and that order is
-- load-bearing ON THE ESTATES THAT MATTER. The loop sets FORCE ROW LEVEL
-- SECURITY, which subjects the table OWNER to the policy, and the policy admits
-- nothing on a connection carrying no app.current_tenant_id. Both halves were
-- measured, because the first attempt to show it failed and the reason is the
-- point:
--
--   applier = SUPERUSER (a local psql as postgres; a single-role estate whose
--     applier is a superuser) -> RLS is bypassed outright, FORCE has no power
--     over a superuser, and a backfill written AFTER the loop attributed its
--     row normally. Ordering is invisible here, which is exactly why it would
--     survive review on a laptop.
--
--   applier = NON-SUPERUSER OWNER (deploy-migrate's split-role mode,
--     DATABASE_OWNER_URL; and every AWS RDS estate, which has no true
--     superuser) -> the same UPDATE matched ZERO rows and reported success.
--     The row stayed NULL. A backfill that silently does nothing, on a green
--     deploy.
--
-- So the block stays above the loop, where it runs before the policy exists and
-- behaves identically under both appliers. Nothing is removed from this file.
-- Evidence docs/evidence/D3/2026-10-12-citation-chains-tenant-key/.
--
-- Idempotent throughout; safe to re-run on every deploy.

BEGIN;

-- ── citation_chains: column + attribution, BEFORE the loop policies it ──────
-- A citation row records "source_document_id cites target_document_id". It
-- belongs to whoever owns the CITING document, so attribution reads
-- knowledge_graph_nodes — the table that already carries organization_id for a
-- source_document_id — and only where that document resolves to EXACTLY ONE
-- organisation. A document whose nodes span two organisations, or that has no
-- node at all, keeps organization_id NULL and is therefore served to nobody by
-- the policy below. Guessing would assign one tenant's citation context to
-- another, which is the failure this file exists to fix; the file's
-- determinism contract already states that rule for the legacy node rows.
DO $$
DECLARE
  attributed integer := 0;
BEGIN
  IF to_regclass('public.citation_chains') IS NULL
     OR to_regclass('public.knowledge_graph_nodes') IS NULL THEN
    RAISE NOTICE '[kg-tenant] citation_chains or knowledge_graph_nodes absent — backfill skipped';
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'citation_chains'
         AND column_name = 'organization_id'
    ) THEN
      ALTER TABLE public.citation_chains ADD COLUMN organization_id INTEGER;
      RAISE NOTICE '[kg-tenant] citation_chains gained organization_id';
    END IF;

    -- And the column this backfill READS, for the same reason it adds its own.
    --
    -- The loop below adds organization_id to knowledge_graph_nodes, and this
    -- block runs BEFORE the loop (it must: the policy the loop creates would
    -- filter the owner's own UPDATE to zero rows — see the header note). So on
    -- a path where nothing has added it yet, the attribution query below fails
    -- with `column n.organization_id does not exist` and takes the whole file
    -- with it. That is not hypothetical: it halted deploy-migrate at file
    -- 172/375 on a database provisioned from empty on 2026-10-13. install-fresh
    -- did NOT show it, because drizzle-kit push has already created the column
    -- by the time the overlay runs there — the two provisioning paths disagree
    -- about what exists at this point, and only the deploy path exposed it.
    --
    -- Adding it here is the same ALTER the loop performs, guarded the same way,
    -- so the loop finds it present and skips. Order preserved, dependency
    -- removed.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'knowledge_graph_nodes'
         AND column_name = 'organization_id'
    ) THEN
      ALTER TABLE public.knowledge_graph_nodes ADD COLUMN organization_id INTEGER;
      RAISE NOTICE '[kg-tenant] knowledge_graph_nodes gained organization_id (ahead of the loop, so the citation backfill can read it)';
    END IF;

    -- Only rows still unattributed, so a re-run never overwrites an
    -- attribution an operator made deliberately.
    WITH unambiguous AS (
      SELECT n.source_document_id AS doc, min(n.organization_id) AS org
        FROM public.knowledge_graph_nodes n
       WHERE n.organization_id IS NOT NULL
         AND n.source_document_id IS NOT NULL
       GROUP BY n.source_document_id
      HAVING count(DISTINCT n.organization_id) = 1
    )
    UPDATE public.citation_chains c
       SET organization_id = u.org
      FROM unambiguous u
     WHERE c.organization_id IS NULL
       AND c.source_document_id = u.doc;
    GET DIAGNOSTICS attributed = ROW_COUNT;
    RAISE NOTICE '[kg-tenant] citation_chains: % row(s) attributed, the rest stay NULL (served to nobody)', attributed;
  END IF;
END
$$;

DO $$
DECLARE
  t text;
  -- citation_chains added 2026-10-12 (D3); see the header note. Its column is
  -- already present by the time the loop runs, so the loop only adds the
  -- index, RLS, FORCE and the policy.
  tables text[] := ARRAY['knowledge_graph_nodes', 'knowledge_graph_edges',
                         'lumen_knowledge_graph_edges', 'citation_chains'];
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
