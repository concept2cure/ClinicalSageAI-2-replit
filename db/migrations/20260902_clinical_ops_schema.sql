-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Provision the clinical_ops schema the Clinical Operations surface reads, so its routes stop failing on every request against a database whose application role cannot create schemas.
--
-- eCTD/CTD Context:
--   - Module(s): Module 5 — 5.3.5 clinical study reports; the study, site,
--     enrollment, monitoring, deviation and milestone records that a CSR and an
--     inspection readiness review are written from.
--   - Integrity Risk Addressed: a route that provisions its own store at
--     request time. The DDL ran as the request's role, so on any deployment
--     where the application is not a schema owner the whole surface 500'd —
--     and the failure repeated on every request, because the "created once"
--     flag is only set after the DDL succeeds.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS: studies is tenant-keyed and carries the canonical
--     tenant_isolation_policy. Its children are reachable only through a
--     study, so they are isolated by a PARENT-SCOPED policy — the same shape
--     the authoring subsystem uses for its doc-scoped tables.
--   - Idempotent: CREATE SCHEMA/TABLE/INDEX IF NOT EXISTS; policies dropped
--     and recreated.
-- =============================================================================
--
-- ── What this closes ─────────────────────────────────────────────────────────
-- server/routes/clinical-operations-routes.ts carried its own ensureTables():
-- CREATE SCHEMA IF NOT EXISTS clinical_ops plus six CREATE TABLEs, executed on
-- the first request. Verified live against a fully provisioned database with
-- RLS_ENFORCE=on:
--
--   GET /api/clinical-operations/studies   → 500 CLINOPS_STUDIES_FAIL
--   GET /api/clinical-operations/overview  → 500 CLINOPS_OVERVIEW_FAIL
--   server log: 42501 permission denied for database
--               at ensureTables (clinical-operations-routes.ts:116)
--
-- client/src/concept2cure/v2/surfaces/ClinicalOps.tsx reads
-- /api/clinical-operations/studies, so this was a shipped surface that could
-- not load. The route's own 42P01/3F000 branch answers a considered 503
-- ("not yet provisioned") — but a permission error is not a missing table, so
-- it fell through to the generic 500 and told the operator nothing.
--
-- This is the same defect the canonical-spine refactor already retired for
-- authoring.router.ts, whose runtime ensure* DDL moved into
-- 20260730_authoring_runtime_ddl.sql for exactly this reason.
--
-- ── Shape ────────────────────────────────────────────────────────────────────
-- Extracted from the router's own DDL and the SQL it runs, with two changes,
-- both forced by the queries themselves:
--
--   org_id INTEGER, not TEXT. Every tenant-keyed column in this schema is
--   INTEGER (0020 coerced the four that were not, and the RLS predicate casts
--   to ::INT). server/services/regulatory-programs.service.ts already writes
--   `org_id::text = $2`, which only makes sense against a non-text column.
--
--   endpoint_results exists. The same service reads
--   `SELECT … FROM clinical_ops.endpoint_results WHERE study_id = $1`, guarded
--   by an is-undefined-table catch — so the trial metrics it feeds have always
--   been null. The router never created it.
--
-- Foreign keys are real: a site, an enrollment record, a monitoring visit, a
-- deviation, a milestone and an endpoint result each belong to a study, and a
-- deleted study takes its records with it.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS clinical_ops;

-- A database that hand-applied the superseded 20260716_clinical_ops_studies_display.sql
-- (deploy-dead: it was never in C2C_MIGRATION_FILES, which is why the table was
-- absent on a provisioned estate) carries org_id as TEXT. CREATE TABLE IF NOT
-- EXISTS would leave it that way, and the tenant policy below casts to ::INT, so
-- coerce first — the same move 0020 made for the four TEXT tenant columns in
-- public. Empty in practice; USING NULLIF(...)::INT drops any non-numeric value
-- rather than failing the migration on data that was never a tenant id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'clinical_ops' AND table_name = 'studies'
       AND column_name = 'org_id' AND data_type <> 'integer'
  ) THEN
    EXECUTE $c$
      ALTER TABLE clinical_ops.studies
        ALTER COLUMN org_id TYPE INTEGER
        USING NULLIF(substring(org_id::text from '^[0-9]+$'), '')::INTEGER
    $c$;
  END IF;
END $$;

-- ── studies — the tenant-keyed root ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_ops.studies (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             INTEGER REFERENCES public.organizations(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  protocol           TEXT NOT NULL,
  phase              TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'planning',
  indication         TEXT NOT NULL,
  target_enrollment  INTEGER NOT NULL,
  enrolled           INTEGER NOT NULL DEFAULT 0,
  sites              INTEGER NOT NULL DEFAULT 0,
  active_sites       INTEGER NOT NULL DEFAULT 0,
  sponsor_name       TEXT,
  therapeutic_area   TEXT,
  design             TEXT,
  note               TEXT,
  start_date         DATE,
  estimated_end_date DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_ops.sites (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id               UUID NOT NULL REFERENCES clinical_ops.studies(id) ON DELETE CASCADE,
  org_id                 INTEGER REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  location               TEXT NOT NULL,
  principal_investigator TEXT NOT NULL,
  target_enrollment      INTEGER NOT NULL,
  enrolled               INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'selected',
  contact_email          TEXT,
  irb_approval_date      DATE,
  last_activity          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_ops.enrollment_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id        UUID NOT NULL REFERENCES clinical_ops.studies(id) ON DELETE CASCADE,
  site_id         UUID REFERENCES clinical_ops.sites(id) ON DELETE SET NULL,
  period          TEXT NOT NULL,
  target_count    INTEGER NOT NULL,
  actual_count    INTEGER NOT NULL,
  screen_failures INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_ops.monitoring_visits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id        UUID NOT NULL REFERENCES clinical_ops.studies(id) ON DELETE CASCADE,
  site_id         UUID NOT NULL REFERENCES clinical_ops.sites(id) ON DELETE CASCADE,
  visit_type      TEXT NOT NULL,
  scheduled_date  DATE NOT NULL,
  completed_date  DATE,
  monitor_name    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'scheduled',
  findings_count  INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- severity is read by regulatory-programs.service.ts
-- (`WHERE study_id = $1 AND severity IN ('serious','critical')`) to derive the
-- adverse-event rate on the trial card. The router never wrote it, so the rate
-- was computed from zero rows; the column exists here so a writer can.
CREATE TABLE IF NOT EXISTS clinical_ops.deviations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id          UUID NOT NULL REFERENCES clinical_ops.studies(id) ON DELETE CASCADE,
  site_id           UUID REFERENCES clinical_ops.sites(id) ON DELETE SET NULL,
  subject_id        TEXT,
  category          TEXT NOT NULL,
  severity          TEXT,
  description       TEXT NOT NULL,
  detected_date     DATE NOT NULL,
  resolution_date   DATE,
  corrective_action TEXT,
  status            TEXT NOT NULL DEFAULT 'open',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_ops.milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id    UUID NOT NULL REFERENCES clinical_ops.studies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  target_date DATE NOT NULL,
  actual_date DATE,
  category    TEXT NOT NULL DEFAULT 'operational',
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Read by regulatory-programs.service.ts for the endpoints-achieved metric.
CREATE TABLE IF NOT EXISTS clinical_ops.endpoint_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id      UUID NOT NULL REFERENCES clinical_ops.studies(id) ON DELETE CASCADE,
  endpoint_name TEXT NOT NULL,
  endpoint_type TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  result_value  TEXT,
  analysed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes: the columns every listed query filters on ───────────────────────
CREATE INDEX IF NOT EXISTS clinical_ops_studies_org_idx           ON clinical_ops.studies (org_id);
CREATE INDEX IF NOT EXISTS clinical_ops_sites_study_idx           ON clinical_ops.sites (study_id);
CREATE INDEX IF NOT EXISTS clinical_ops_enrollment_study_idx      ON clinical_ops.enrollment_records (study_id);
CREATE INDEX IF NOT EXISTS clinical_ops_visits_study_idx          ON clinical_ops.monitoring_visits (study_id);
CREATE INDEX IF NOT EXISTS clinical_ops_deviations_study_idx      ON clinical_ops.deviations (study_id);
CREATE INDEX IF NOT EXISTS clinical_ops_milestones_study_idx      ON clinical_ops.milestones (study_id);
CREATE INDEX IF NOT EXISTS clinical_ops_endpoint_results_study_idx ON clinical_ops.endpoint_results (study_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- studies carries the tenant key and the canonical policy. 0021 enabled RLS on
-- the tables that existed when it ran and never revisits a schema added later,
-- so a new tenant-keyed table installs its own policy or has none at all.
ALTER TABLE clinical_ops.studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_ops.studies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON clinical_ops.studies;
CREATE POLICY tenant_isolation_policy ON clinical_ops.studies
  FOR ALL
  USING (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR org_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
    OR org_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  )
  WITH CHECK (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR org_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
    OR org_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  );

-- The children hold no tenant key of their own: a site, a visit, a deviation, a
-- milestone, an enrollment record and an endpoint result are reachable only
-- through their study. Scoping them THROUGH the parent is what makes the
-- isolation one rule rather than a second copy that can drift — and it means a
-- row cannot be orphaned into visibility by a NULL tenant column.
DO $$
DECLARE
  child TEXT;
BEGIN
  FOREACH child IN ARRAY ARRAY[
    'sites', 'enrollment_records', 'monitoring_visits',
    'deviations', 'milestones', 'endpoint_results'
  ]
  LOOP
    EXECUTE format('ALTER TABLE clinical_ops.%I ENABLE ROW LEVEL SECURITY', child);
    EXECUTE format('ALTER TABLE clinical_ops.%I FORCE ROW LEVEL SECURITY', child);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON clinical_ops.%I', child);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation_policy ON clinical_ops.%I
        FOR ALL
        USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          OR EXISTS (SELECT 1 FROM clinical_ops.studies s WHERE s.id = study_id)
        )
        WITH CHECK (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          OR EXISTS (SELECT 1 FROM clinical_ops.studies s WHERE s.id = study_id)
        )
    $p$, child);
  END LOOP;
END $$;
