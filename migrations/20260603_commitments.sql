-- Regulatory commitments — source-anchored inbound + outbound obligations.
--
-- A commitment is a Claim with a deadline + owner + provenance: the binding
-- obligations that flow between the company and a health authority.
--   inbound  (authority -> company): PMR / PMC (FDA), Annex II conditions /
--             specific obligations / PASS / PAES (EU PAMs), REMS elements,
--             PMA conditions of approval, 522 postmarket studies (devices).
--   outbound (company -> authority): self-made promises in the company's own
--             submissions/responses ("the applicant commits to…").
--
-- Extracted source-anchored from unstructured documents (approval letters,
-- meeting minutes, the company's own narratives), structured here, and tracked
-- to close the post-approval lifecycle loop. Reuses the platform spine
-- (extraction, provenance, tasking, governed actions). Idempotent, FK-free.

CREATE TABLE IF NOT EXISTS c2c_commitments (
  id                 TEXT PRIMARY KEY,                 -- cmt_<uuid>
  organization_id    INTEGER NOT NULL,
  project_id         INTEGER,
  -- direction + taxonomy
  direction          TEXT NOT NULL DEFAULT 'inbound',  -- inbound | outbound
  commitment_type    TEXT NOT NULL DEFAULT 'other',    -- PMR|PMC|REMS|annex_ii|specific_obligation|PASS|PAES|pma_condition|522_study|self_commitment|other
  authority          TEXT,                             -- FDA | EMA | PMDA | MHRA | Health_Canada | other
  -- the claim
  title              TEXT NOT NULL,
  description        TEXT,
  -- provenance (source-anchored)
  source_document_id TEXT,
  source_quote       TEXT,                             -- the exact span asserting the commitment
  source_locator     TEXT,                             -- page / section / offset
  provenance_ref     TEXT,                             -- link into the provenance graph / canonical fact
  -- tracking
  owner              TEXT,
  due_date           TIMESTAMPTZ,
  due_date_text      TEXT,                             -- raw deadline phrase ("by Q4 2026", "within 12 months")
  status             TEXT NOT NULL DEFAULT 'proposed', -- proposed|open|in_progress|met|overdue|at_risk|waived|withdrawn
  linked_task_id     TEXT,                             -- task created to fulfil the commitment
  -- AI provenance / governance
  extracted_by       TEXT NOT NULL DEFAULT 'human',    -- ana | human
  groundedness       REAL,                             -- 0..1 extraction confidence / citation coverage
  needs_review       BOOLEAN NOT NULL DEFAULT TRUE,    -- AI-extracted commitments require human review
  -- audit
  created_by         INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_c2c_commitments_org ON c2c_commitments(organization_id);
CREATE INDEX IF NOT EXISTS idx_c2c_commitments_project ON c2c_commitments(project_id);
CREATE INDEX IF NOT EXISTS idx_c2c_commitments_status ON c2c_commitments(status);
CREATE INDEX IF NOT EXISTS idx_c2c_commitments_direction ON c2c_commitments(direction);
CREATE INDEX IF NOT EXISTS idx_c2c_commitments_due ON c2c_commitments(due_date)
  WHERE status NOT IN ('met', 'waived', 'withdrawn');
