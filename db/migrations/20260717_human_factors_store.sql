-- Human factors (IEC 62366-1) store — the HFE/UE file (device + element
-- presence map) and its hazard-related use scenarios, backing the v2
-- HumanFactors surface's GET read. The compute endpoints (completeness /
-- use-related risk) stay pure and stateless. Org-scoped, FK-free,
-- schema-only, idempotent.

CREATE TABLE IF NOT EXISTS c2c_hf_files (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  device            TEXT,
  framework         TEXT DEFAULT 'IEC 62366-1',
  present           JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (organization_id, id)
);

CREATE TABLE IF NOT EXISTS c2c_hf_scenarios (
  id                     TEXT    NOT NULL,
  organization_id        INTEGER NOT NULL,
  file_id                TEXT,
  task                   TEXT,
  use_error              TEXT,
  potential_harm_severity TEXT,
  mitigated              BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (organization_id, id)
);
