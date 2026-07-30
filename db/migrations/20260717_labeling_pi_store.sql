-- DEPRECATED (2026-08): superseded by the REAL labeling_pi_sections store
-- (20260801_labeling_pi_store.sql), which has a live write path
-- (labeling-pi-service.ts via POST /api/labeling-pi). GET /api/labeling-pi now
-- reads that real, org-scoped store — see docs/architecture/
-- C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md. This blob is retained (non-destructive)
-- but is no longer written by the demo seed nor read by any route. A later
-- migration may DROP it once no environment references it.
--
-- Labeling / prescribing-information store — the per-product label worklist
-- backing the v2 LabelingPi surface's GET read. Each row is one section of a
-- structured product label (USPI / PLLR — 21 CFR 201.57, or EU SmPC / QRD)
-- for a specific program (BX-204), carrying its authoring status, whether the
-- agency has proposed an edit, the rendered label text, and the end-of-cycle
-- labeling negotiation. Org-scoped, FK-free, schema-only, idempotent. The
-- section number and label are catalog, but `st`, `flag`, `content`, and
-- `negotiation` are per-org instance state — this is instance data, not static
-- config. The rendered label text (`content`) and the sponsor-vs-agency redline
-- (`negotiation`) are held as JSONB so the row rehydrates straight into the
-- surface's LpRow shape. `n` is the section number ('HL','BW','1'..); `seq`
-- preserves the surface's fixture order.

CREATE TABLE IF NOT EXISTS c2c_labeling_pi (
  n                 TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  seq               INTEGER NOT NULL DEFAULT 0,
  label             TEXT,
  st                TEXT,
  flag              TEXT,
  content           JSONB,
  negotiation       JSONB,
  PRIMARY KEY (organization_id, n)
);
