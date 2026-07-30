-- Post-approval CMC change-control store (REAL, org-scoped, with a write path).
--
-- The proposed manufacturing/quality changes the Lifecycle "CMC change control" card
-- tracks. Each row holds the STRUCTURED attributes of a proposed change (dosage-form
-- family, change category, scale/excipient/site/process specifics, critical-step +
-- comparability flags); the filing readiness is COMPUTED on read by feeding those
-- attributes into the deterministic SUPAC/variations classifier (classifyVariation) —
-- FDA reporting category (AR/CBE-0/CBE-30/PAS), EMA variation type, SUPAC tier, citation
-- — so the row never stores a fabricated verdict.
--
-- This replaces the seed-only c2c_cmc_changes blob (20260718_cmc_changes_store.sql):
-- unlike that blob, this table has a real writer — cmc-change-control-service.ts
-- (createCmcChange, via POST /api/cmc-changes) — so a live tenant populates it by
-- proposing changes, not only the demo seed. Read by GET /api/cmc-changes. Org-scoped,
-- soft-delete aware, audited at the route layer. FK-free (repo migration convention).

CREATE TABLE IF NOT EXISTS cmc_change_controls (
  id                     UUID        NOT NULL DEFAULT gen_random_uuid(),
  organization_id        INTEGER     NOT NULL,
  title                  TEXT        NOT NULL,
  area                   TEXT,                         -- display: Drug substance | Drug product | Specifications | ...
  programs               TEXT,                         -- display: "BX-099, BX-204"
  dosage_form_family     TEXT        NOT NULL,         -- DosageFormFamily (biologic | sterile_injectable | ...)
  change_category        TEXT        NOT NULL,         -- ChangeCategory (scale_up | container_closure | specifications | ...)
  scale_change_factor    TEXT,                         -- within_10x | gt_10x
  excipient_level_change TEXT,                         -- level_1 | level_2 | level_3
  site_change_kind       TEXT,                         -- within_same_facility | ... | different_country
  process_change_kind    TEXT,                         -- minor_in_kind | equipment_class_change | principle_change
  touches_critical_step  BOOLEAN     NOT NULL DEFAULT false,
  affects                TEXT,                         -- drug_substance | drug_product | both
  has_comparability_data BOOLEAN     NOT NULL DEFAULT false,
  status                 TEXT        NOT NULL DEFAULT 'evaluating',  -- evaluating | planned | implemented
  description            TEXT,
  created_by             INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_cmc_change_controls_org
  ON cmc_change_controls (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;
