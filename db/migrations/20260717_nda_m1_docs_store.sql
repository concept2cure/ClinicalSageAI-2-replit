-- NDA/BLA Module-1 administrative worklist store — the per-document admin set
-- (Form 356h + required Module 1 components) backing the v2 NdaCockpit
-- "Module 1 admin" list. Read+write: GET /api/nda-cockpit/m1 adopts these rows
-- and POST /api/nda-cockpit/m1 appends a new document. The CTD-readiness
-- roll-up (c2c_nda_modules), PDUFA clock, and Refuse-to-File log are separate.
-- Org-scoped, FK-free, schema-only, idempotent. `seq` orders the worklist.

CREATE TABLE IF NOT EXISTS c2c_nda_m1_docs (
  organization_id   INTEGER NOT NULL,
  id                TEXT    NOT NULL,   -- surface row id (seed slug or 'm1-<epoch>')
  label             TEXT    NOT NULL,
  st                TEXT    NOT NULL DEFAULT 'draft',   -- draft | review | complete | na
  blocker           BOOLEAN NOT NULL DEFAULT FALSE,     -- blocks filing when TRUE
  note              TEXT,
  seq               INTEGER NOT NULL DEFAULT 0,         -- worklist display order
  PRIMARY KEY (organization_id, id)
);
