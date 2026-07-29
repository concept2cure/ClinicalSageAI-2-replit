-- NDA/BLA CTD module-readiness store — the per-module (M1–M5) completeness
-- roll-up backing the v2 NdaCockpit "CTD readiness" panel and its overall
-- % ready. The Module 1 admin worklist, PDUFA clock, and Refuse-to-File log
-- stay the surface's local-first interactive lists. Org-scoped, FK-free,
-- schema-only, idempotent.

CREATE TABLE IF NOT EXISTS c2c_nda_modules (
  organization_id   INTEGER NOT NULL,
  m                 TEXT    NOT NULL,   -- CTD module number, '1'..'5'
  label             TEXT,
  pct               INTEGER NOT NULL DEFAULT 0,
  docs              INTEGER NOT NULL DEFAULT 0,
  open_count        INTEGER NOT NULL DEFAULT 0,
  gate              TEXT,               -- the module's gating item, or NULL when clear
  PRIMARY KEY (organization_id, m)
);
