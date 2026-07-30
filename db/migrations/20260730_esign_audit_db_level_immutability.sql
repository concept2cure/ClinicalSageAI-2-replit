-- ============================================================================
-- 20260730_esign_audit_db_level_immutability.sql
--
-- 21 CFR Part 11 §11.70 / §11.10(e): database-level immutability for the
-- e-signature and device-audit trails.
--
-- WHY (auth/e-signature audit 2026-07-30): the append-only invariant for
-- electronic_signatures and device_audit_trail existed only as code-review
-- convention and an HTTP-layer route guard (applyImmutabilityPolicy). Nothing
-- stopped a service, script, or future route from UPDATEing or DELETEing a
-- final signature or an audit event directly through SQL. As of this change
-- no server code performs such a mutation (the sign-release route's
-- post-insert UPDATE was removed in the same change set — signature rows are
-- now complete at INSERT), so the invariant can be enforced where it belongs:
-- in the database.
--
-- POLICY (record-class, see docs/compliance/part11-immutability-record-class-policy.md):
--   electronic_signatures : append-only. UPDATE is refused EXCEPT the
--                           write-once supersession transition — setting
--                           superseded_by from NULL to a value (plus its
--                           bookkeeping timestamp updated_at). A superseded
--                           row can never be re-pointed. DELETE is refused.
--   device_audit_trail    : strictly append-only. UPDATE and DELETE refused.
--
-- Corrections are made by INSERTING a superseding record, never by mutating
-- or removing history.
--
-- Idempotent: CREATE OR REPLACE for functions, conditional CREATE TRIGGER.
-- Tables are guarded with to_regclass so lineages that don't carry a table
-- skip its trigger instead of failing the whole migration run.
-- ============================================================================

-- ── electronic_signatures: block DELETE, allow only supersession UPDATE ─────

CREATE OR REPLACE FUNCTION esign_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: electronic_signatures is append-only (21 CFR Part 11 §11.70) — rows cannot be deleted. Insert a superseding signature instead.'
      USING ERRCODE = 'raise_exception';
  END IF;

  -- UPDATE: permit ONLY the write-once supersession transition.
  IF OLD.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: signature % is already superseded and can never be modified again (§11.70).', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF (to_jsonb(NEW) - 'superseded_by' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'superseded_by' - 'updated_at') THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: electronic_signatures rows are append-only (§11.70); only the write-once superseded_by transition is permitted. Insert a correcting signature instead of modifying row %.', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;

  -- Reaching here means every column except superseded_by/updated_at is
  -- untouched and the row was not previously superseded: either the write-once
  -- supersession transition (NULL → id) or a no-op write-through. Both pass.
  RETURN NEW;
END;
$$;

-- ── device_audit_trail: strictly append-only ────────────────────────────────

CREATE OR REPLACE FUNCTION device_audit_trail_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: device_audit_trail is append-only (21 CFR Part 11 §11.10(e)) — audit events can never be modified or deleted. Record a correcting event instead.'
    USING ERRCODE = 'raise_exception';
END;
$$;

-- ── Attach triggers (conditionally — table and trigger may not exist yet) ───

DO $$
BEGIN
  IF to_regclass('public.electronic_signatures') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE t.tgname = 'trg_electronic_signatures_immutable'
        AND c.relname = 'electronic_signatures'
    ) THEN
      CREATE TRIGGER trg_electronic_signatures_immutable
        BEFORE UPDATE OR DELETE ON public.electronic_signatures
        FOR EACH ROW
        EXECUTE FUNCTION esign_block_mutation();
    END IF;
  END IF;

  IF to_regclass('public.device_audit_trail') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE t.tgname = 'trg_device_audit_trail_immutable'
        AND c.relname = 'device_audit_trail'
    ) THEN
      CREATE TRIGGER trg_device_audit_trail_immutable
        BEFORE UPDATE OR DELETE ON public.device_audit_trail
        FOR EACH ROW
        EXECUTE FUNCTION device_audit_trail_block_mutation();
    END IF;
  END IF;
END;
$$;
