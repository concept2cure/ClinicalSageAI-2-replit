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
-- Depends on: db/migrations/20260306_precedent_engine.sql
-- =============================================================================

ALTER TABLE precedent.regulatory_precedents
    ADD COLUMN IF NOT EXISTS organization_id INTEGER;

-- Filtered-search support: most lookups carry submission_type + organization_id.
CREATE INDEX IF NOT EXISTS idx_precedent_org
    ON precedent.regulatory_precedents(organization_id);

COMMENT ON COLUMN precedent.regulatory_precedents.organization_id IS
    'NULL = public precedent shared by all tenants; non-NULL = private to that organization. The precedent engine returns public rows plus the caller''s own org rows only.';
