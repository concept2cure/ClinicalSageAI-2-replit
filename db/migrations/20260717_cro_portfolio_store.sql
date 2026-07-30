-- DEPRECATED (2026-07): the v2 CroPortfolio surface no longer reads this blob.
-- GET /api/cro-portfolio is now assembled ENTIRELY from the real, org-scoped CRO
-- engagement store (cro_clients + cro_studies + cro_regulatory_submissions +
-- cro_milestones + cro_team_assignments — the tables the /api/cro CRUD routes
-- write) — see server/services/cro/cro-portfolio-view-assembler.ts and
-- docs/architecture/C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md. This table is retained
-- (non-destructive) but is no longer written by the demo seed nor read by any
-- route. A later migration may DROP it once no environment references it.
--
-- CRO sponsor-portfolio store — the multi-sponsor client roster (one row per
-- sponsor client) backing the v2 CroPortfolio surface's GET read. Each row is
-- one org-isolated sponsor engagement: the sponsor's type, engagement lead and
-- SOW status, plus its nested clinical studies and regulatory submissions held
-- as JSONB so the row rehydrates straight into the surface's CroSponsor shape
-- (studies → CroStudy[], subs → CroSub[]). Org-scoped, FK-free, schema-only,
-- idempotent. `ord` gives the roster a deterministic display order.

CREATE TABLE IF NOT EXISTS c2c_cro_portfolio (
  id               TEXT    NOT NULL,
  organization_id  INTEGER NOT NULL,
  ord              INTEGER NOT NULL DEFAULT 0,
  name             TEXT,
  type             TEXT,
  lead             TEXT,
  sow              TEXT,
  sow_note         TEXT,
  studies          JSONB   NOT NULL DEFAULT '[]'::jsonb,
  subs             JSONB   NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (organization_id, id)
);
