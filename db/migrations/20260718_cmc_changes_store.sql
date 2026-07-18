-- Post-approval CMC change-control store — the proposed manufacturing/quality
-- changes the Lifecycle surface "CMC change control" card tracks. Each row holds
-- the STRUCTURED attributes of a proposed change (dosage-form family, change
-- category, scale/excipient/site/process specifics, critical-step + comparability
-- flags); readiness is COMPUTED on read by feeding those attributes into the
-- deterministic SUPAC/variations classifier (classifyVariation) — FDA reporting
-- category (AR/CBE-0/CBE-30/PAS), EMA variation type, SUPAC tier, citation — so
-- the card never stores a fabricated verdict. Read by GET /api/cmc-changes.
-- Org-scoped, FK-free, schema-only, idempotent — demo rows are seeded by
-- scripts/seed/ga-demo.d/121-cmc-changes.mjs. Follows the FK-free c2c_* convention.

CREATE TABLE IF NOT EXISTS c2c_cmc_changes (
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
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_c2c_cmc_changes_org ON c2c_cmc_changes (organization_id, created_at DESC);
