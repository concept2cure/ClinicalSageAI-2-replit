-- Effort Certification (add-on) — 2 CFR 200.430. See shared/schema/effort-certification.ts.
CREATE TABLE IF NOT EXISTS effort_certifications (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  personnel_id integer NOT NULL REFERENCES research_personnel(id),
  period_start date NOT NULL, period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_certification','certified','recertify_required','superseded')),
  certified_by integer REFERENCES users(id), certified_at timestamptz, content_hash text,
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_effort_certifications_org ON effort_certifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_effort_certifications_personnel ON effort_certifications(personnel_id);
CREATE TABLE IF NOT EXISTS effort_lines (
  id serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  certification_id integer NOT NULL REFERENCES effort_certifications(id),
  award_id integer REFERENCES grant_awards(id),
  activity_label text NOT NULL,
  committed_pct numeric(5,2) NOT NULL DEFAULT 0, actual_pct numeric(5,2) NOT NULL DEFAULT 0,
  created_by integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_effort_lines_org ON effort_lines(organization_id);
CREATE INDEX IF NOT EXISTS idx_effort_lines_cert ON effort_lines(certification_id);
