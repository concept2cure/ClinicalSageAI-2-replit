-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: An attached Module 1 form is complete only when the forms engine
--          finds no required field missing; the check is recorded with the
--          attachment (QA walk 2026-10-08, second pass, j7).
--
-- eCTD/CTD Context:
--   - Module(s): Module 1 (1.1.1 Form FDA 1571, 1.1.2 Form FDA 1572,
--     1.1.3 Form FDA 3674, 1.3.4 Forms FDA 3454 / 3455)
--   - Integrity Risk Addressed: attaching the product's own unedited 1571 and
--     1572 marked both forms COMPLETE on the IND checklist while Build & check
--     reported required fields missing on each, and moved readiness 0% → 8%.
--
-- Determinism Contract:
--   - Adds one nullable column. No row is written; nothing is dropped.
-- =============================================================================
-- 20261008e_rendered_leaf_files_required_fields_missing.sql
--
-- WHAT. rendered_leaf_files.required_fields_missing text[]: the required fields
-- the forms engine found missing when a sponsor-completed form was attached
-- (POST /api/ind-forms/:formId/official-upload). The engine's check is the
-- build over the program's record and what the person stated (Build & check),
-- plus — when the attached bytes are the platform's own render of that build —
-- the required boxes the render leaves blank
-- (server/services/ind-forms/attached-form-check.ts).
--
--   '{}'  checked, nothing required missing: the IND checklist counts the form.
--   {…}   checked, these are missing: an attachment, not a completion.
--   NULL  no check recorded: a server render (the 1571 the lifecycle filing
--         path renders, whose IND-type and phase boxes are left for the
--         sponsor), or an attachment made before this change. Never complete.
--
-- No backfill, deliberately. The attachments made before this change were
-- never checked, and the two in QA (PLR-606, leaves 76 and 79) are the blank
-- forms the walk found. Reading them as unchecked is the honest state; the
-- forms panel offers "Replace completed form", which checks the new file.
--
-- RULE 1. Replayed on every deploy: ADD COLUMN IF NOT EXISTS and COMMENT are
-- no-ops on a replay. Nothing in the set drops or re-creates this column.
-- rendered_leaf_files is public + organization_id INTEGER, so the tenant
-- sweeps already cover it; this creates no table.
--
-- ROLLBACK. Not by a DROP appended to the set (CLAUDE.md Rule 1): amend this
-- file in place, with a dated note, and remove the column by hand.
-- =============================================================================

DO $mig$
BEGIN
  IF to_regclass('public.rendered_leaf_files') IS NULL THEN
    RAISE NOTICE 'rendered_leaf_files absent - required_fields_missing not added';
    RETURN;
  END IF;
  ALTER TABLE public.rendered_leaf_files ADD COLUMN IF NOT EXISTS required_fields_missing text[];
  COMMENT ON COLUMN public.rendered_leaf_files.required_fields_missing IS
    'Required fields the forms engine found missing when a sponsor-completed form was attached. '
    '''{}'' = checked, complete; non-empty = attached, not complete; NULL = no check recorded (never complete).';
END
$mig$;
