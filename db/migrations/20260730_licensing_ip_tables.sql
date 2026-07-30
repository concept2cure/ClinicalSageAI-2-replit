-- ============================================================================
-- 20260730_licensing_ip_tables.sql
--
-- eCTD / REGULATORY AUDIT CONTEXT — schema-contract remediation (licensing + IP).
-- Backs queries the server runs against tables no migration created (repo-wide
-- schema-contract audit).
--
-- Evidence (exact referencing SQL) + severity:
--   licenses — server/routes/license-routes.js (full 20-column INSERT + several
--       UPDATE), server/services/quotaEnforcementService.js + atomicQuotaService.js
--       (SELECT ... WHERE organization_id=$1 AND status='active'),
--       server/routes/project-hierarchy.ts (JOIN client_workspaces). Highest
--       impact: some paths are NOT try/catch-guarded, so they 500 today.
--   patent_portfolio — server/routes/concept2cure.ts (SELECT ... WHERE
--       organization_id=$1 ORDER BY filing_date DESC; try/catch "may not exist").
--   predicate_intelligence_results — server/routes/concept2cure.ts (SELECT ...
--       WHERE organization_id=$1 ORDER BY decision_date DESC; try/catch).
--
-- Contracts extracted from the real SQL (licenses from its authoritative INSERT
-- column list; the other two from their SELECT column lists). id on `licenses` is
-- app-supplied (present in the INSERT), so TEXT with no default.
--
-- TENANCY NOTE (important): `licenses` carries organization_id (read by the quota
-- services) but the license-routes INSERT does NOT populate it — the code has two
-- divergent tenancy paths (organization_id vs client_id -> client_workspaces).
-- Because the write path leaves organization_id NULL, enabling RLS on `licenses`
-- now would make freshly-created licenses invisible once enforcement flips on.
-- So the column is created (queries work) but RLS is intentionally deferred until
-- the owner reconciles the two paths. patent_portfolio and
-- predicate_intelligence_results are read-only and org-filtered, so they safely
-- get the canonical tenant_isolation_policy.
--
-- Non-destructive + idempotent (CREATE TABLE IF NOT EXISTS; guarded policy).
-- ============================================================================

-- ── licenses (ACTIVE 500s on unguarded paths) ────────────────────────────────
CREATE TABLE IF NOT EXISTS licenses (
  id              TEXT PRIMARY KEY,           -- app-supplied in the INSERT
  client_id       TEXT,                       -- always CAST(... AS INTEGER) to join client_workspaces.id
  client_name     TEXT,
  company_name    TEXT,
  contact_email   TEXT,
  license_type    TEXT,
  license_key     TEXT,
  access_token    TEXT,
  max_users       INTEGER,
  max_submissions INTEGER,
  max_storage_gb  INTEGER,
  max_projects    INTEGER,
  features        JSONB,
  valid_from      TIMESTAMPTZ,
  valid_until     TIMESTAMPTZ,
  ip_restrictions JSONB,
  notes           TEXT,
  status          TEXT,
  organization_id INTEGER,                    -- read by quota services; NOT set by license-routes INSERT (see TENANCY NOTE)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS licenses_org_status_idx ON licenses (organization_id, status);
CREATE INDEX IF NOT EXISTS licenses_client_idx     ON licenses (client_id);

-- ── patent_portfolio (read-only, tenant-scoped) ──────────────────────────────
CREATE TABLE IF NOT EXISTS patent_portfolio (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   INTEGER,
  title             TEXT,
  patent_number     TEXT,
  jurisdiction      TEXT,
  status            TEXT,
  filing_date       DATE,
  expiration_date   DATE,
  inventors         JSONB,
  category          TEXT,
  fto_status        TEXT,
  related_compounds JSONB
);
CREATE INDEX IF NOT EXISTS patent_portfolio_org_idx ON patent_portfolio (organization_id, filing_date DESC);

-- ── predicate_intelligence_results (read-only, tenant-scoped) ─────────────────
CREATE TABLE IF NOT EXISTS predicate_intelligence_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  INTEGER,
  device_name      TEXT,
  pathway          TEXT,
  decision_date    DATE,
  predicate_device TEXT,
  outcome          TEXT,
  similarity       NUMERIC,
  key_questions    JSONB
);
CREATE INDEX IF NOT EXISTS predicate_intelligence_results_org_idx ON predicate_intelligence_results (organization_id, decision_date DESC);

-- ── RLS on the two read-only, org-filtered tables (canonical policy). ─────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['patent_portfolio', 'predicate_intelligence_results']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation_policy') THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format($pol$
        CREATE POLICY tenant_isolation_policy ON %I USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
          OR organization_id = NULLIF(current_setting('app.current_org_id', TRUE), '')::INT
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )$pol$, t);
    END IF;
  END LOOP;
END $$;
