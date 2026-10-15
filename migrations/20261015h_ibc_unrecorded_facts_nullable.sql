-- =============================================================================
-- 20261015h — an unanswered IBC screening question is not stored as an answer
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Relax four ibc_registrations columns and ibc_reviews.convened_quorum
--          on databases that have the tables.
--
-- eCTD/CTD Context:
--   - Module(s): Module 4 (biosafety clearance threaded via provenance_links)
--   - Integrity Risk Addressed: an unanswered NIH Guidelines category,
--     gene-transfer or recombinant-DNA question stored as "not applicable" /
--     "no", and an undeclared containment level stored as BSL-1
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - No table, row or column is created or removed; no stored value changes.
--   - Idempotent; conditional on the table and on the live column shape.
-- =============================================================================
--
-- migrations/20260610_ibc_biosafety.sql — applied by install-fresh, never by a
-- deploy — declared nih_guidelines_section NOT NULL DEFAULT 'not_applicable'
-- and involves_human_gene_transfer NOT NULL DEFAULT false, so a registration
-- nobody had categorised was stored as "not applicable" and "no gene
-- transfer", and the convened-IBC review (NIH Guidelines III-A/B/C, human gene
-- transfer) was reported as not required. That file is amended in place the
-- same day (NULL = not recorded), which reaches only databases installed after
-- it. This file is in the deploy set and relaxes the two columns wherever an
-- earlier install created them: ibc-service.ts now writes NULL for an
-- unanswered question, which the old NOT NULL would refuse. Stored values are
-- kept — a 'not_applicable' or false written before cannot be told from a
-- recorded answer.
--
-- AMENDED 2026-10-15 (later the same day): the creator also declared
-- biosafety_level NOT NULL DEFAULT 'BSL-1' — a declared containment nobody
-- declared, which the containment gate compared against the agents — and
-- involves_recombinant_dna NOT NULL DEFAULT false, which the service filled
-- with `=== true` ("no" for an unanswered question). The creator is amended
-- again in place; this file now relaxes those two columns as well, including
-- on databases where its first (two-column) version already ran: the
-- condition sees any of the four still NOT NULL or defaulted. It also relaxes
-- ibc_reviews.convened_quorum (NOT NULL DEFAULT false, written `=== true`, so a
-- determination nobody described read as made without a convened quorum). A
-- 'BSL-1' or false stored before is kept, and cannot be told from a recorded
-- answer.

DO $ibc_unrecorded_facts$
BEGIN
  IF to_regclass('public.ibc_registrations') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ibc_registrations'
       AND column_name IN ('nih_guidelines_section', 'involves_human_gene_transfer', 'biosafety_level', 'involves_recombinant_dna')
       AND (is_nullable = 'NO' OR column_default IS NOT NULL)
  ) THEN
    ALTER TABLE public.ibc_registrations ALTER COLUMN nih_guidelines_section DROP DEFAULT;
    ALTER TABLE public.ibc_registrations ALTER COLUMN nih_guidelines_section DROP NOT NULL;
    ALTER TABLE public.ibc_registrations ALTER COLUMN involves_human_gene_transfer DROP DEFAULT;
    ALTER TABLE public.ibc_registrations ALTER COLUMN involves_human_gene_transfer DROP NOT NULL;
    ALTER TABLE public.ibc_registrations ALTER COLUMN biosafety_level DROP DEFAULT;
    ALTER TABLE public.ibc_registrations ALTER COLUMN biosafety_level DROP NOT NULL;
    ALTER TABLE public.ibc_registrations ALTER COLUMN involves_recombinant_dna DROP DEFAULT;
    ALTER TABLE public.ibc_registrations ALTER COLUMN involves_recombinant_dna DROP NOT NULL;
  END IF;
  IF to_regclass('public.ibc_reviews') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ibc_reviews' AND column_name = 'convened_quorum'
       AND (is_nullable = 'NO' OR column_default IS NOT NULL)
  ) THEN
    ALTER TABLE public.ibc_reviews ALTER COLUMN convened_quorum DROP DEFAULT;
    ALTER TABLE public.ibc_reviews ALTER COLUMN convened_quorum DROP NOT NULL;
  END IF;
END
$ibc_unrecorded_facts$;
