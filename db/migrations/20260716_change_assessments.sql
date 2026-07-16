-- Change assessments — org-scoped 510(k)-change / MDR significant-change
-- determinations that back the `change-assessment` surface (GET
-- /api/change-assessment). The per-jurisdiction decision (steps + outcome +
-- rationale) and the generated document are stored as JSONB so a row matches
-- the surface's display contract 1:1. Idempotent; non-destructive.
--
-- Schema only — no data seeded here (a migration must not write tenant rows).
-- Demo data is seeded by scripts/seed-ga-demo.mjs against the resolved demo org.

CREATE TABLE IF NOT EXISTS change_assessments (
  id                TEXT    NOT NULL,               -- 'CH-118' (display id)
  organization_id   INTEGER NOT NULL,
  title             TEXT    NOT NULL,
  device            TEXT,
  area              TEXT,
  raised            TEXT,
  owner             TEXT,
  fda               JSONB,                           -- { steps, outcome, label, rationale }
  eu                JSONB,                           -- { steps, outcome, label, rationale }
  doc               JSONB,                           -- { kind, status }
  created_by        INTEGER,
  created_at        TIMESTAMP DEFAULT now(),
  deleted_at        TIMESTAMP,
  PRIMARY KEY (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_change_assessments_org
  ON change_assessments (organization_id) WHERE deleted_at IS NULL;
