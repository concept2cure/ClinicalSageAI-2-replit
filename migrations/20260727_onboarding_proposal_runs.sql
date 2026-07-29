-- ============================================================================
-- AnA onboarding — durable proposal runs
-- ============================================================================
--
-- The governed onboarding commit (POST /api/onboarding/commit) may only apply
-- what the SERVER extracted: ingest records its own proposals, and the commit
-- re-reads them so a caller can never supply provenance, confidence, or an
-- "approved" claim of its own. This table is that record.
--
-- Why durable rather than in-memory:
--   * a review survives a restart or a different node, instead of the client
--     being told to re-upload mid-review;
--   * the suggestions a human REJECTED stay inspectable. Values that were
--     committed are already recorded per-field in the sha256-chained audit
--     trail; what was declined would otherwise leave no trace.
--
-- What is NOT stored: the uploaded document itself and its text. Only the
-- extracted field proposals (value, provenance excerpt, confidence) are kept,
-- and rows are deleted once a run is committed or expires — so an abandoned
-- onboarding upload leaves nothing behind.
--
-- Tenant isolation: organization_id carries the same tenant_isolation_policy
-- shape as 0021_enable_rls_everywhere.sql / 20260612_rls_research_admin.sql
-- (shadow-mode kill switch via app.rls_enforce, numeric match on
-- app.current_tenant_id / app.current_org_id, super-admin bypass), plus ENABLE
-- + FORCE ROW LEVEL SECURITY. Enforcement stays OFF until app.rls_enforce='on',
-- so behavior is unchanged until the platform flips it.
--
-- Idempotent: safe to re-run.
--
-- Additive only: this creates ONE new table and touches no existing table,
-- column or row, so there is no data migration and nothing to break for
-- existing tenants. Deployment order does not matter — the application falls
-- back to refusing a review session ("please upload the document again") if the
-- table is not yet present, which is the same behaviour as an expired run.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS onboarding_proposal_runs;
--   -- Drops the table's indexes and RLS policy with it. Safe at any time: the
--   -- rows are short-lived working artifacts of an in-flight onboarding review,
--   -- never a regulated record. Everything that was COMMITTED is already in the
--   -- sha256-chained audit trail and is unaffected. The only loss is any review
--   -- still in progress, whose client is told to re-upload.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS onboarding_proposal_runs (
  id               SERIAL PRIMARY KEY,
  run_id           TEXT        NOT NULL UNIQUE,
  organization_id  INTEGER     NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          INTEGER     NOT NULL,
  proposals        JSONB       NOT NULL,
  sources          JSONB,
  created_at       TIMESTAMP   NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMP   NOT NULL,
  committed_at     TIMESTAMP
);

-- Lookup is always by the opaque run id, scoped to the owning org + user.
CREATE INDEX IF NOT EXISTS idx_onboarding_proposal_runs_run_id
  ON onboarding_proposal_runs (run_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_proposal_runs_org_user
  ON onboarding_proposal_runs (organization_id, user_id);
-- Supports the expiry sweep without scanning the table.
CREATE INDEX IF NOT EXISTS idx_onboarding_proposal_runs_expires_at
  ON onboarding_proposal_runs (expires_at);

-- ── Tenant isolation (same policy shape as the platform-wide RLS migrations) ──
ALTER TABLE onboarding_proposal_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_proposal_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON onboarding_proposal_runs;
CREATE POLICY tenant_isolation_policy ON onboarding_proposal_runs
  USING (
    -- Shadow mode: until enforcement is switched on, the policy admits every
    -- row so behavior is unchanged while coverage is verified.
    COALESCE(current_setting('app.rls_enforce', true), 'off') <> 'on'
    OR current_setting('app.current_user_role', true) = 'super_admin'
    OR organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::INTEGER
    OR organization_id = NULLIF(current_setting('app.current_org_id', true), '')::INTEGER
  )
  WITH CHECK (
    COALESCE(current_setting('app.rls_enforce', true), 'off') <> 'on'
    OR current_setting('app.current_user_role', true) = 'super_admin'
    OR organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::INTEGER
    OR organization_id = NULLIF(current_setting('app.current_org_id', true), '')::INTEGER
  );

COMMENT ON TABLE onboarding_proposal_runs IS
  'AnA onboarding: the server''s own record of what it proposed from an uploaded document. The governed commit re-reads this so a client cannot supply its own provenance or approval. Rows are removed on commit or expiry; document text is never stored.';

COMMIT;
