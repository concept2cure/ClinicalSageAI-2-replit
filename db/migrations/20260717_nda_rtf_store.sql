-- NDA/BLA Refuse-to-File (RtF) risk-log store — the filing-risk shadow review
-- backing the v2 NdaCockpit "Refuse-to-File risk" list. Read+write:
-- GET /api/nda-cockpit/rtf adopts these rows and POST /api/nda-cockpit/rtf
-- appends a new filing-risk item. The CTD-readiness roll-up (c2c_nda_modules),
-- Module-1 admin set (c2c_nda_m1_docs), and PDUFA clock are separate stores.
-- Org-scoped, FK-free, schema-only, idempotent. `seq` orders the log.

CREATE TABLE IF NOT EXISTS c2c_nda_rtf (
  organization_id   INTEGER NOT NULL,
  id                TEXT    NOT NULL,   -- surface row id (seed slug 'rtf-<n>' or 'rtf-<epoch>')
  sev               TEXT    NOT NULL DEFAULT 'med',   -- low | med | high
  area              TEXT    NOT NULL,                 -- module / area label
  text              TEXT    NOT NULL,                 -- what could trigger a Refuse-to-File
  fix               TEXT,                             -- remediation that closes it
  seq               INTEGER NOT NULL DEFAULT 0,       -- log display order
  PRIMARY KEY (organization_id, id)
);
