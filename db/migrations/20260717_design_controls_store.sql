-- Design-controls DHF store — the 21 CFR 820.30(c) design-input worklist
-- (input → output → verification → validation traceability rows) backing the
-- v2 DesignControls surface's GET read. The traceability roll-up and the
-- 820.30 completeness checklist stay pure, deterministic client computations
-- over these rows. Org-scoped, FK-free, schema-only, idempotent. Nested design
-- outputs are held as JSONB so the row rehydrates straight into the surface's
-- DcInput shape (id, cat, req, riskRef, outputs[], ver, verRef, val, valRef).

CREATE TABLE IF NOT EXISTS c2c_design_controls (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  cat               TEXT,
  req               TEXT,
  risk_ref          TEXT,
  outputs           JSONB NOT NULL DEFAULT '[]'::jsonb,
  ver               TEXT,
  ver_ref           TEXT,
  val               TEXT,
  val_ref           TEXT,
  PRIMARY KEY (organization_id, id)
);
