-- Regulatory-change intelligence store (REAL, org-scoped, with a write path).
--
-- The horizon-scan worklist the v2 RegChange surface renders: each row is one
-- tracked regulatory change (FDA guidance, ISO/IEC standard revision, EU
-- MDR/IVDR/AI-Act change) assessed for portfolio impact and resolved to an
-- action document. `kind` (regulation | guidance | standard) and `sev`
-- (high | med | low) are the validated classifiers the surface's badges and
-- "Action required" KPI derive from; the nested per-device impact list
-- (affects[]) is held as JSONB so a row rehydrates straight into the surface's
-- render shape. `when_label` avoids the SQL reserved word (rehydrates as `when`).
--
-- This replaces the seed-only c2c_reg_changes blob (20260717_reg_change_store.sql):
-- unlike that blob, this table has a real writer — reg-change-service.ts
-- (createRegChange, via POST /api/reg-change) — so a live tenant populates it by
-- recording tracked changes, not only the demo seed. Read by GET /api/reg-change.
-- Org-scoped, soft-delete aware, audited at the route layer. FK-free (repo
-- migration convention).

CREATE TABLE IF NOT EXISTS reg_change_items (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  organization_id INTEGER     NOT NULL,
  title           TEXT        NOT NULL,
  src             TEXT,                             -- display: "FDA · final rule", "ISO · standard revision"
  kind            TEXT        NOT NULL,             -- regulation | guidance | standard
  when_label      TEXT,                             -- display: "Effective 2 Feb 2026"
  sev             TEXT        NOT NULL,             -- high | med | low (Action required / Review / Monitor)
  live            BOOLEAN     NOT NULL DEFAULT false, -- in force / imminent
  summary         TEXT,
  affects         JSONB       NOT NULL DEFAULT '[]'::jsonb, -- [{ dev, what, sub }] per-device portfolio impact
  action          TEXT,                             -- display: resolved action ("QMSR transition plan + gap analysis")
  doc             TEXT,                             -- display: the action document it generates
  owner           TEXT,                             -- display: owning function ("Quality", "Reg", "Software")
  due             TEXT,                             -- display string ("Aug 2026", "Monitor")
  created_by      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_reg_change_items_org
  ON reg_change_items (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;
