-- =============================================================================
-- Precedent corpus — tenant isolation by construction
--
-- precedent.regulatory_precedents is a shared, public precedent corpus (FDA
-- approvals/rejections, public regulatory record) and has historically had NO
-- organization scoping. That is correct for public precedents, but it means an
-- org-private precedent (e.g. one extracted from a client's own CSR) would, if
-- ever ingested, be visible to every tenant.
--
-- This migration adds a NULLABLE organization_id:
--   * organization_id IS NULL  → public precedent (shared by all tenants) — the
--                                existing behaviour for every current row.
--   * organization_id = <id>   → private to that organization.
--
-- The precedent engine filters `(organization_id IS NULL OR organization_id =
-- $org)`, so the public corpus is unchanged today and any future org-private
-- precedent is isolated by construction. No backfill is required: existing rows
-- default to NULL (public).
--
-- Guarded: the precedent schema/table only exists where the precedent engine is
-- provisioned (see db/migrations/20260306_precedent_engine.sql). When it is
-- absent, this migration is a safe no-op.
--
-- AMENDED IN PLACE 2026-09-22 (no applier had ever run this file, so no journal
-- hash drifts; CLAUDE.md RULE 1):
--   1. It is now in C2C_MIGRATION_FILES, directly after 20260306_precedent_engine.
--      Until then the column existed on no deployed database, and the line this
--      header used to end with — "the precedent engine already degrades
--      gracefully when the table/column is absent" — WAS the defect: every
--      corpus search raised 42703, a catch turned it into [], and the precedent
--      board told users "your organization's corpus has none" about a corpus it
--      had never read. The engine now lets that error surface.
--   2. It now carries the table's RLS policy. A nullable integer
--      organization_id on a request-path table must be policied
--      (scripts/db/rls-coverage-check.sql fails CI otherwise), and neither
--      tenant sweep reaches the `precedent` schema. The policy is the sweep's
--      integer shape plus a NULL arm in USING only — public rows stay readable
--      by every tenant — and WITHOUT the NULL arm in WITH CHECK: under
--      enforcement, tenant code can write only rows for its own organization.
--      A tenant's own precedent (a manual ingest, a sponsor's submission
--      outcome) can never land in the shared public corpus by default.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'precedent'
          AND table_name = 'regulatory_precedents'
    ) THEN
        ALTER TABLE precedent.regulatory_precedents
            ADD COLUMN IF NOT EXISTS organization_id INTEGER;

        CREATE INDEX IF NOT EXISTS idx_precedent_org
            ON precedent.regulatory_precedents(organization_id);

        COMMENT ON COLUMN precedent.regulatory_precedents.organization_id IS
            'NULL = public precedent shared by all tenants; non-NULL = private to that organization. The precedent engine returns public rows plus the caller''s own org rows only.';

        ALTER TABLE precedent.regulatory_precedents ENABLE ROW LEVEL SECURITY;
        ALTER TABLE precedent.regulatory_precedents FORCE ROW LEVEL SECURITY;

        -- Never clobber an existing policy (replay-safe; a later, stricter
        -- policy must not be silently replaced by this one).
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'precedent'
              AND tablename  = 'regulatory_precedents'
              AND policyname = 'tenant_isolation_policy'
        ) THEN
            CREATE POLICY tenant_isolation_policy ON precedent.regulatory_precedents
                FOR ALL
                USING (
                    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
                    OR organization_id IS NULL
                    OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
                    OR organization_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
                    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
                )
                WITH CHECK (
                    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
                    OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
                    OR organization_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
                    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
                );
        END IF;
    ELSE
        RAISE NOTICE 'precedent.regulatory_precedents not present; skipping org-isolation column (no-op).';
    END IF;
END $$;
