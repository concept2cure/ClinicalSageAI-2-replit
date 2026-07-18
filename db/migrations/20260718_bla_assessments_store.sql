-- BLA 351(a) biologics assessment store — persistence + Part 11 sign-off ledger
-- for the biologics workbench (server/routes/biopharma/bla-workbench.ts,
-- mounted at /api/biopharma/bla). The three science engines (analytical
-- similarity, comparability, immunogenicity) plus the RTF/CRL filing-risk
-- profile are pure functions of the request body; this table records a computed
-- assessment when the caller supplies a programId (or persist:true), and the
-- /assessments/:id/sign path flips status to 'signed' inside the same
-- transaction as the SHA-256-chained audit_logs + c2c_ana_actions write.
--
-- Column names mirror the INSERT/SELECT in bla-workbench.ts exactly (org_id +
-- tenant_id, not organization_id). `input`/`result` capture the engine I/O as
-- jsonb so a signed assessment is fully reconstructible. Org-scoped, FK-free,
-- schema-only, idempotent — demo rows are seeded by
-- scripts/seed/ga-demo.d/119-bla-assessments.mjs (a migration must not write
-- tenant rows). Follows the FK-free c2c_* convention.

CREATE TABLE IF NOT EXISTS c2c_bla_assessments (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid(),
  org_id             INTEGER     NOT NULL,
  program_id         TEXT,                          -- sponsor program the assessment belongs to
  kind               TEXT        NOT NULL,          -- analytical_similarity | comparability | immunogenicity | filing_risk
  title              TEXT,
  modality           TEXT,                          -- mAb | fusion_protein | adc | ... (free-form)
  reference_product  TEXT,                          -- for biosimilar similarity assessments
  target_agency      TEXT,                          -- FDA | EMA | ...
  status             TEXT        NOT NULL DEFAULT 'draft',   -- draft | signed
  verdict            TEXT,                          -- denormalized top-line conclusion for fast listing
  input              JSONB       NOT NULL DEFAULT '{}'::jsonb,
  result             JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_by         INTEGER,
  tenant_id          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_by          INTEGER,
  signed_at          TIMESTAMPTZ,
  signature_reason   TEXT,
  PRIMARY KEY (id)
);

-- Listing is always org-scoped and program/kind filtered, newest first.
CREATE INDEX IF NOT EXISTS idx_c2c_bla_assessments_org_program
  ON c2c_bla_assessments (org_id, program_id, created_at DESC);
