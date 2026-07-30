-- DEPRECATED (2026-07): the v2 ShadowReview surface no longer reads this blob.
-- GET /api/shadow-review is now assembled ENTIRELY from the real, org-scoped
-- shadow-review store (shadow_review_runs + shadow_review_findings) — the tables
-- runShadowReview persists — see server/services/shadow-review/
-- shadow-review-view-assembler.ts and docs/architecture/
-- C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md. This table is retained (non-destructive)
-- but is no longer written by the demo seed nor read by any route. A later
-- migration may DROP it once no environment references it.
--
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
