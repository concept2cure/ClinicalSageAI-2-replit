-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Provision the real, org-scoped program-journey store (journeys and
--          their stages) with a live write path, retiring the seed-only blob.
--
-- eCTD/CTD Context:
--   - Module(s): all (a program journey spans the submission lifecycle)
--   - Integrity Risk Addressed: program milestone state presented from a
--     read-only demo blob rather than tenant-scoped records; tenant isolation
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================
-- Program-journey store (REAL, org-scoped, with a write path) — parent journey
-- rows + one REAL row per lifecycle stage.
--
-- The concept-to-submission spine the v2 BiopharmaJourney surface renders: each
-- `program_journeys` row is ONE program's regulatory journey (segment-scoped —
-- biotech BX-301 · BLA, pharma BX-204 · NDA) carrying the program identity,
-- filing readiness, the current stage, and the flattened target callout
-- (`target_label` / `target_value` / `target_agency` rehydrate as
-- { label, v, agency }; `current_stage` avoids the SQL reserved word and
-- rehydrates as `current`). The per-stage status overlay is NOT a JSONB blob:
-- `program_journey_stages` holds one row per lifecycle stage (stage_id ∈ the
-- 9-stage vocabulary discovery … lifecycle, status done | active | upcoming,
-- pct 0–100), keyed to its journey and assembled on read into the surface's
-- overlay map. The intelligence-panel display lists (modules, clock, haqs,
-- contra, blockers) stay JSONB on the parent — nested display payloads, per
-- the reg_change_items `affects` idiom. The 9-stage lifecycle catalog itself
-- (labels, gates, deliverables, capabilities) is definitional and stays in the
-- surface code.
--
-- This replaces the seed-only c2c_program_journey blob
-- (20260717_program_journey_store.sql): unlike that blob, these tables have a
-- real writer — program-journey-service.ts (createProgramJourney /
-- updateJourneyStage, via POST /api/program-journey and
-- POST /api/program-journey/:id/stages/:stageId) — so a live tenant populates
-- them by recording journeys and advancing stages, not only the demo seed.
-- Read by GET /api/program-journey. Org-scoped, soft-delete aware, audited at
-- the route layer. FK-free (repo migration convention).

CREATE TABLE IF NOT EXISTS program_journeys (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  organization_id INTEGER     NOT NULL,
  seg             TEXT        NOT NULL,             -- biotech | pharma (segment scope)
  seq             INTEGER     NOT NULL DEFAULT 0,   -- display order within the org
  code            TEXT        NOT NULL,             -- program code ("BX-204")
  name            TEXT,                             -- display name (may be empty)
  app             TEXT,                             -- application label ("NDA 212345")
  modality        TEXT,
  indication      TEXT,
  pathway         TEXT,
  sponsor         TEXT,
  agency          TEXT,
  readiness       INTEGER     NOT NULL DEFAULT 0,   -- filing readiness 0–100
  current_stage   TEXT        NOT NULL,             -- 9-stage vocabulary; rehydrates as `current`
  target_label    TEXT,                             -- target callout → { label, v, agency }
  target_value    TEXT,                             -- rehydrates as `v`
  target_agency   TEXT,
  modules         JSONB       NOT NULL DEFAULT '[]'::jsonb, -- [{ m, label, pct, risk }] CTD-module readiness
  clock           JSONB       NOT NULL DEFAULT '[]'::jsonb, -- [{ l, day, date, st }] review clock
  haqs            JSONB       NOT NULL DEFAULT '[]'::jsonb, -- [{ conf, t }] predicted HAQs
  contra          JSONB       NOT NULL DEFAULT '{}'::jsonb, -- { t, tag, d } cross-module contradiction
  blockers        JSONB       NOT NULL DEFAULT '[]'::jsonb, -- [{ sev, t, m, who, due }] open blockers
  created_by      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_program_journeys_org
  ON program_journeys (organization_id, seq, created_at DESC)
  WHERE deleted_at IS NULL;

-- One row per lifecycle stage per journey — the stage progression as REAL rows,
-- not an overlay blob. All 9 stage rows are written with their journey
-- (createProgramJourney) and advanced by updateJourneyStage; they live and die
-- with the parent (visibility is gated by the journey's deleted_at, so there is
-- no per-stage soft delete).
CREATE TABLE IF NOT EXISTS program_journey_stages (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  organization_id INTEGER     NOT NULL,
  journey_id      UUID        NOT NULL,             -- program_journeys.id (FK-free by convention)
  stage_id        TEXT        NOT NULL,             -- discovery | preind | ind | clinical | presub | assemble | review | approval | lifecycle
  status          TEXT        NOT NULL DEFAULT 'upcoming', -- done | active | upcoming
  pct             INTEGER     NOT NULL DEFAULT 0,   -- stage completion 0–100
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT uq_program_journey_stage UNIQUE (journey_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_program_journey_stages_org
  ON program_journey_stages (organization_id, journey_id);
