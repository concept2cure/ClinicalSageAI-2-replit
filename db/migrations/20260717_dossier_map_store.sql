-- Dossier-map store — the CTD / eCTD module-map worklist (per-module
-- completeness + readiness tone, with the module's child CTD sections) backing
-- the v2 DossierMap surface's GET read. One row per CTD module (M1–M5) per org;
-- the nested section leaves are held as a JSONB string array so the row
-- rehydrates straight into the surface's DossierModule shape. Distinct from the
-- artifact-rollup /api/dossier-readiness endpoint — this is the surface's own
-- self-contained instance store. Org-scoped, FK-free, schema-only, idempotent.

CREATE TABLE IF NOT EXISTS c2c_dossier_map (
  organization_id   INTEGER NOT NULL,
  m                 TEXT    NOT NULL,
  label             TEXT,
  pct               INTEGER,
  tone              TEXT,
  sections          JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (organization_id, m)
);
