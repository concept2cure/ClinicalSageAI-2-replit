-- Shadow-review store — the pre-file reviewer worklist backing the v2
-- ShadowReview surface's GET read. AnA simulates the reviewer who will read a
-- submission BEFORE it is filed and returns, per reviewer lens, the findings a
-- reviewer would raise (Refuse-to-File / CRL / non-conformity risk items). Each
-- row is one reviewer lens for one org; the lens's findings list is held as
-- JSONB so the row rehydrates straight into the surface's ShadowFinding[] shape.
-- Org-scoped, FK-free, schema-only, idempotent. The reviewer-lens catalog
-- (agency, gates, blurb) is static config rendered from the surface fixture —
-- what is per-org instance data, and lives here, is the findings a reviewer
-- would raise against THIS org's sequence (BX-204 BLA 761123). `leaf_ref`
-- avoids camelCase in SQL and rehydrates to `leafRef`; `seq` preserves the
-- surface's fixture order.

CREATE TABLE IF NOT EXISTS c2c_shadow_review (
  organization_id   INTEGER NOT NULL,
  lens              TEXT    NOT NULL,
  seq               INTEGER NOT NULL DEFAULT 0,
  findings          JSONB   NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (organization_id, lens)
);
