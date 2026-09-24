-- license_requests — the enterprise onboarding intake, created by an applier.
--
-- ── WHY THIS FILE EXISTS (2026-09-24, launch row D2) ────────────────────────
-- The Onboarding surface (a launch SHELL surface, always on) ends with
-- "Request Enterprise onboarding", which POSTs to the public, unauthenticated
-- /api/auth/license-request — the platform's only enterprise sales intake
-- (server/routes/auth.ts; client/src/concept2cure/v2/surfaces/Onboarding.tsx).
--
-- The handler INSERTed into this table, which no applier created. On 42P01 it
-- ran CREATE TABLE IF NOT EXISTS itself, at request time. That works where the
-- server connects as a superuser — every developer machine — and fails in
-- production, where it connects as the non-owner runtime role (app_service),
-- which holds no CREATE on public:
--
--     ERROR:  permission denied for schema public
--
-- So in production every enterprise onboarding request answered 500 and was
-- lost: the error log carried only the error text, not the prospect's contact.
-- Reproduced on real PostgreSQL through the real route registration as a
-- NOBYPASSRLS role (tests/db/enterprise-onboarding-intake.dbtest.ts;
-- docs/evidence/W1/2026-09-24-launch-reach/). The runtime DDL is removed from
-- the handler in the same change; this file is now the table's only creator.
--
-- The column list is the handler's own, unchanged: it is the only contract
-- anyone ever wrote for this table.
--
-- ── WHY IT HAS NO organization_id (a deliberate exception to RULE 1) ─────────
-- CLAUDE.md says new tables go in public with organization_id INTEGER NOT NULL,
-- because both tenant sweeps key off that column. This row is written by an
-- UNAUTHENTICATED prospect before any organisation exists — there is no tenant
-- to key it to, and inventing one (org 0, the requester's future org) would be
-- a fabricated attribution. It is platform-owned data: other companies' contact
-- details, worked by the platform team.
--
-- The tenant sweeps therefore never see it, so it carries its own policy, in
-- the canonical shape (db/migrations/20260801_tenant_isolation_sweep.sql) minus
-- the tenant arm it has no column for:
--   license_requests_intake_insert   — anyone may INSERT: it is a public form.
--   license_requests_platform_access — SELECT/UPDATE/DELETE only when
--                                      enforcement is off (shadow mode) or the
--                                      session is the platform super-admin.
-- Under RLS_ENFORCE=on — the only posture production accepts — the pre-auth
-- scope that writes a request cannot read it back, and no tenant member can
-- read another company's request. ENABLE + FORCE, as the sweep does.
--
-- ── REPLAYABILITY (RULE 1) ──────────────────────────────────────────────────
-- Re-executed on every deploy. CREATE TABLE IF NOT EXISTS; policies created
-- only when absent (no DROP anywhere). To change a policy, amend this file in
-- place with a dated note.

CREATE TABLE IF NOT EXISTS license_requests (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(254) NOT NULL,
  organization VARCHAR(300) NOT NULL,
  message TEXT DEFAULT '',
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by INTEGER
);

CREATE INDEX IF NOT EXISTS idx_license_requests_created_at ON license_requests (created_at DESC);

ALTER TABLE license_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_requests FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'license_requests'
       AND policyname = 'license_requests_intake_insert'
  ) THEN
    EXECUTE $p$
      CREATE POLICY license_requests_intake_insert ON license_requests
        FOR INSERT
        WITH CHECK (true)
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'license_requests'
       AND policyname = 'license_requests_platform_access'
  ) THEN
    EXECUTE $p$
      CREATE POLICY license_requests_platform_access ON license_requests
        FOR ALL
        USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
    $p$;
  END IF;
END $$;
