-- DEPRECATED (2026-08): superseded by the REAL program_journeys +
-- program_journey_stages store (20260801_program_journey_store.sql), which has
-- a live write path (program-journey-service.ts via POST /api/program-journey
-- and POST /api/program-journey/:id/stages/:stageId). GET /api/program-journey
-- now reads that real, org-scoped store — see docs/architecture/
-- C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md. This blob is retained
-- (non-destructive) but is no longer written by the demo seed nor read by any
-- route. A later migration may DROP it once no environment references it.
--
-- Program-journey store — the concept-to-submission spine backing the v2
-- BiopharmaJourney surface's GET read. Each row is ONE program's regulatory
-- journey (segment-scoped: biotech BX-301 · BLA, pharma BX-204 · NDA) carrying
-- the per-program INSTANCE state the surface renders: filing readiness, the
-- current stage, the per-stage status overlay, CTD-module readiness, the review
-- clock, predicted HAQs, the cross-module contradiction and open blockers.
--
-- The 9-stage lifecycle catalog itself (PJ_STAGES: labels, gates, deliverables,
-- capabilities) is definitional and stays in the surface code — only the
-- per-org instance state lives here. Org-scoped, FK-free, schema-only,
-- idempotent. Nested arrays/objects (target, overlay, modules, clock, haqs,
-- contra, blockers) are held as JSONB so the row rehydrates straight into the
-- surface's PjRecord shape. `current_stage` avoids the SQL reserved word
-- `current` and rehydrates as `current`; `seq` preserves the fixture order.

CREATE TABLE IF NOT EXISTS c2c_program_journey (
  organization_id   INTEGER NOT NULL,
  seg               TEXT    NOT NULL,
  seq               INTEGER NOT NULL DEFAULT 0,
  code              TEXT,
  name              TEXT,
  app               TEXT,
  modality          TEXT,
  indication        TEXT,
  pathway           TEXT,
  sponsor           TEXT,
  agency            TEXT,
  readiness         INTEGER NOT NULL DEFAULT 0,
  current_stage     TEXT,
  target            JSONB NOT NULL DEFAULT '{}'::jsonb,
  overlay           JSONB NOT NULL DEFAULT '{}'::jsonb,
  modules           JSONB NOT NULL DEFAULT '[]'::jsonb,
  clock             JSONB NOT NULL DEFAULT '[]'::jsonb,
  haqs              JSONB NOT NULL DEFAULT '[]'::jsonb,
  contra            JSONB NOT NULL DEFAULT '{}'::jsonb,
  blockers          JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (organization_id, seg)
);
