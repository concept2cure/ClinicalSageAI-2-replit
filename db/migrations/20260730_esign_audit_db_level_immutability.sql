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
-- AMENDED IN PLACE 2026-09-25 (row D5; security audit 2026-09-24 finding DP-03,
-- evidence docs/evidence/D6/2026-09-24-p0/P0-7/; CLAUDE.md Rule 1: this file
-- re-runs on every deploy, so the change is here, not in an appended migration).
-- The governed revocation (server/services/part11/signature-persistence.ts,
-- persistGovernedSignatureRevocation) marks the superseded row with
-- superseded_by AND the verification column group — is_valid = false,
-- verification_status = 'revoked', verification_date — so a superseded
-- signature can never be misread as one whose signing factors failed. This
-- function permitted only superseded_by/updated_at, so every revocation raised
-- IMMUTABILITY_VIOLATION (reproduced on PostgreSQL 16). The rule is now:
--   * the verification column group may change ONLY in the same statement
--     that performs the write-once supersession (superseded_by NULL → id),
--     and only to the invalid, revoked state (is_valid never becomes true;
--     verification_status may only become 'revoked'; a 'revoked' row is never
--     valid);
--   * the attested columns (signer identity, hashes, manifest, binding) stay
--     byte-identical in every UPDATE, supersession included;
--   * outside a supersession only updated_at may differ; a superseded row can
--     never be modified again; DELETE stays refused.
-- Pinned by server/services/part11/__tests__/signature-revocation-trigger.pglite.integration.test.ts.
--
-- AMENDED IN PLACE 2026-10-15 (row D5; CLAUDE.md Rule 1, as above). P-23
-- (docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08) takes a signature out of
-- force when the governed act it was given for is refused: voidSignatureForRefusedAct
-- (server/services/part11/signature-persistence.ts) sets is_valid = false,
-- verification_status = 'voided' and verification_date, with no successor row
-- (nobody signed the void). This function refused that statement — it is not a
-- supersession, so only updated_at could differ — and the caller, by design,
-- logged the refusal and recorded the void on the audit chain alone. So in every
-- deployment a voided signature's row still read is_valid = true: Gate 1 refused
-- it (it reads the chain), but every reader of the row, the revocation
-- candidates and the Shadow Review waiver and finding-closure reads among them,
-- saw a live signature. Found by the revocation-by-intent change, reproduced
-- against this file (docs/evidence/D5/2026-10-15-p23-void-on-the-row/). The rule
-- gains one write-once transition beside the supersession:
--   * the void: superseded_by stays NULL; the verification column group may
--     move once, to is_valid = false and verification_status = 'voided' (with
--     verification_date); the attested columns stay byte-identical;
--   * a voided row can never be modified again — not re-validated, not
--     superseded, not touched;
--   * 'revoked' still happens only with a supersession, as above.
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

  -- UPDATE: permit ONLY the write-once supersession transition, and the
  -- write-once void (P-23, amended 2026-10-15).
  IF OLD.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: signature % is already superseded and can never be modified again (§11.70).', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.verification_status = 'voided' THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: signature % was voided for a refused act and can never be modified again (§11.70).', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;

  IF NEW.superseded_by IS NOT NULL THEN
    -- The write-once supersession transition (NULL → id). The attested columns
    -- never change; the verification column group may move, in this statement
    -- only, to the invalid, revoked state that the governed revocation records.
    IF (to_jsonb(NEW) - 'superseded_by' - 'updated_at' - 'is_valid' - 'verification_status' - 'verification_date')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'superseded_by' - 'updated_at' - 'is_valid' - 'verification_status' - 'verification_date') THEN
      RAISE EXCEPTION
        'IMMUTABILITY_VIOLATION: a supersession may set superseded_by and the verification column group of row % and nothing else (§11.70). Insert a correcting signature instead of modifying an attested column.', OLD.id
        USING ERRCODE = 'raise_exception';
    END IF;
    IF NEW.is_valid IS DISTINCT FROM OLD.is_valid AND NEW.is_valid IS DISTINCT FROM false THEN
      RAISE EXCEPTION
        'IMMUTABILITY_VIOLATION: a superseded signature (row %) cannot be made valid (§11.70).', OLD.id
        USING ERRCODE = 'raise_exception';
    END IF;
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status IS DISTINCT FROM 'revoked' THEN
      RAISE EXCEPTION
        'IMMUTABILITY_VIOLATION: on supersession the verification_status of row % may only become ''revoked'' (§11.70).', OLD.id
        USING ERRCODE = 'raise_exception';
    END IF;
    IF NEW.verification_status = 'revoked' AND NEW.is_valid IS DISTINCT FROM false THEN
      RAISE EXCEPTION
        'IMMUTABILITY_VIOLATION: a revoked signature (row %) is never valid (§11.70).', OLD.id
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END IF;

  -- The write-once void (P-23): no successor; the verification column group
  -- only, and only to the invalid, voided state.
  IF NEW.verification_status = 'voided' THEN
    IF (to_jsonb(NEW) - 'updated_at' - 'is_valid' - 'verification_status' - 'verification_date')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'updated_at' - 'is_valid' - 'verification_status' - 'verification_date') THEN
      RAISE EXCEPTION
        'IMMUTABILITY_VIOLATION: a void may set the verification column group of row % and nothing else (§11.70).', OLD.id
        USING ERRCODE = 'raise_exception';
    END IF;
    IF NEW.is_valid IS DISTINCT FROM false THEN
      RAISE EXCEPTION
        'IMMUTABILITY_VIOLATION: a voided signature (row %) is never valid (§11.70).', OLD.id
        USING ERRCODE = 'raise_exception';
    END IF;
    RETURN NEW;
  END IF;

  -- Neither: only the bookkeeping timestamp may differ (a no-op
  -- write-through). Anything else is a mutation of history.
  IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION
      'IMMUTABILITY_VIOLATION: electronic_signatures rows are append-only (§11.70); only the write-once superseded_by transition is permitted. Insert a correcting signature instead of modifying row %.', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;
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
