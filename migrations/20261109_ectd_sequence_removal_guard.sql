-- =============================================================================
-- 20261109_ectd_sequence_removal_guard.sql
--
-- 2026-11-09, P-86 (founder, 2026-11-01; docs/LAUNCH_DEFINITION_OF_DONE.md):
-- "A sequence that was never filed may be retired, by signature ... The act
-- reuses the filed-elsewhere baseline's existing removal of drafts."
--
-- WHY. A sequence leaves the live set by `deleted_at`. Nothing in the database
-- said who may set it, so any write could make a sequence vanish, and its
-- number with it, with no record of who decided or why, and a filed sequence
-- could be removed as easily as a draft. Two acts remove a sequence, and both
-- are signed:
--   (a) a retirement (P-86): the sequence's own signature with intent 'retire'
--       and the meaning responsibility, recorded by one ECTD_SEQUENCE_RETIRED
--       audit row (submission-service.ts retireSequence);
--   (b) the filed-elsewhere declaration's removal of the empty drafts it
--       replaces (filed-sequence-baseline.ts, 20261029g), whose signature names
--       them in its act (removedDraftSequences).
--
-- WHAT. Triggers only: no table, column or backfill, and nothing of another
-- file is dropped (Rule 1).
--   G1 ectd_sequences_removal_recorded, a deferred constraint trigger: at
--      COMMIT a removal stands only with (a) or (b) on record.
--   G2 ectd_sequences_removal_guard, before update: a removed row is never
--      changed or restored; a filed or in-flight sequence ('sent',
--      'acknowledged', 'transmitting') is never removed; a removal changes no
--      column but deleted_at and updated_at.
-- Not guarded: INSERT, DELETE (the tenant purge) and TRUNCATE.
--
-- REPLAY. Every deploy re-runs this file (Rule 1). The functions are CREATE OR
-- REPLACE, and the two triggers are dropped and created again by name, so an
-- amendment of a WHEN clause takes effect on replay and a re-run is a no-op.
--
-- WARNING. A future backfill of ectd_sequences must carry
-- `WHERE deleted_at IS NULL`: a removed row refuses every change.
-- =============================================================================

-- The columns the guard reads. A database without them refuses here, by name,
-- rather than admitting every removal through a missing column.
DO $chk$
DECLARE
  need text[] := ARRAY[
    'audit_logs.tenant_id', 'audit_logs.table_name', 'audit_logs.record_id', 'audit_logs.action',
    'audit_logs.actor_id', 'audit_logs.new_values',
    'electronic_signatures.organization_id', 'electronic_signatures.signed_target',
    'electronic_signatures.signature_type', 'electronic_signatures.binding_basis',
    'electronic_signatures.signer_id', 'electronic_signatures.signature_meaning',
    'electronic_signatures.signature_manifest', 'electronic_signatures.superseded_by',
    'electronic_signatures.is_valid', 'electronic_signatures.verification_status',
    'electronic_signatures.created_at',
    'c2c_ana_actions.id', 'c2c_ana_actions.org_id', 'c2c_ana_actions.command', 'c2c_ana_actions.target',
    'c2c_ana_actions.state', 'c2c_ana_actions.payload',
    'submission_filed_baselines.id', 'submission_filed_baselines.organization_id',
    'submission_filed_baselines.submission_id', 'submission_filed_baselines.declared_by'];
  c text;
BEGIN
  FOREACH c IN ARRAY need LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = split_part(c, '.', 1) AND column_name = split_part(c, '.', 2)) THEN
      RAISE EXCEPTION 'ectd_sequence_removal_guard: public.% is missing; the guard reads it to admit a recorded removal.', c;
    END IF;
  END LOOP;
END
$chk$;

-- G1, at COMMIT: a removal stands only with its record.
CREATE OR REPLACE FUNCTION public.ectd_sequences_removal_recorded()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  -- Judged on the row as it stands at COMMIT.
  IF NOT EXISTS (SELECT 1 FROM public.ectd_sequences s WHERE s.id = NEW.id AND s.deleted_at IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  -- (a) The retirement: its audit row, naming the executed 'retire' sign action, whose live signature carries the
  -- meaning responsibility and was made by the audit row's actor.
  IF EXISTS (
    SELECT 1
      FROM public.audit_logs a
      JOIN public.c2c_ana_actions x
        ON x.id = (a.new_values::jsonb ->> 'signatureActionId')
       AND x.org_id = NEW.organization_id
       AND x.command = 'sign'
       AND x.target = 'ectd-sequence:' || NEW.id::text
       AND x.state = 'executed'
       AND (x.payload::jsonb ->> 'intent') = 'retire'
      JOIN public.electronic_signatures es
        ON es.organization_id = NEW.organization_id
       AND es.signed_target = 'ectd-sequence:' || NEW.id::text
       AND (es.signature_manifest::jsonb ->> 'actionId') = x.id
       AND es.signature_type = 'governed-action'
       AND es.binding_basis = 'ectd-sequence-leaf-manifest-sha256'
       AND es.signature_meaning = 'responsibility'
       AND es.signer_id = a.actor_id
       AND es.superseded_by IS NULL
       AND es.is_valid IS DISTINCT FROM false
       AND COALESCE(es.verification_status, '') NOT IN ('revoked', 'voided')
     WHERE a.tenant_id = NEW.organization_id
       AND a.table_name = 'ectd_sequence'
       AND a.record_id = NEW.id::text
       AND a.action = 'ECTD_SEQUENCE_RETIRED'
  ) THEN
    RETURN NULL;
  END IF;
  -- (b) The filed-elsewhere declaration's removal of drafts: its signature, written by this transaction, names the
  -- removed number in its act.
  IF EXISTS (
    SELECT 1
      FROM public.submission_filed_baselines b
      JOIN public.electronic_signatures es
        ON es.organization_id = b.organization_id
       AND es.signed_target = 'submission-filed-baseline:' || b.id::text
       AND es.signer_id = b.declared_by
       AND es.signature_type = 'governed-action'
       AND es.binding_basis = 'filed-sequence-baseline-content-sha256'
       AND es.superseded_by IS NULL
       AND es.is_valid IS DISTINCT FROM false
       AND COALESCE(es.verification_status, '') NOT IN ('revoked', 'voided')
       AND es.created_at = LOCALTIMESTAMP
       AND (es.signature_manifest::jsonb -> 'act' -> 'removedDraftSequences') @> jsonb_build_array(NEW.sequence_number)
     WHERE b.organization_id = NEW.organization_id
       AND b.submission_id = NEW.submission_id
  ) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION
    'SEQUENCE_REMOVAL_UNRECORDED: sequence % of submission % (organization %) is removed only by a signed retirement or a signed declaration of sequences filed elsewhere, recorded in the same transaction (21 CFR Part 11 §11.10(e), §11.50) — refused.',
    NEW.sequence_number, NEW.submission_id, NEW.organization_id
    USING ERRCODE = 'integrity_constraint_violation',
          HINT = 'Retire it from its Dispatch tab in the Submission Center, which signs it.';
END;
$fn$;

-- G2, before each update that touches a removed row or removes one.
CREATE OR REPLACE FUNCTION public.ectd_sequences_removal_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION
        'SEQUENCE_REMOVED_IMMUTABLE: sequence % (organization %) was removed; a removed sequence is never changed or restored — refused.',
        OLD.sequence_number, OLD.organization_id
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- The filed statuses (filed-dispatch.ts FILED_DISPATCH_STATUSES) and a send in flight.
  IF OLD.dispatch_status IN ('sent', 'acknowledged', 'transmitting') THEN
    RAISE EXCEPTION
      'SEQUENCE_FILED_NOT_REMOVABLE: sequence % (organization %) is %; a sequence the agency may hold is never removed — refused.',
      OLD.sequence_number, OLD.organization_id, OLD.dispatch_status
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (to_jsonb(NEW) - 'deleted_at' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'updated_at') THEN
    RAISE EXCEPTION
      'SEQUENCE_REMOVAL_CHANGES_ROW: removing sequence % (organization %) changes only when it was removed — refused.',
      OLD.sequence_number, OLD.organization_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ectd_sequences_removal_guard ON public.ectd_sequences;
CREATE TRIGGER ectd_sequences_removal_guard
  BEFORE UPDATE ON public.ectd_sequences
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.ectd_sequences_removal_guard();

DROP TRIGGER IF EXISTS ectd_sequences_removal_recorded ON public.ectd_sequences;
CREATE CONSTRAINT TRIGGER ectd_sequences_removal_recorded
  AFTER UPDATE ON public.ectd_sequences
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.ectd_sequences_removal_recorded();
