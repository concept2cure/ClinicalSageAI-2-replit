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
