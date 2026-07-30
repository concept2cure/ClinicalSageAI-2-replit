-- ─────────────────────────────────────────────────────────────────────────────
-- artifacts — chat-generated artifacts (outlines, validation reports, drafts)
--
-- WHY THIS EXISTS
-- Two shipped code paths address `artifacts`:
--
--   writer  server/routes/chat-actions.ts:152
--           INSERT INTO artifacts (...) ON CONFLICT (id) DO NOTHING
--           mounted at /api by server/bootstrap/register-advanced-platform-routes.ts:290
--   reader  server/routes/workspace-summary.ts:150
--           SELECT id, type, title, status, project_id, created_at
--           FROM artifacts WHERE org_id = $1 ORDER BY created_at DESC LIMIT 5
--
-- and NOTHING IN THIS REPOSITORY CREATES IT. Verified: no CREATE TABLE and no
-- CREATE VIEW in any .sql (archived or not), no pgTable/pgView in shared/, no
-- runtime DDL in server/.
--
-- TWO DIFFERENT DATABASES, TWO DIFFERENT FAILURES. This migration must handle
-- both, because they genuinely differ:
--
--   Freshly provisioned (install-fresh + deploy-migrate, i.e. what a new
--   deployment gets): `artifacts` does not exist at all. Every INSERT fails with
--   "relation does not exist". The write is fire-and-forget and its .catch
--   swallowed the error, so the request still returned ok:true — every artifact a
--   user generated was discarded while the response said it was saved, and the
--   workspace's "Recent artifacts" panel had nothing to read. This is the failure
--   mode scripts/ci/check-unbacked-tables.mjs documents in its own header: "a
--   write wrapped in try/catch degrades to a silent no-op".
--
--   Long-lived databases (the Neon preview branch, which mirrors the real
--   schema): a VIEW named `artifacts` already exists. It is out-of-band DDL —
--   applied by hand at some point and never committed — so it is invisible to
--   this repo, cannot be rebuilt, and is why the name looked "unbacked" to the
--   scanner. An earlier revision of this file assumed absence, and on that
--   database CREATE TABLE IF NOT EXISTS silently no-opped (the name was taken)
--   and the follow-on CREATE INDEX failed with "cannot create index on relation
--   artifacts / This operation is not supported for views". CI caught it.
--
-- SO THIS FILE IS CONDITIONAL, BY RELKIND. It creates the table only when the
-- name is genuinely free, and it never touches a relation it did not create:
--   • nothing there  → create the table, its index and its tenant policy.
--   • a real table   → ensure the index and policy (idempotent re-run).
--   • a view/matview → leave it ENTIRELY alone and RAISE a warning naming the
--                      divergence, because silently "fixing" a production object
--                      of unknown provenance is worse than the divergence.
--
-- COLUMN TYPES follow the call sites, not a guess:
--   id          TEXT    — the writer mints `val-${Date.now()}` style keys, not
--                         UUIDs, and depends on ON CONFLICT (id), so it is the PK.
--   org_id      INTEGER — the app tenant model, and what 0021's policy casts to.
--   project_id  TEXT    — comes from a URL param; no FK is asserted because the
--                         writer does not guarantee the project exists.
--   created_at          — the reader ORDER BYs it and the writer never sets it,
--                         so it must default.
--
-- Idempotent and safe to re-run on any of the three states.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    kind "char";
BEGIN
    SELECT c.relkind INTO kind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'artifacts';

    -- ── A view (or materialized view) already owns the name ──────────────────
    IF kind IN ('v', 'm') THEN
        RAISE WARNING USING MESSAGE =
            'artifacts already exists as a ' ||
            CASE kind WHEN 'v' THEN 'view' ELSE 'materialized view' END ||
            ' created outside this repository. Leaving it untouched: no index, no '
            'RLS policy (neither is supported on a view). This database carries a '
            'relation no migration defines, so it cannot be rebuilt from source — '
            'capture its definition into a migration, or drop it so this table can '
            'own the name.';
        RETURN;
    END IF;

    -- ── Nothing there: create the table ──────────────────────────────────────
    IF kind IS NULL THEN
        CREATE TABLE public.artifacts (
            id          TEXT PRIMARY KEY,
            org_id      INTEGER NOT NULL,
            project_id  TEXT,
            type        TEXT NOT NULL DEFAULT 'document',
            title       TEXT,
            status      TEXT NOT NULL DEFAULT 'generated',
            payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by  TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    END IF;

    -- ── Real table (just created, or already present): ensure index + policy ─
    -- Serves the reader's exact access pattern: newest-first within one org.
    CREATE INDEX IF NOT EXISTS artifacts_org_created_idx
        ON public.artifacts (org_id, created_at DESC);

    -- Tenant isolation. migrations/0021_enable_rls_everywhere.sql policies every
    -- table carrying an org_id/tenant_id, but it is a DYNAMIC migration that has
    -- already run on every provisioned database and never revisits tables added
    -- later. A new tenant table with no policy of its own is fully readable
    -- across tenants once RLS_ENFORCE=on — so the policy ships WITH the table.
    -- Shape copied verbatim from 0021 so the two converge: shadow-mode bypass
    -- when app.rls_enforce is not 'on', tenant match against either session
    -- variable, super-admin escape hatch.
    ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.artifacts FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON public.artifacts;
    CREATE POLICY tenant_isolation_policy ON public.artifacts
      FOR ALL
      USING (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR org_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR org_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
      WITH CHECK (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR org_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR org_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
END $$;
