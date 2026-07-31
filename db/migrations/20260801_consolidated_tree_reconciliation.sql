-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Provision, with canonical identity, the ten live tables whose only
--          definitions sat in the quarantined db/migrations/_consolidated tree.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 (IND wizard / pre-IND), Module 2 (CER generation),
--     Module 4-5 (literature evidence), plus cross-cutting MAUD validation
--   - Integrity Risk Addressed: live endpoints querying tables that exist on no
--     database; and rival table definitions carrying a non-canonical tenant key
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Tenant identity MUST be the canonical INTEGER organizations.id, or the RLS
--     sweep cannot police the table and it is cross-tenant readable.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================
--
-- Ledger C-39.
--
-- WHY A NEW FILE RATHER THAN WIRING THE _consolidated FILES.
-- C-29 Class 3 quarantined the whole db/migrations/_consolidated tree on the
-- grounds that "its only creators also redefine users/tenants with TEXT keys".
-- Checking that file by file shows the blanket was too wide — only ONE of the six
-- relevant files (001_create_core_tables.sql) redefines core identity — but also
-- that wiring the rest wholesale is still wrong, for two separate reasons:
--
--   1. COLLISION. _consolidated/012_document_authoring_schema.sql creates
--      `doc_revisions`, which the canonical authoring subsystem
--      (20260725_authoring_document_loop_tables.sql) also creates. Applying both
--      puts two rival definitions of one table on the deploy path — the exact
--      defect C-27 spent an entire remediation undoing.
--   2. NON-CANONICAL IDENTITY. programs.organization_id is UUID against a
--      `serial` organizations.id; literature_entries.organization_id and the
--      maud_* organization_id columns are TEXT/VARCHAR. None can be policed by
--      the integer-keyed tenant_isolation_policy, so provisioning them as-is
--      would trade a 500 for a cross-tenant leak.
--
-- So this file EXTRACTS exactly the ten live tables (plus two foreign-key
-- parents), reconciled to canonical identity, and leaves the _consolidated tree
-- quarantined where it belongs.
--
-- THE DEFINITIONS ALSO DID NOT MATCH THEIR CONSUMERS. Provisioning alone would
-- not have fixed these endpoints — two tables are queried for columns their
-- _consolidated definition never declared:
--   • server/services/cerGenerator.ts issues `SELECT sections FROM templates`,
--     but the _consolidated `templates` has no `sections` column at all.
--   • server/services/ana-ri/command-executor.ts issues
--     `SELECT id, code, title FROM doc_sections WHERE id = $1`, but the
--     _consolidated `doc_sections` keys on `section_id` and has no `id`.
-- Both are reconciled below to what the caller actually asks for.
--
-- Every statement is idempotent; safe to re-run on every deploy.

-- ─── CER generation (server/services/cerGenerator.ts) ────────────────────────

CREATE TABLE IF NOT EXISTS cer_jobs (
  id            SERIAL PRIMARY KEY,
  job_id        TEXT NOT NULL UNIQUE,
  user_id       TEXT NOT NULL,
  template_id   TEXT,
  status        TEXT NOT NULL DEFAULT 'queued',
  progress      INTEGER NOT NULL DEFAULT 0,
  step          TEXT NOT NULL DEFAULT 'initializing',
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  download_url  TEXT,
  page_count    INTEGER,
  word_count    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cer_jobs_status_idx ON cer_jobs (status);

-- `sections` is NOT in the _consolidated definition, but cerGenerator.ts does
-- `SELECT sections FROM templates WHERE id = $1` — without it the read fails with
-- 42703 even once the table exists. JSONB: the caller treats it as a structure.
CREATE TABLE IF NOT EXISTS templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  sections    JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Tolerate a pre-existing copy provisioned from the older definition.
ALTER TABLE templates ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ─── Programs (six server/services/innovation/* services) ────────────────────
-- Those services issue `SELECT id FROM programs [WHERE organization_id = $1]`.
-- organization_id is INTEGER here, not the _consolidated UUID: the canonical
-- organizations.id is `serial`, so a UUID column could never have matched the
-- value those services bind, and the FK could not have been created either.
CREATE TABLE IF NOT EXISTS programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  organization_id INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS programs_org_created_idx ON programs (organization_id, created_at DESC);

-- ─── IND wizard / pre-IND (server/routes/preIndRoutes.ts) ────────────────────
-- ind_drafts is the FK parent; its user_id already targets the canonical
-- integer users.id, so it needs no reconciliation.
CREATE TABLE IF NOT EXISTS ind_drafts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER,
  draft_title   VARCHAR(255) NOT NULL,
  current_step  VARCHAR(50),
  status        VARCHAR(50) DEFAULT 'draft',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- The route upserts ON CONFLICT (draft_id), so the UNIQUE is load-bearing.
CREATE TABLE IF NOT EXISTS ind_pre_ind_data (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id                    UUID NOT NULL UNIQUE REFERENCES ind_drafts (id) ON DELETE CASCADE,
  project_name                VARCHAR(255),
  therapeutic_area            VARCHAR(255),
  project_objective           TEXT,
  target_pre_ind_meeting_date DATE,
  pre_ind_meeting_objective   TEXT,
  pre_ind_agenda_topics       JSONB,
  pre_ind_attendees           JSONB,
  fda_interaction_notes       TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ind_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_ind_data_id UUID NOT NULL REFERENCES ind_pre_ind_data (id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  due_date        DATE,
  status          VARCHAR(50) DEFAULT 'Pending'
                  CHECK (status IN ('Pending', 'InProgress', 'Completed', 'Blocked')),
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ind_milestones_pre_ind_idx ON ind_milestones (pre_ind_data_id);

-- ─── Literature evidence (server/services/regulatory-programs.service.ts) ────
-- organization_id is INTEGER, not the _consolidated TEXT. The consumer already
-- compares `organization_id::text = $1::text`, so the cast makes the change
-- transparent to it — and an integer column is what lets the RLS sweep isolate
-- the table. `embedding` needs pgvector, which the deploy path already requires
-- (001_gcc_core.sql and two migrations already in C2C_MIGRATION_FILES).
CREATE TABLE IF NOT EXISTS literature_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  authors          TEXT[],
  abstract         TEXT,
  publication_date DATE,
  journal          TEXT,
  doi              TEXT,
  url              TEXT,
  source_name      TEXT NOT NULL,
  source_id        TEXT,
  relevance_score  DOUBLE PRECISION,
  organization_id  INTEGER NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS literature_entries_org_date_idx
  ON literature_entries (organization_id, publication_date);

-- The embedding column is added separately and guarded: a cluster without
-- pgvector must not lose the whole table (the rest of it is still useful, and the
-- only consumer query does not read `embedding`).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER TABLE literature_entries ADD COLUMN IF NOT EXISTS embedding vector(1536)';
  ELSE
    RAISE NOTICE '[c2c] pgvector absent — literature_entries.embedding not added';
  END IF;
END $$;

-- ─── Document sections (server/services/ana-ri/command-executor.ts) ──────────
-- Keyed on `id`, not the _consolidated `section_id`: the caller issues
-- `SELECT id, code, title FROM doc_sections WHERE id = $1`. doc_id is a SOFT
-- reference — the _consolidated FK pointed at doc_documents in a file whose
-- doc_revisions collides with the canonical authoring subsystem, so that file
-- stays quarantined and this table stands alone.
CREATE TABLE IF NOT EXISTS doc_sections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id            UUID,
  tenant_id         INTEGER NOT NULL,
  code              TEXT NOT NULL,
  title             TEXT NOT NULL,
  order_idx         INTEGER NOT NULL DEFAULT 0,
  content           JSONB DEFAULT '{}'::jsonb,
  track_changes     BOOLEAN NOT NULL DEFAULT FALSE,
  parent_section_id UUID,
  is_locked         BOOLEAN NOT NULL DEFAULT FALSE,
  locked_by         TEXT,
  locked_at         TIMESTAMPTZ,
  updated_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS doc_sections_doc_idx ON doc_sections (doc_id, tenant_id);

-- ─── MAUD validation (server/db/maudDb.ts) ───────────────────────────────────
-- organization_id is INTEGER, not VARCHAR(255): the column exists "for
-- multi-tenant support" per the original comment, i.e. it IS the org id, and only
-- an integer one can be policed.
CREATE TABLE IF NOT EXISTS maud_algorithms (
  id                    SERIAL PRIMARY KEY,
  algorithm_id          VARCHAR(255) NOT NULL UNIQUE,
  name                  VARCHAR(255) NOT NULL,
  version               VARCHAR(50) NOT NULL,
  description           TEXT,
  validation_level      VARCHAR(50),
  regulatory_frameworks JSONB,
  created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maud_validations (
  id                    SERIAL PRIMARY KEY,
  validation_id         VARCHAR(255) NOT NULL UNIQUE,
  document_id           VARCHAR(255) NOT NULL,
  organization_id       INTEGER,
  status                VARCHAR(50) NOT NULL,
  timestamp             TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  score                 INTEGER,
  validator_name        VARCHAR(255),
  validator_version     VARCHAR(50),
  regulatory_frameworks JSONB,
  algorithms_used       JSONB,
  validation_details    JSONB,
  created_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS maud_validations_doc_idx ON maud_validations (document_id);
CREATE INDEX IF NOT EXISTS maud_validations_org_idx ON maud_validations (organization_id);

CREATE TABLE IF NOT EXISTS maud_validation_requests (
  id                        SERIAL PRIMARY KEY,
  request_id                VARCHAR(255) NOT NULL UNIQUE,
  document_id               VARCHAR(255) NOT NULL,
  organization_id           INTEGER,
  status                    VARCHAR(50) NOT NULL,
  algorithms                JSONB,
  metadata                  JSONB,
  estimated_completion_time TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS maud_validation_requests_doc_idx ON maud_validation_requests (document_id);
