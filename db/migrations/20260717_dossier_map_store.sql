-- ⚠ DEPRECATED (GA convergence) — this seed-only blob is NO LONGER READ.
-- GET /api/dossier-map now assembles the CTD module map from the REAL,
-- org-scoped project_sections tracking store (rolled up to module grain by
-- server/services/dossier/dossier-map-view-assembler.ts); the surface, route,
-- and seed (scripts/seed/ga-demo.d/105-dossier-map.mjs) were all converged off
-- c2c_dossier_map. The table is intentionally NOT dropped (kept for rollback and
-- to avoid a destructive migration); it simply has no reader or writer anymore.
--
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
