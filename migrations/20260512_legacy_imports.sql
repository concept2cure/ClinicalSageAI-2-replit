-- 20260512_legacy_imports.sql
--
-- Legacy archive importer — when a new paying client arrives with prior
-- submissions (eCTD zips, eSTAR bundles, raw artifact folders), the
-- importer ingests them, maps every file to a canonical kit section
-- (CTD code or cerv2_510k_sections.section_key), and produces a draft
-- artifact row per leaf so AnA + the user can refine before promoting
-- to "approved".
--
-- Three tables:
--   import_jobs           — one row per upload attempt
--   import_job_files      — per-file detection + mapping outcome
--   import_job_findings   — extraction issues (missing required leaf,
--                            version mismatch, broken xml, etc.)

CREATE TABLE IF NOT EXISTS import_jobs (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  program_id        uuid    REFERENCES regulatory_programs(id),
  source_path       text NOT NULL,             -- absolute path to the uploaded archive
  source_kind       text NOT NULL,             -- 'zip' | 'folder' | 'tar' | 'rar'
  source_size_bytes bigint,
  source_sha256     text,                      -- integrity hash of the upload
  source_filename   text,                      -- original filename for display
  detected_format   text,                      -- 'fda_ectd' | 'ema_ectd' | 'pmda_ectd'
                                               -- | 'fda_estar' | 'fda_510k_folder'
                                               -- | 'pma_module' | 'mixed' | 'unknown'
  detected_region   text,                      -- 'fda' | 'ema' | 'pmda' | null
  detected_application_id text,                 -- pulled from us-regional.xml / etc.
  detected_sequence text,
  detected_sponsor  text,
  status            text NOT NULL DEFAULT 'pending',
                                               -- 'pending' | 'detecting' | 'mapping'
                                               -- | 'ready_for_review' | 'approving'
                                               -- | 'completed' | 'cancelled' | 'failed'
  file_count        integer DEFAULT 0,
  mapped_count      integer DEFAULT 0,
  skipped_count     integer DEFAULT 0,
  error_count       integer DEFAULT 0,
  artifacts_created integer DEFAULT 0,         -- count after approval
  requested_by      integer REFERENCES users(id),
  approved_by       integer REFERENCES users(id),
  approved_at       timestamptz,
  error_message     text,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS imp_job_org_idx     ON import_jobs (organization_id);
CREATE INDEX IF NOT EXISTS imp_job_program_idx ON import_jobs (program_id);
CREATE INDEX IF NOT EXISTS imp_job_status_idx  ON import_jobs (organization_id, status);

CREATE TABLE IF NOT EXISTS import_job_files (
  id                serial PRIMARY KEY,
  import_job_id     integer NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  relative_path     text NOT NULL,             -- path inside the archive
  file_name         text NOT NULL,
  size_bytes        bigint,
  sha256            text,
  detected_kind     text,                      -- 'leaf' | 'backbone_xml' | 'stylesheet' | 'index' | 'attachment'
  mapped_ctd_section text,                     -- e.g. '3.2.S.1.1', '1.1', '5.3.5.1'
  mapped_section_key text,                     -- for medtech: 'cover-letter', 'substantial-equivalence'
  mapped_artifact_kind text,                   -- 'cover_letter' | 'ifu' | 'protocol' | 'csr' | etc.
  mapping_confidence numeric(3,2),             -- 0.00..1.00
  mapping_source    text,                      -- 'backbone_xml' | 'filename_heuristic' | 'manual' | 'ana'
  artifact_id       integer,                   -- fk into concept2cure_artifacts after approval
  status            text NOT NULL DEFAULT 'pending',
                                               -- 'pending' | 'mapped' | 'skipped' | 'error' | 'imported'
  error_message     text,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS imp_file_job_idx     ON import_job_files (import_job_id);
CREATE INDEX IF NOT EXISTS imp_file_org_idx     ON import_job_files (organization_id);
CREATE INDEX IF NOT EXISTS imp_file_status_idx  ON import_job_files (import_job_id, status);

CREATE TABLE IF NOT EXISTS import_job_findings (
  id                serial PRIMARY KEY,
  import_job_id     integer NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  severity          text NOT NULL,             -- 'error' | 'warning' | 'info'
  code              text,                      -- 'missing_required_leaf' | 'duplicate_section' | etc.
  message           text NOT NULL,
  file_path         text,                      -- the offending file, if applicable
  resolved          boolean DEFAULT false,
  resolution_note   text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS imp_find_job_idx ON import_job_findings (import_job_id);
CREATE INDEX IF NOT EXISTS imp_find_sev_idx ON import_job_findings (organization_id, severity, resolved);
