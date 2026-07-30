-- Human-factors engineering (HFE/UE) file store — REAL, org-scoped, with a write path.
--
-- The IEC 62366-1 HFE/UE file the v2 HumanFactors surface renders: the device
-- under evaluation plus the usability-engineering element presence map (`present`
-- — use specification, user profiles, use environments, UI characteristics, known
-- use problems, hazard-related use scenarios, critical tasks, formative +
-- summative evaluation, HFE/UE report). The surface computes file COMPLETENESS
-- deterministically from `present` on read (present count / element count) — the
-- row never stores a fabricated completeness number.
--
-- This replaces the seed-only c2c_hf_files blob (20260717_human_factors_store.sql):
-- unlike that blob, this table has a real writer — hf-files-service.ts
-- (createHfFile, via POST /api/human-factors) — so a live tenant populates it by
-- recording its HFE/UE file, not only the demo seed. Read by GET /api/human-factors.
-- Org-scoped, soft-delete aware, audited at the route layer (HF_FILE_RECORDED).
-- FK-free (repo migration convention).
--
-- Complements — does NOT duplicate — the hazard-related use-scenario store
-- c2c_hf_scenarios (20260717_human_factors_store.sql), which already has a real
-- writer (POST /api/human-factors/scenarios). Those scenario rows reference the
-- HFE/UE file they attach to by this table's id (c2c_hf_scenarios.file_id →
-- hf_engineering_files.id); the surface's use-related risk analysis reads them
-- alongside this file.

CREATE TABLE IF NOT EXISTS hf_engineering_files (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  organization_id INTEGER     NOT NULL,
  device          TEXT        NOT NULL,             -- display: "BX-204 CGM — continuous glucose monitor"
  framework       TEXT        NOT NULL DEFAULT 'IEC 62366-1',
  present         JSONB       NOT NULL DEFAULT '{}'::jsonb, -- element→boolean presence map (10 IEC 62366-1 elements)
  created_by      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_hf_engineering_files_org
  ON hf_engineering_files (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;
