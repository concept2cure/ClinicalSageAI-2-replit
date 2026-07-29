-- Authoring signature + approval-workflow storage (ledger C-11 residual 1, C-15).
--
-- The authoring loop has TWO signing endpoints and, until this migration,
-- storage for neither:
--
--   POST /docs/:docId/e-sign  wrote `electronic_signatures` — the canonical
--                             Part 11 table for the INTEGER-keyed legacy
--                             document system. Its shape is incompatible:
--                             document_id INTEGER REFERENCES documents(id) vs
--                             the authoring loop's UUID doc ids, plus seven
--                             NOT NULL columns (version_id, signature_type,
--                             signature_purpose, signer_id, authentication_method,
--                             authentication_timestamp, signature_hash) that the
--                             authoring insert never supplied. It could not work
--                             on any real deployment.
--
--   POST /docs/:docId/sign    wrote `authoring_signatures`, a purpose-built shape
--                             that nothing in the repository created.
--
-- These are genuinely different concepts that collided on a name. The resolution
-- is NOT to widen electronic_signatures into a union of both — it is to give the
-- authoring loop its own table, which is what the router's own reader
-- (GET /docs/:docId/signatures) already selects from.
--
-- `authoring_workflow_steps` is the approval chain the signing path advances; it
-- was equally unbacked, so submitting a document for review and approving a step
-- both failed. There is no separate workflows table by design: workflow_id is a
-- UUID minted per submission and carried on the steps plus
-- authoring_documents.current_workflow_id.
--
-- Column sets are CODE-DERIVED — taken from the INSERT/SELECT/UPDATE statements
-- in server/routes/authoring.router.ts, not from a design document.
--
-- Rollback:
--   DROP TABLE IF EXISTS authoring_signatures;
--   DROP TABLE IF EXISTS authoring_workflow_steps;

-- ── Signatures ───────────────────────────────────────────────────────────────
--
-- Deliberately NO foreign key on doc_id. A signature is evidence about a record
-- and must outlive it; an ON DELETE CASCADE here would let deleting a document
-- destroy proof that someone signed it (21 CFR Part 11 §11.70). The application
-- only ever INSERTs and SELECTs — there is no update or delete path.
CREATE TABLE IF NOT EXISTS authoring_signatures (
  id UUID PRIMARY KEY,
  doc_id UUID NOT NULL,
  signer_email TEXT NOT NULL,
  signer_name TEXT,
  -- AUTHOR | REVIEWER | APPROVER — the §11.50 meaning of the signature.
  meaning TEXT NOT NULL,
  -- The signer's stated reason/intent. /e-sign calls this `intent`, /sign calls
  -- it `reason`; one column, one vocabulary.
  reason TEXT,
  -- How identity was re-verified at signing time (§11.200). PIN today.
  method TEXT NOT NULL DEFAULT 'PIN',
  -- sha256 over the section content the signature covers, from computeDocHash().
  content_hash TEXT NOT NULL,
  -- /sign's composite digest. NULL for /e-sign, which has no second digest:
  -- adding one there would mean hashing a fresh timestamp, producing a value no
  -- verifier could ever recompute. An absent digest is honest; an unverifiable
  -- one is not.
  signature_digest TEXT,
  pin_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address TEXT,
  user_agent TEXT,
  tenant_id INTEGER NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_authoring_signatures_doc
  ON authoring_signatures (doc_id, tenant_id, signed_at DESC);

CREATE INDEX IF NOT EXISTS idx_authoring_signatures_signer
  ON authoring_signatures (signer_email, tenant_id, signed_at DESC);

-- ── Approval workflow steps ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS authoring_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL,
  doc_id UUID NOT NULL,
  step_no INTEGER NOT NULL,
  role TEXT NOT NULL,
  approver_email TEXT,
  -- PENDING | APPROVED | REJECTED
  status TEXT NOT NULL DEFAULT 'PENDING',
  decision_note TEXT,
  decided_at TIMESTAMPTZ,
  tenant_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One step number per workflow per tenant; the submit handler numbers steps
  -- 1..n and re-submitting must not silently duplicate them.
  UNIQUE (workflow_id, step_no, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_authoring_workflow_steps_doc
  ON authoring_workflow_steps (doc_id, tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_authoring_workflow_steps_approver
  ON authoring_workflow_steps (approver_email, tenant_id, status);
