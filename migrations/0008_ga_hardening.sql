-- GA Hardening Migration
-- Adds missing columns and new tables required for production launch

-- 1. Create drafting_tasks table for persistent AI document generation tracking
CREATE TABLE IF NOT EXISTS drafting_tasks (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL,
  ectd_section TEXT NOT NULL,
  document_title TEXT NOT NULL,
  template TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  draft_content TEXT,
  error_message TEXT,
  created_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drafting_tasks_task_id ON drafting_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_drafting_tasks_project_id ON drafting_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_drafting_tasks_status ON drafting_tasks(status);

-- 2. Add electronic_signature column to device_audit_trail if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_audit_trail' AND column_name = 'electronic_signature'
  ) THEN
    ALTER TABLE device_audit_trail ADD COLUMN electronic_signature TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_audit_trail' AND column_name = 'signature_timestamp'
  ) THEN
    ALTER TABLE device_audit_trail ADD COLUMN signature_timestamp TIMESTAMP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'device_audit_trail' AND column_name = 'signature_meaning'
  ) THEN
    ALTER TABLE device_audit_trail ADD COLUMN signature_meaning TEXT;
  END IF;
END $$;

-- 3. Add version_label column to document_versions if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_versions' AND column_name = 'version_label'
  ) THEN
    ALTER TABLE document_versions ADD COLUMN version_label VARCHAR(50);
  END IF;
END $$;
