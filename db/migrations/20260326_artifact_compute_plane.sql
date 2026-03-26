BEGIN;

CREATE TABLE IF NOT EXISTS artifact_compute_runtime_profiles (
  id SERIAL PRIMARY KEY,
  profile_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  language TEXT NOT NULL,
  image_ref TEXT,
  network_policy TEXT NOT NULL DEFAULT 'deny_all',
  cpu_limit_millis INTEGER NOT NULL DEFAULT 60000,
  memory_limit_mb INTEGER NOT NULL DEFAULT 512,
  timeout_seconds INTEGER NOT NULL DEFAULT 120,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artifact_compute_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  surface_key TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  runtime_profile_key TEXT NOT NULL REFERENCES artifact_compute_runtime_profiles(profile_key),
  status TEXT NOT NULL DEFAULT 'queued',
  requested_by_id INTEGER REFERENCES users(id),
  artifact_id TEXT,
  retry_of_job_id TEXT,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  timeout_seconds INTEGER NOT NULL DEFAULT 120,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artifact_compute_attempts (
  id BIGSERIAL PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL REFERENCES artifact_compute_jobs(job_id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  attempt_number INTEGER NOT NULL,
  worker_runtime TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  exit_code INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(job_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS artifact_compute_outputs (
  id BIGSERIAL PRIMARY KEY,
  output_id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL REFERENCES artifact_compute_jobs(job_id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  output_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_uri TEXT NOT NULL,
  sha256 TEXT,
  byte_size BIGINT,
  validation_status TEXT NOT NULL DEFAULT 'pending',
  sanitizer_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acj_org_project ON artifact_compute_jobs (organization_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_acj_status ON artifact_compute_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aca_job ON artifact_compute_attempts (job_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_aco_job ON artifact_compute_outputs (job_id, created_at DESC);

INSERT INTO artifact_compute_runtime_profiles (
  profile_key,
  display_name,
  language,
  image_ref,
  network_policy,
  cpu_limit_millis,
  memory_limit_mb,
  timeout_seconds,
  enabled
)
VALUES (
  'docx-python',
  'DOCX Python Sandboxed Runtime',
  'python',
  'local/docx-python:1.0.0',
  'deny_all',
  60000,
  768,
  120,
  TRUE
)
ON CONFLICT (profile_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  language = EXCLUDED.language,
  image_ref = EXCLUDED.image_ref,
  network_policy = EXCLUDED.network_policy,
  cpu_limit_millis = EXCLUDED.cpu_limit_millis,
  memory_limit_mb = EXCLUDED.memory_limit_mb,
  timeout_seconds = EXCLUDED.timeout_seconds,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();

COMMIT;
