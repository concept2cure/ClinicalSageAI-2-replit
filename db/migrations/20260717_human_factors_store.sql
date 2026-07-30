-- PARTIALLY DEPRECATED (2026-08): the c2c_hf_files table below is superseded by
-- the REAL hf_engineering_files store (20260801_hf_files_store.sql), which has a
-- live write path (server/services/human-factors/hf-files-service.ts via
-- POST /api/human-factors). GET /api/human-factors now reads the HFE/UE file from
-- that real, org-scoped store — see docs/architecture/
-- C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md. c2c_hf_files is retained (non-destructive)
-- but is no longer written by the demo seed nor read by any route; a later
-- migration may DROP it once no environment references it.
--
-- c2c_hf_scenarios (below) is NOT deprecated: it is the org's hazard-related
-- use-scenario store with a real writer (POST /api/human-factors/scenarios). Its
-- rows now reference the hf_engineering_files.id of the HFE/UE file they attach to
-- (the scenario-attach lookup and the demo seed both resolve the file from the new
-- store). It remains the active scenarios store.
--
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
