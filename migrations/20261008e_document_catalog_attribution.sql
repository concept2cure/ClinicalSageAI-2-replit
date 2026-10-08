-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 §11.10(e) (audit trail), ALCOA+ "attributable"
-- Purpose: AnA's description of a Vault document is a SUGGESTION that names
--          the model, conversation and turn that wrote it, until a person
--          confirms or corrects it (D5, Data Room catalog S4;
--          docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
--
-- eCTD/CTD Context:
--   - Module(s): all (the catalog record says what a document is and is for;
--     AnA retrieves, recalls and drafts from it)
--   - Integrity Risk Addressed: a model's reading of a document stored and
--     served as fact, with nothing saying a model wrote it, nothing in the
--     audit trail, and no way for a person to confirm or correct it.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261008e_document_catalog_attribution.sql
--
-- WHY. completeCatalog stored AnA's kind, purpose, summary and key data with
-- cataloged_by = the person whose session it was. Nothing recorded that a model
-- wrote them, which model, or in which turn; no audit row was written; and no
-- screen let a person confirm or correct the record. Placement already works
-- the governed way (an agent's folder is 'suggested', a person confirms).
--
-- WHAT, on vault.document_catalog:
--   * catalog_state: NULL while there is no description (extraction tier
--     only); 'suggested' when AnA wrote it; 'confirmed' when a person accepted
--     it as written; 'corrected' when a person changed it, with a reason.
--     A row described before this file has a description and a NULL state;
--     every reader treats that as 'suggested' with its proposer not recorded
--     (document-catalog-governance.service.ts catalogStateOf). Nothing is
--     back-filled: the proposer of those rows was never recorded, and this
--     file does not invent one.
--   * proposed_by ('agent:ana'), proposed_model, proposed_thread_id,
--     proposed_turn_id: who proposed the description, from the tool context.
--   * confirmed_by, confirmed_at, correction_reason: the person's decision.
--   * document_catalog_state_chk: a confirmed or corrected record names who
--     and when; a corrected record carries its reason.
--   A re-upload (new content hash) clears all of them with the description
--   (recordExtractionOutcome), as it already cleared the description.
--
-- RULE 1: replayed on every deploy. Each column is ADD COLUMN IF NOT EXISTS;
-- the CHECK is added only when absent, and is defined in no other file. No DROP.
-- The table keeps its RLS (20260905_document_catalog.sql); nothing new for the
-- sweeps to reach.

DO $catalog_attribution$
BEGIN
  IF to_regclass('vault.document_catalog') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE vault.document_catalog
    ADD COLUMN IF NOT EXISTS catalog_state      TEXT,
    ADD COLUMN IF NOT EXISTS proposed_by        TEXT,
    ADD COLUMN IF NOT EXISTS proposed_model     TEXT,
    ADD COLUMN IF NOT EXISTS proposed_thread_id TEXT,
    ADD COLUMN IF NOT EXISTS proposed_turn_id   TEXT,
    ADD COLUMN IF NOT EXISTS confirmed_by       INTEGER,
    ADD COLUMN IF NOT EXISTS confirmed_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS correction_reason  TEXT;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'document_catalog_state_chk'
       AND conrelid = 'vault.document_catalog'::regclass
  ) THEN
    ALTER TABLE vault.document_catalog
      ADD CONSTRAINT document_catalog_state_chk CHECK (
        catalog_state IS NULL
        OR catalog_state = 'suggested'
        OR (catalog_state = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
        OR (catalog_state = 'corrected' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL
            AND correction_reason IS NOT NULL AND btrim(correction_reason) <> '')
      );
  END IF;
END
$catalog_attribution$;
