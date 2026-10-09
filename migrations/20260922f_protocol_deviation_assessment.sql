-- protocol_deviations: an unassessed deviation is NOT ASSESSED, not "minor".
--
-- 2026-09-22. `severity` was NOT NULL DEFAULT 'minor', `category` NOT NULL
-- DEFAULT 'other' and `is_reportable` NOT NULL DEFAULT false, and the writer
-- (protocol-deviations-service.ts createDeviationTx) sent `?? 'minor'` /
-- `?? 'other'`. So a deviation recorded without an assessment was stored as
-- minor and affirmatively not reportable, with a basis citing ICH E6(R2)
-- §4.5.3 — which says to document and explain every deviation and has no
-- "minor deviations need not be reported" carve-out. The reporting windows
-- the code attached (3 days critical / 10 days major) have no basis in any
-- US regulation, FDA guidance, ICH guideline or the EU Regulation; they are
-- institutional practice at most. Research record:
-- docs/evidence/REGULATORY-SME/2026-09-22/.
--
-- This file makes the three columns nullable with no default (NULL = not
-- assessed / not determined) and adds what an assessment needs:
-- `affects_safety` (NULL = not assessed, which is not "no"), and who assessed
-- it, when and why. It does NOT rewrite existing rows: a stored 'minor' cannot
-- be told from a real assessment. Every existing row has affects_safety NULL,
-- which the engine reads as "assessment required", so legacy deviations are
-- held open until a person assesses them — without inventing data for them.
--
-- Rule 1 (CLAUDE.md): nothing is dropped. The creator,
-- migrations/20260629_protocol_deviations.sql, is install-fresh-only and was
-- amended in place today to match; this file reaches databases that already
-- exist. DROP NOT NULL / DROP DEFAULT on an already-nullable, default-less
-- column and ADD COLUMN IF NOT EXISTS are no-ops on re-run. Guarded on
-- to_regclass, COMMENTs inside the guard.

DO $$
BEGIN
  IF to_regclass('public.protocol_deviations') IS NULL THEN
    RAISE NOTICE 'protocol_deviations absent, skipping deviation assessment columns';
    RETURN;
  END IF;

  ALTER TABLE protocol_deviations ALTER COLUMN severity DROP DEFAULT;
  ALTER TABLE protocol_deviations ALTER COLUMN severity DROP NOT NULL;
  ALTER TABLE protocol_deviations ALTER COLUMN category DROP DEFAULT;
  ALTER TABLE protocol_deviations ALTER COLUMN category DROP NOT NULL;
  ALTER TABLE protocol_deviations ALTER COLUMN is_reportable DROP DEFAULT;
  ALTER TABLE protocol_deviations ALTER COLUMN is_reportable DROP NOT NULL;

  ALTER TABLE protocol_deviations ADD COLUMN IF NOT EXISTS affects_safety boolean;
  ALTER TABLE protocol_deviations ADD COLUMN IF NOT EXISTS assessed_by integer;
  ALTER TABLE protocol_deviations ADD COLUMN IF NOT EXISTS assessed_at timestamptz;
  ALTER TABLE protocol_deviations ADD COLUMN IF NOT EXISTS assessment_rationale text;

  EXECUTE $c$
    COMMENT ON COLUMN protocol_deviations.severity IS
      'Internal severity scale (minor/major/critical) as ASSESSED by a person. NULL = not assessed. Rows written before 2026-09-22 may hold a defaulted minor; see migrations/20260922f.'
  $c$;
  EXECUTE $c$
    COMMENT ON COLUMN protocol_deviations.is_reportable IS
      'Whether a prompt report to the IRB is indicated, as computed from the assessment. NULL = not determined (assessment required).'
  $c$;
  EXECUTE $c$
    COMMENT ON COLUMN protocol_deviations.affects_safety IS
      'Assessed effect on subject safety, rights or welfare. NULL = not assessed, which is not "no".'
  $c$;
END $$;
