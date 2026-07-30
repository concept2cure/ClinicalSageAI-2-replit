-- DEPRECATED (2026-07): the v2 IndLifecycle surface no longer reads this blob.
-- GET /api/ind-checklist is now assembled ENTIRELY from the real, org-scoped eCTD
-- submission core (submissions + ectd_sequences + submission_leaves +
-- coauthor_documents) — see server/services/ind-lifecycle/
-- ind-checklist-view-assembler.ts and docs/architecture/
-- C2C_BLOB_SURFACE_INTEGRATION_AUDIT.md. This table is retained (non-destructive)
-- but is no longer written by the demo seed nor read by any route. A later
-- migration may DROP it once no environment references it.
--
-- IND lifecycle checklist store — the per-org IND instance backing the v2
-- IndLifecycle surface's GET read. Each row is one Investigational New Drug
-- application (21 CFR 312) with its Module 1 forms checklist (1571 / 1572 /
-- 3674) and its eCTD section blueprint, each item carrying per-instance state
-- (form `done`, section `status`). Org-scoped, FK-free, schema-only, idempotent.
-- The two nested checklist arrays (forms[], sections[]) are held as JSONB so the
-- row rehydrates straight into the surface's IndlForm[] / IndlSection[] shapes.
-- This is genuine per-org instance data (a filed IND with live completion
-- state), not a static catalog. `seq` preserves the surface's fixture order.

CREATE TABLE IF NOT EXISTS c2c_ind_checklist (
  id                          TEXT    NOT NULL,
  organization_id             INTEGER NOT NULL,
  seq                         INTEGER NOT NULL DEFAULT 0,
  drug_name                   TEXT,
  product_name                TEXT,
  indication                  TEXT,
  sponsor_name                TEXT,
  submission_type             TEXT,
  target_receipt_offset_days  INTEGER NOT NULL DEFAULT 14,
  forms                       JSONB NOT NULL DEFAULT '[]'::jsonb,
  sections                    JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (organization_id, id)
);
