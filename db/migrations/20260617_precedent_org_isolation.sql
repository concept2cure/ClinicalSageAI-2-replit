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
-- absent (e.g. a minimal preview/baseline database that applies only this PR's
-- new migrations), this migration is a safe no-op. The precedent engine already
-- degrades gracefully when the table/column is absent.
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
    ELSE
        RAISE NOTICE 'precedent.regulatory_precedents not present; skipping org-isolation column (no-op).';
    END IF;
END $$;
