-- 068_regulatory_schema_alignment.sql
-- Align regulatory schema with service-layer expectations for GA.
-- Adds compatibility columns, tables, and views without breaking existing data.

BEGIN;

-- =============================================================================
-- A) Core program aliases (program_code / program_name)
-- =============================================================================

ALTER TABLE core.programs
  ADD COLUMN IF NOT EXISTS program_code TEXT,
  ADD COLUMN IF NOT EXISTS program_name TEXT;

-- Backfill aliases
UPDATE core.programs
SET program_code = COALESCE(program_code, code),
    program_name = COALESCE(program_name, name)
WHERE program_code IS NULL OR program_name IS NULL;

-- Keep aliases in sync
CREATE OR REPLACE FUNCTION core.tg_program_alias_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.program_code := COALESCE(NEW.program_code, NEW.code);
  NEW.program_name := COALESCE(NEW.program_name, NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_program_alias_sync ON core.programs;
CREATE TRIGGER trg_program_alias_sync
  BEFORE INSERT OR UPDATE ON core.programs
  FOR EACH ROW
  EXECUTE FUNCTION core.tg_program_alias_sync();

-- =============================================================================
-- B) Regulatory submissions compatibility fields
-- =============================================================================

ALTER TABLE regulatory.submissions
  ADD COLUMN IF NOT EXISTS submission_code TEXT,
  ADD COLUMN IF NOT EXISTS submission_name TEXT,
  ADD COLUMN IF NOT EXISTS target_date DATE,
  ADD COLUMN IF NOT EXISTS submission_date DATE,
  ADD COLUMN IF NOT EXISTS acceptance_date DATE,
  ADD COLUMN IF NOT EXISTS pdufa_date DATE,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Backfill from existing columns when present
UPDATE regulatory.submissions
SET submission_code = COALESCE(submission_code, submission_number),
    submission_name = COALESCE(submission_name, product_name),
    target_date = COALESCE(target_date, target_submission_date),
    submission_date = COALESCE(submission_date, actual_submission_date),
    acceptance_date = COALESCE(acceptance_date, filing_date),
    pdufa_date = COALESCE(pdufa_date, goal_date),
    updated_at = COALESCE(updated_at, NOW())
WHERE submission_code IS NULL
   OR submission_name IS NULL
   OR target_date IS NULL
   OR submission_date IS NULL
   OR acceptance_date IS NULL
   OR pdufa_date IS NULL
   OR updated_at IS NULL;

CREATE INDEX IF NOT EXISTS submissions_code_idx
  ON regulatory.submissions (submission_code);

-- =============================================================================
-- C) Milestones compatibility fields
-- =============================================================================

ALTER TABLE regulatory.milestones
  ADD COLUMN IF NOT EXISTS planned_date DATE,
  ADD COLUMN IF NOT EXISTS deadline DATE,
  ADD COLUMN IF NOT EXISTS days_until_deadline INT,
  ADD COLUMN IF NOT EXISTS linked_snapshot_id UUID,
  ADD COLUMN IF NOT EXISTS linked_export_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE regulatory.milestones
SET planned_date = COALESCE(planned_date, target_date),
    deadline = COALESCE(deadline, target_date),
    days_until_deadline = COALESCE(days_until_deadline, (COALESCE(deadline, target_date) - CURRENT_DATE)),
    updated_at = COALESCE(updated_at, NOW())
WHERE planned_date IS NULL
   OR deadline IS NULL
   OR days_until_deadline IS NULL
   OR updated_at IS NULL;

CREATE OR REPLACE FUNCTION regulatory.tg_milestone_deadline_days()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.deadline IS NULL THEN
    NEW.deadline := NEW.target_date;
  END IF;

  NEW.planned_date := COALESCE(NEW.planned_date, NEW.target_date);
  NEW.days_until_deadline := CASE
    WHEN NEW.deadline IS NULL THEN NULL
    ELSE (NEW.deadline - CURRENT_DATE)
  END;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_milestone_deadline_days ON regulatory.milestones;
CREATE TRIGGER trg_milestone_deadline_days
  BEFORE INSERT OR UPDATE ON regulatory.milestones
  FOR EACH ROW
  EXECUTE FUNCTION regulatory.tg_milestone_deadline_days();

-- =============================================================================
-- D) Agency correspondence compatibility view
-- =============================================================================

CREATE OR REPLACE VIEW regulatory.agency_correspondence AS
SELECT
  c.id,
  c.submission_id,
  c.correspondence_type,
  COALESCE(c.agency_reference, c.correspondence_number) AS reference_number,
  c.subject,
  c.direction,
  COALESCE(c.date_received, c.date_sent) AS correspondence_date,
  c.response_due_date AS due_date,
  CASE WHEN c.response_submitted THEN COALESCE(c.date_sent, c.date_received) END AS response_date,
  c.document_refs,
  c.summary,
  COALESCE(c.metadata->'action_items', '[]'::jsonb) AS action_items,
  c.created_at,
  c.created_by
FROM regulatory.correspondence c;

-- =============================================================================
-- E) Information requests table (missing in 014)
-- =============================================================================

CREATE TABLE IF NOT EXISTS regulatory.information_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES regulatory.submissions(id) ON DELETE CASCADE,
  ir_number TEXT NOT NULL,
  ir_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  received_date DATE,
  due_date DATE,
  submitted_date DATE,
  question_count INT NOT NULL DEFAULT 0,
  answered_count INT NOT NULL DEFAULT 0,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS information_requests_submission_idx
  ON regulatory.information_requests (submission_id, due_date);

CREATE INDEX IF NOT EXISTS information_requests_status_idx
  ON regulatory.information_requests (status, due_date);

COMMIT;
