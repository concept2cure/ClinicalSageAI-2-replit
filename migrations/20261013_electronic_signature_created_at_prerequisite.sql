-- 2026-10-13: unblock the existing QMS/inspection deployment path (W1/D2).
-- Raw-journal electronic_signatures has no created_at. The existing deferred
-- QMS status guard requires that column to establish a signature written by
-- the transaction approving/retiring the controlled document.
--
-- Historical creation times are unknown: ADD has NO DEFAULT and is nullable,
-- so it does not invent timestamps for retained signatures. A separate SET
-- DEFAULT affects future inserts only. Existing recorded values are untouched.
-- LOCALTIMESTAMP is the same transaction-start clock the unchanged QMS guard
-- compares; signed_at is never substituted for this creation-time predicate.
--
-- All seven signature columns are asserted before the QMS/inspection creators
-- and guard enter the migration set. Any missing prerequisite fails deployment
-- explicitly instead of silently provisioning an approval path without a guard.
-- Replay-safe: no DROP, no historical UPDATE, no table replacement.

BEGIN;

DO $signature_table$
BEGIN
  IF to_regclass('public.electronic_signatures') IS NULL THEN
    RAISE EXCEPTION '[qms-signature-prerequisite] public.electronic_signatures must exist before controlled-document stores are provisioned.';
  END IF;
END
$signature_table$;

ALTER TABLE public.electronic_signatures
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL;

DO $signature_columns$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(required, ', ' ORDER BY required) INTO missing
    FROM unnest(ARRAY['organization_id', 'signed_target', 'signature_type',
      'superseded_by', 'is_valid', 'verification_status', 'created_at']) AS required
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'electronic_signatures'
        AND column_name = required
   );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '[qms-signature-prerequisite] public.electronic_signatures lacks %; controlled-document approval cannot be enabled.', missing;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'electronic_signatures'
       AND column_name = 'created_at'
       AND data_type IN ('timestamp without time zone', 'timestamp with time zone')
  ) THEN
    RAISE EXCEPTION '[qms-signature-prerequisite] electronic_signatures.created_at must be a timestamp compatible with the same-transaction signature guard.';
  END IF;
END
$signature_columns$;

ALTER TABLE public.electronic_signatures
  ALTER COLUMN created_at SET DEFAULT LOCALTIMESTAMP;

COMMIT;
