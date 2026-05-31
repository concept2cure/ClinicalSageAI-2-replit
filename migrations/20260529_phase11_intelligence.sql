-- Phase 11 · Intelligence cluster — minor queue/forecast tables.
--
-- Backs the Biostat TLF queue and the Reports timeline-forecast surface
-- (PHASE_11_INSTALL.md §4). These are the only two new tables Phase 11
-- introduces; every other Intelligence dataset aggregates over existing
-- rows. The /api/intelligence/* read routes degrade to the ported kit
-- fixtures while these are empty (the surfaces never 404).
--
-- NOTE: §4 also assumes three source tables already exist —
-- c2c_endpoint_library, c2c_manufacturing_sites, c2c_stability_studies.
-- They do not exist in this schema yet; the endpoint library, CMC
-- package/stability, and spec-library sections stay on fixtures until
-- those are designed. Tracked as a follow-up (see HANDOFF.md).
--
-- FK posture: NO foreign keys. project_id holds a regulatory_programs.id
-- (uuid) and owner_id a users.id (integer), but neither is declared as a
-- FK constraint — matching the mutation_primitives convention. This keeps
-- the migration self-contained: the Neon preview parent that preview_db_test
-- applies onto is built from the canonical db/migrations/ set, which does
-- NOT include regulatory_programs (that table lives in migrations/), so a FK
-- to it fails with "relation does not exist". Referential integrity is
-- enforced at the application layer (the routes join on organization_id via
-- regulatory_programs at query time); these are append-only operational
-- queues, so a dangling project_id is self-correcting, not a data hazard.

CREATE TABLE IF NOT EXISTS c2c_tlf_builds (
  id            text PRIMARY KEY,
  project_id    uuid NOT NULL,                    -- regulatory_programs.id; no FK (see header)
  what          text NOT NULL,
  due_at        timestamptz NOT NULL,
  pct_complete  integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'queued',  -- queued | building | review | locked
  owner_id      integer,                          -- users.id (serial); no FK
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS c2c_tlf_builds_project_idx ON c2c_tlf_builds (project_id);
CREATE INDEX IF NOT EXISTS c2c_tlf_builds_status_idx  ON c2c_tlf_builds (status);

CREATE TABLE IF NOT EXISTS c2c_forecast_snapshots (
  id            bigserial PRIMARY KEY,
  project_id    uuid NOT NULL,                    -- regulatory_programs.id; no FK (see header)
  milestone     text NOT NULL,
  target_date   date NOT NULL,
  forecast_date date NOT NULL,
  confidence    numeric(3,2) NOT NULL,
  model_version text NOT NULL,
  snapshot_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS c2c_forecast_snapshots_project_idx ON c2c_forecast_snapshots (project_id);
CREATE INDEX IF NOT EXISTS c2c_forecast_snapshots_snapshot_idx ON c2c_forecast_snapshots (snapshot_at);
