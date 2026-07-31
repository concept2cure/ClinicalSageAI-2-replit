-- DEPRECATED (2026-08): superseded by the REAL reg_change_items store
-- (20260801_reg_change_store.sql), which has a live write path
-- (reg-change-service.ts via POST /api/reg-change). GET /api/reg-change now
-- reads that real, org-scoped store — see docs/architecture/
-- C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md. This blob is retained (non-destructive)
-- but is no longer written by the demo seed nor read by any route. A later
-- migration may DROP it once no environment references it.
--
-- Regulatory-change intelligence store — the horizon-scan worklist backing the
-- v2 RegChange surface's GET read. Each row is one regulatory change (FDA
-- guidance, ISO/IEC standard revision, EU MDR/IVDR/AI-Act change) assessed for
-- portfolio impact and resolved to an action document. Org-scoped, FK-free,
-- schema-only, idempotent. The nested per-device impact list (affects[]) is
-- held as JSONB so the row rehydrates straight into the surface's RciChange
-- shape. `when` and `action`/`doc` are display strings, not computed catalog
-- entries — this is per-org instance data, not static config. `when_label`
-- avoids the SQL reserved word; `seq` preserves the surface's fixture order.

CREATE TABLE IF NOT EXISTS c2c_reg_changes (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  seq               INTEGER NOT NULL DEFAULT 0,
  src               TEXT,
  kind              TEXT,
  when_label        TEXT,
  sev               TEXT,
  live              BOOLEAN NOT NULL DEFAULT false,
  title             TEXT,
  summary           TEXT,
  affects           JSONB NOT NULL DEFAULT '[]'::jsonb,
  action            TEXT,
  doc               TEXT,
  owner             TEXT,
  due               TEXT,
  PRIMARY KEY (organization_id, id)
);
