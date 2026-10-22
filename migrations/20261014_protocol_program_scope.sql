-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure regulatory evidence and governed workflow platform
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Persist explicit regulatory programme filing with a same-organization foreign-key boundary.
--
-- eCTD/CTD Context:
--   - Module(s): Programme-filed clinical protocols and Module 5 supporting evidence.
--   - Integrity Risk Addressed: Protocols appearing under the wrong programme or a foreign organization association.
--
-- Determinism Contract:
--   - Keep historical NULLs unfiled; preserve content and signatures without inferring programme associations.
--   - Replay-safe migration; existing data and canonical evidence identities remain preserved.
--
-- Notes:
--   - 2026-10-14 publication review adds this required audit context only.
--   - Existing dated remediation notes and all executable SQL are retained verbatim.
-- =============================================================================
-- F11: persist the regulatory program under which a protocol is created.
-- Replay-safe and additive. Historical NULLs stay explicitly unfiled; no
-- inferred association or signature/content rewrite occurs.
DO $migration$
BEGIN
  IF to_regclass('public.protocol_documents') IS NULL THEN
    RAISE NOTICE 'protocol_documents absent; protocol program scope skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.protocol_documents'::regclass
      AND attname = 'program_id' AND NOT attisdropped) THEN
    ALTER TABLE public.protocol_documents ADD COLUMN program_id uuid;
  END IF;
  IF to_regclass('public.idx_protocol_documents_program') IS NULL THEN
    CREATE INDEX idx_protocol_documents_program
      ON public.protocol_documents (organization_id, program_id, updated_at DESC, id DESC)
      WHERE deleted_at IS NULL;
  END IF;
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE EXCEPTION 'regulatory_programs must be provisioned before protocol program scope';
  END IF;
  IF to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    CREATE UNIQUE INDEX regulatory_programs_id_org_uq
      ON public.regulatory_programs (id, organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.protocol_documents'::regclass
      AND conname = 'protocol_documents_program_same_org_fk') THEN
    ALTER TABLE public.protocol_documents
      ADD CONSTRAINT protocol_documents_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE SET NULL (program_id) NOT VALID;
  END IF;
END
$migration$;
