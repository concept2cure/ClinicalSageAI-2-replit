-- Clinical operations studies — display fields for the v2 studies & enrollment
-- board. clinical_ops.studies is otherwise created lazily by the route at
-- startup; this makes the schema/table/columns exist ahead of the server so the
-- demo seed can populate it and CI can verify it. Idempotent, additive.

CREATE SCHEMA IF NOT EXISTS clinical_ops;

CREATE TABLE IF NOT EXISTS clinical_ops.studies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT,
  name              TEXT NOT NULL,
  protocol          TEXT NOT NULL,
  phase             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'planning',
  indication        TEXT NOT NULL,
  target_enrollment INT  NOT NULL,
  enrolled          INT  DEFAULT 0,
  sites             INT  DEFAULT 0,
  active_sites      INT  DEFAULT 0,
  sponsor_name      TEXT,
  therapeutic_area  TEXT,
  design            TEXT,
  note              TEXT,
  start_date        DATE,
  estimated_end_date DATE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill on a table created before the display columns existed.
ALTER TABLE clinical_ops.studies ADD COLUMN IF NOT EXISTS design TEXT;
ALTER TABLE clinical_ops.studies ADD COLUMN IF NOT EXISTS note   TEXT;
