-- ============================================================================
-- 20260925_canonical_documents_append_only.sql
--
-- canonical_documents: a governed document's lifecycle record cannot be
-- rewritten (Vault parity plan VR-03, row D5; 21 CFR Part 11 §11.10(e), §11.70).
--
-- WHY. canonical_documents (20260731c) carries a document from authoring to
-- submitted, and its `audit` column is the per-document hash-chained trail
-- every transition appends to. The chain was "append-only" by convention and
-- nothing else:
--
--   * `audit` is a plain JSONB column. Any UPDATE could replace it — rewrite an
--     event's actor, drop an event — and the route's verifier checked only that
--     each prevEventHash equalled the previous eventHash, so an edited event
--     whose hashes were left in place still read chainValid: true.
--   * POST /:id/sign overwrote review_signature / approval_signature at any
--     stage, appended no event, and left no trace of the signature it replaced.
--   * persistState read the row, then wrote [...prior, event] with no lock, so
--     two concurrent transitions could each append to the same prior trail and
--     one event would vanish.
--
-- This file makes the database refuse what the application no longer does
-- (the same change moves persistState under FOR UPDATE, makes the review
-- sign-off write-once per round and gives the verifier a hasher):
--
--   UPDATE
--     * the trail only grows: NEW.audit keeps OLD.audit as its exact prefix;
--     * approval_signature is written once (NULL → value, never changed);
--     * review_signature is written once per review round. It may return to
--       NULL only on the revision transition in_review → authoring, in the same
--       statement that appends that transition's event — so the review round it
--       closes stays in the trail and the next round needs a fresh sign-off;
--     * a signature or a stage change is never recorded without its own trail
--       event, and a stage change's last event must name the new stage;
--     * canonical_id, organization_id, created_at and source_refs are frozen;
--     * content_hash is frozen once the document has left authoring;
--     * a superseded or withdrawn document is frozen entirely.
--   DELETE, TRUNCATE
--     * refused, for every role. Nothing deletes canonical_documents today (the
--       tenant purge's table list, server/services/tenant/tenant-offboarding.ts,
--       does not include it). An owner-exempt refusal was considered and not
--       taken: on a single-role estate the runtime IS the owner, so the
--       exemption would be the whole door (plan critic item 4). A governed
--       purge path, when one exists (VR-07), amends this file in place.
--
-- A superuser or the table owner can still DISABLE TRIGGER. That is outside
-- what a trigger can prevent; it is what the startup trigger-presence check
-- (security plan P0-9) exists to notice, and canonical_documents_guard_row /
-- canonical_documents_guard_truncate belong on its list.
--
-- RULE 1: replayed on every deploy. CREATE OR REPLACE for the function; each
-- trigger is created only when absent from pg_trigger (the esign idiom,
-- db/migrations/20260730_esign_audit_db_level_immutability.sql). No DROP.
-- Guarded on to_regclass so a lineage without the table skips it.
--
-- Pinned by tests/regulatory/canonical-documents-append-only.pglite.test.ts
-- (the UPDATE rules) and tests/db/canonical-documents-append-only.dbtest.ts
-- (DELETE, TRUNCATE and concurrent transitions, as the runtime role).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.canonical_documents_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_len integer;
  new_len integer;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: canonical_documents cannot be truncated — it holds governed lifecycle records (21 CFR Part 11 §11.10(e)).'
      USING ERRCODE = 'raise_exception';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: canonical document % cannot be deleted — its lifecycle record is retained (21 CFR Part 11 §11.10(e)). Withdraw or supersede it instead.', OLD.canonical_id
      USING ERRCODE = 'raise_exception';
  END IF;

  -- UPDATE ------------------------------------------------------------------

  IF OLD.stage IN ('superseded', 'withdrawn') THEN
    IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION
        'IMMUTABILITY_VIOLATION: canonical document % is % and can never be modified again.', OLD.canonical_id, OLD.stage
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.canonical_id IS DISTINCT FROM OLD.canonical_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.source_refs IS DISTINCT FROM OLD.source_refs THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: the identity, tenant, creation time and source binding of canonical document % are frozen.', OLD.canonical_id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF OLD.stage <> 'authoring' AND NEW.content_hash IS DISTINCT FROM OLD.content_hash THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: the content hash of canonical document % is frozen once it has left authoring (stage %).', OLD.canonical_id, OLD.stage
      USING ERRCODE = 'raise_exception';
  END IF;

  IF jsonb_typeof(NEW.audit) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: the lifecycle trail of canonical document % must remain an array.', OLD.canonical_id
      USING ERRCODE = 'raise_exception';
  END IF;
  old_len := jsonb_array_length(OLD.audit);
  new_len := jsonb_array_length(NEW.audit);
  IF new_len < old_len
     OR (old_len > 0 AND (
           SELECT jsonb_agg(t.e ORDER BY t.i)
             FROM jsonb_array_elements(NEW.audit) WITH ORDINALITY AS t(e, i)
            WHERE t.i <= old_len
         ) IS DISTINCT FROM OLD.audit) THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: the lifecycle trail of canonical document % only grows — recorded events cannot be changed or removed.', OLD.canonical_id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF OLD.approval_signature IS NOT NULL
     AND NEW.approval_signature IS DISTINCT FROM OLD.approval_signature THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: the approval of canonical document % is recorded and cannot be replaced or removed.', OLD.canonical_id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF OLD.review_signature IS NOT NULL
     AND NEW.review_signature IS DISTINCT FROM OLD.review_signature
     AND NOT (NEW.review_signature IS NULL
              AND OLD.stage = 'in_review'
              AND NEW.stage = 'authoring'
              AND new_len > old_len) THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: the review sign-off of canonical document % is recorded; it closes only with a recorded revision (in_review → authoring).', OLD.canonical_id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF new_len = old_len
     AND (NEW.stage IS DISTINCT FROM OLD.stage
          OR NEW.review_signature IS DISTINCT FROM OLD.review_signature
          OR NEW.approval_signature IS DISTINCT FROM OLD.approval_signature) THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: a stage change or signature on canonical document % must append its own lifecycle event.', OLD.canonical_id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage
     AND (NEW.audit -> -1 ->> 'to') IS DISTINCT FROM NEW.stage THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: canonical document % moved to % but its last lifecycle event does not record that transition.', OLD.canonical_id, NEW.stage
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN NEW;
END;
$$;

DO $mig$
BEGIN
  IF to_regclass('public.canonical_documents') IS NULL THEN
    RAISE NOTICE 'canonical_documents absent — append-only guard skipped';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'canonical_documents_guard_row'
       AND tgrelid = 'public.canonical_documents'::regclass
  ) THEN
    CREATE TRIGGER canonical_documents_guard_row
      BEFORE UPDATE OR DELETE ON public.canonical_documents
      FOR EACH ROW EXECUTE FUNCTION public.canonical_documents_guard();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'canonical_documents_guard_truncate'
       AND tgrelid = 'public.canonical_documents'::regclass
  ) THEN
    CREATE TRIGGER canonical_documents_guard_truncate
      BEFORE TRUNCATE ON public.canonical_documents
      FOR EACH STATEMENT EXECUTE FUNCTION public.canonical_documents_guard();
  END IF;
END
$mig$;
