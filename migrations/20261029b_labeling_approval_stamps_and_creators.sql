-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 §11.10(e), §11.10(g), §11.50, §11.70
-- Purpose: A labeling document records who approved it and when, and a
--          labeling document and a labeling translation record who added them
--          (D5, 2026-10-29).
--
-- eCTD/CTD Context:
--   - Module(s): device labeling (IFU, package insert, patient label) and its
--     language translations
--   - Integrity Risk Addressed: a labeling document could be set approved or
--     effective with no approver recorded, and a translation's approval could
--     be signed by the person who added it.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No existing row is rewritten; no key is dropped.
-- =============================================================================
-- 20261029b_labeling_approval_stamps_and_creators.sql
--
-- WHY. labeling_documents (20260511_qms_and_labeling.sql) has no approver
-- column, so a document moved to approved or effective named nobody.
-- labeling_translations has approved_by and approved_at, but neither table
-- records who added a row: `translator` is free text, and the create stored no
-- user. So the approval could not refuse its own author. Evidence:
-- docs/evidence/D5-LABELING-TRANSLATION-SIGNATURE/2026-10-29/followups/.
--
-- WHAT.
--   1. labeling_documents.approved_by INTEGER REFERENCES users(id) and
--      approved_at TIMESTAMPTZ: the approval stamp. Only the signed move to
--      approved or effective writes it (server/routes/mdx-labeling.ts, through
--      signGovernedAct). It is the pair labeling_translations has had since
--      20260511, and the pair qms_documents carries (approver_id, approved_at).
--      There is no separate "effective" stamp column: the QMS pattern's
--      effective stamp is effective_date, which labeling_documents already has.
--   2. labeling_documents.created_by and labeling_translations.created_by
--      INTEGER REFERENCES users(id): who added the row. The route's create
--      writes it. The separation-of-duties check reads it
--      (server/services/governance/separation-of-duties.ts, targets
--      `labeling-document` and `labeling-translation`) and refuses that
--      person's approval.
--   Every existing row keeps NULL in all four. No record says who added or
--   approved them, and nothing guesses one. The approval of a row with no
--   recorded creator is refused (409), as the check refuses any record whose
--   author is unknown.
--
-- RULE 1: replayed on every deploy. Each column is added only when
-- pg_attribute shows it absent, so a replay runs no DDL and takes no lock.
-- Additive only: no DROP, no backfill, no COMMENT. Both tables are in public
-- with organization_id INTEGER NOT NULL, so the tenant sweep at the tail of
-- the set already polices them. Creates no table. After
-- 20260511_qms_and_labeling.sql, which creates both tables.
--
-- Pinned by server/__tests__/routes/mdx-labeling-approval-controls.pglite.test.ts.
-- =============================================================================

-- 1 and 2 (documents). The approval stamp and the creator.
DO $mig$
BEGIN
  IF to_regclass('public.labeling_documents') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE NOTICE 'labeling_documents or users absent - labeling document approval columns skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.labeling_documents'::regclass
                    AND attname = 'approved_by' AND NOT attisdropped) THEN
    ALTER TABLE public.labeling_documents ADD COLUMN approved_by INTEGER REFERENCES public.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.labeling_documents'::regclass
                    AND attname = 'approved_at' AND NOT attisdropped) THEN
    ALTER TABLE public.labeling_documents ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.labeling_documents'::regclass
                    AND attname = 'created_by' AND NOT attisdropped) THEN
    ALTER TABLE public.labeling_documents ADD COLUMN created_by INTEGER REFERENCES public.users(id);
  END IF;
END
$mig$;

-- 2 (translations). The creator.
DO $mig$
BEGIN
  IF to_regclass('public.labeling_translations') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE NOTICE 'labeling_translations or users absent - labeling translation creator skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.labeling_translations'::regclass
                    AND attname = 'created_by' AND NOT attisdropped) THEN
    ALTER TABLE public.labeling_translations ADD COLUMN created_by INTEGER REFERENCES public.users(id);
  END IF;
END
$mig$;
