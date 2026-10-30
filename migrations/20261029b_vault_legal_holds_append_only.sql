-- ============================================================================
-- 20261029b_vault_legal_holds_append_only.sql
--
-- A legal hold is a record: placed once, lifted once, never rewritten or
-- removed (MR-08 Stage 5 step 4, CAT1-15,
-- docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
--
-- WHY. vault.legal_holds (20260906b) records who placed a hold, under what
-- matter and why, and who lifted it and why. Its CHECKs say what a row must
-- hold, but nothing stopped the row being changed afterwards. As the runtime
-- role, in its own tenant, a hold's reason could be rewritten, a lift undone
-- (lifted_at back to NULL, so a lifted hold reads active again), a lift's
-- reason replaced, or the row deleted. The retention sweep, the tenant purge
-- and the disposition engine all read this table to decide what may be
-- destroyed, and a hold whose history can be edited is a spoliation risk:
-- it cannot show who held what, when, and on whose authority it was released.
--
--   vault.legal_holds_record_guard(), BEFORE UPDATE OR DELETE, per row:
--     * UPDATE is admitted only as the one lift: lifted_at, lifted_by and
--       lift_reason going from NULL to a value, every other column unchanged.
--       The lift's own CHECK (vault_legal_holds_lift_attributed) still holds
--       it to an author and a reason. Anything else raises
--       IMMUTABILITY_VIOLATION, including a second lift and an un-lift.
--     * DELETE is admitted only to the table's owner, as vault.documents'
--       delete guard admits the owner-run tenant purge. No code path deletes a
--       hold today.
--   vault.legal_holds_truncate_guard(), BEFORE TRUNCATE: refused.
--
-- Census of writers (2026-10-29): INSERT and the lift in
-- server/routes/vault-legal-holds.ts; no other UPDATE or DELETE outside test
-- fixtures. ana_record_purger holds UPDATE only to take a SHARE lock
-- (20261014_ana_source_read_receipts.sql); it never updates a hold.
--
-- Both triggers are registered in
-- server/services/audit/audit-immutability-triggers.ts, so production refuses
-- to boot without them.
--
-- RULE 1: replayed on every deploy. CREATE OR REPLACE for the functions; each
-- trigger is created only when absent. No DROP. Guarded on to_regclass, so a
-- database without the table skips it.
--
-- Pinned by tests/db/vault-legal-hold-append-only.dbtest.ts.
-- ============================================================================

DO $mig$
BEGIN
  IF to_regclass('vault.legal_holds') IS NULL THEN
    RAISE NOTICE 'vault.legal_holds absent: hold record guard skipped';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION vault.legal_holds_record_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $body$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF current_user = (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = TG_RELID) THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: legal hold % is a record and cannot be deleted. Lift it, with a reason.', OLD.id
          USING ERRCODE = 'raise_exception';
      END IF;
      -- The one admitted change: the lift, once.
      IF OLD.lifted_at IS NULL AND OLD.lifted_by IS NULL AND OLD.lift_reason IS NULL
         AND NEW.lifted_at IS NOT NULL
         AND (NEW.id, NEW.organization_id, NEW.reference, NEW.reason, NEW.scope, NEW.program_id,
              NEW.document_id, NEW.placed_by, NEW.placed_at)
             IS NOT DISTINCT FROM
             (OLD.id, OLD.organization_id, OLD.reference, OLD.reason, OLD.scope, OLD.program_id,
              OLD.document_id, OLD.placed_by, OLD.placed_at) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: legal hold % is a record. It is placed once and lifted once; nothing else about it changes.', OLD.id
        USING ERRCODE = 'raise_exception';
    END;
    $body$;
  $fn$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION vault.legal_holds_truncate_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $body$
    BEGIN
      RAISE EXCEPTION 'IMMUTABILITY_VIOLATION: vault.legal_holds cannot be truncated.'
        USING ERRCODE = 'raise_exception';
    END;
    $body$;
  $fn$;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'vault.legal_holds'::regclass AND tgname = 'vault_legal_holds_record_guard'
  ) THEN
    CREATE TRIGGER vault_legal_holds_record_guard
      BEFORE UPDATE OR DELETE ON vault.legal_holds
      FOR EACH ROW EXECUTE FUNCTION vault.legal_holds_record_guard();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'vault.legal_holds'::regclass AND tgname = 'vault_legal_holds_truncate_guard'
  ) THEN
    CREATE TRIGGER vault_legal_holds_truncate_guard
      BEFORE TRUNCATE ON vault.legal_holds
      FOR EACH STATEMENT EXECUTE FUNCTION vault.legal_holds_truncate_guard();
  END IF;
END
$mig$;
