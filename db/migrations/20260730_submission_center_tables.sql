-- ============================================================================
-- 20260730_submission_center_tables.sql
--
-- eCTD / REGULATORY AUDIT CONTEXT — schema-contract remediation (submission
-- center + regulatory intake). Backs queries the server runs against tables no
-- migration created (repo-wide schema-contract audit).
--
-- Evidence (exact referencing SQL):
--   submission_projects / submission_tasks — server/routes/submissionCenter.routes.ts
--       full CRUD (INSERT ... RETURNING *, LEFT JOIN, GROUP BY, UPDATE). Live code.
--   fda_510k_initial_data_forms — server/routes/fda-forms.routes.ts (SELECT id,
--       project_id, form_type, form_data WHERE project_id=$1).
--   c2c_investigator_brochure — server/routes/investigator-brochure.routes.ts
--       (SELECT request WHERE organization_id=$1 ORDER BY id DESC; code branches
--       on 42P01, confirming it expects the table may not exist). Tenant-scoped.
--   reg_question_events — server/api/cmc/regulatoryIR.ts (INSERT variants + SELECT).
--   reg_mail_ingest — server/src/services/integrations/gmail.ts (dedup SELECT 1
--       WHERE msg_id + INSERT). msg_id is the natural dedup key -> UNIQUE.
--
-- Contracts extracted from the real SQL (INSERT column lists + SELECT/WHERE).
-- Only c2c_investigator_brochure references a tenant column (organization_id) and
-- gets the canonical tenant_isolation_policy; the others are created exactly as
-- referenced (their code is not tenant-aware — inventing a tenant column the code
-- neither sets nor filters would break the queries under RLS enforcement, and
-- tenant isolation for them is a separate owner follow-up).
--
-- Non-destructive + idempotent (CREATE TABLE IF NOT EXISTS; guarded policy).
-- ============================================================================

-- ── submission_projects ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submission_projects (
  id                    SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  submission_type       TEXT,
  status                TEXT NOT NULL DEFAULT 'planning',
  stage                 TEXT NOT NULL DEFAULT 'planning',
  target_agency         TEXT,
  target_date           DATE,
  priority              TEXT,
  completion_percentage INTEGER DEFAULT 0,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submission_projects_stage_idx ON submission_projects (stage);

-- ── submission_tasks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submission_tasks (
  id                    SERIAL PRIMARY KEY,
  project_id            INTEGER REFERENCES submission_projects(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',
  priority              TEXT DEFAULT 'medium',
  module_type           TEXT,
  category              TEXT,
  type                  TEXT DEFAULT 'task',
  assigned_to           TEXT,
  assigned_email        TEXT,
  due_date              TIMESTAMPTZ,
  estimated_hours       NUMERIC,
  completion_percentage INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS submission_tasks_project_idx ON submission_tasks (project_id);

-- ── fda_510k_initial_data_forms ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fda_510k_initial_data_forms (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER,
  form_type  TEXT,
  form_data  JSONB
);
CREATE INDEX IF NOT EXISTS fda_510k_initial_data_forms_project_idx ON fda_510k_initial_data_forms (project_id);

-- ── c2c_investigator_brochure (tenant-scoped) ────────────────────────────────
CREATE TABLE IF NOT EXISTS c2c_investigator_brochure (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER,
  request         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS c2c_investigator_brochure_org_idx ON c2c_investigator_brochure (organization_id, id DESC);

-- ── reg_question_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reg_question_events (
  id           SERIAL PRIMARY KEY,
  q_id         TEXT,
  sub_id       TEXT,
  action       TEXT,
  by_user      TEXT,
  payload_json JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reg_question_events_q_idx ON reg_question_events (q_id, created_at);

-- ── reg_mail_ingest ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reg_mail_ingest (
  id          SERIAL PRIMARY KEY,
  msg_id      TEXT UNIQUE,
  thread_id   TEXT,
  sub_id      TEXT,
  subject     TEXT,
  from_addr   TEXT,
  to_addr     TEXT,
  received_at TIMESTAMPTZ,
  snippet     TEXT,
  labels      TEXT[],
  extracted   JSONB
);

-- ── RLS: c2c_investigator_brochure (organization_id). Canonical policy. ───────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'c2c_investigator_brochure' AND policyname = 'tenant_isolation_policy') THEN
    EXECUTE 'ALTER TABLE c2c_investigator_brochure ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE c2c_investigator_brochure FORCE ROW LEVEL SECURITY';
    EXECUTE $pol$
      CREATE POLICY tenant_isolation_policy ON c2c_investigator_brochure USING (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR organization_id = NULLIF(current_setting('app.current_org_id', TRUE), '')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
    $pol$;
  END IF;
END $$;
