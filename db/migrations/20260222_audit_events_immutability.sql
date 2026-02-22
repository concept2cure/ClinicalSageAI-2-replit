-- ═══════════════════════════════════════════════════════════════════════════════
-- DB-Level Immutability Enforcement for audit_events
--
-- REGULATORY BASIS: 21 CFR Part 11 §11.10(e) — audit trail records must be
-- immutable. Application-layer blocks can be bypassed by direct DB access,
-- accidental migrations, or admin tooling. This trigger enforces immutability
-- at the database engine level as defense in depth.
--
-- This is the SAME pattern used for:
--   - compliance.audit_trail (080_gcc_21cfr_part11_compliance.sql)
--   - audit.concomitant_audit_logs (002_gcc_audit_immutability.sql)
--   - proof_audit_logs (20260129_proof_audit_logs.sql)
--   - enterprise audit tables (001_enterprise_audit_tables.sql)
--
-- Migration: 20260222_audit_events_immutability.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PREVENT UPDATE on audit_events
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_audit_events_no_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: UPDATE on audit_events is prohibited. '
    'Audit trail records are append-only per 21 CFR Part 11 §11.10(e). '
    'Attempted to update row id=%', OLD.id;
  RETURN NULL; -- never reached
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_events_no_update ON audit_events;

CREATE TRIGGER trg_audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_audit_events_no_update();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PREVENT DELETE on audit_events
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_audit_events_no_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: DELETE on audit_events is prohibited. '
    'Audit trail records are append-only per 21 CFR Part 11 §11.10(e). '
    'Attempted to delete row id=%', OLD.id;
  RETURN NULL; -- never reached
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_events_no_delete ON audit_events;

CREATE TRIGGER trg_audit_events_no_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_audit_events_no_delete();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PREVENT TRUNCATE on audit_events
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_audit_events_no_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'IMMUTABILITY_VIOLATION: TRUNCATE on audit_events is prohibited. '
    'Audit trail records are append-only per 21 CFR Part 11 §11.10(e).';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_events_no_truncate ON audit_events;

CREATE TRIGGER trg_audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION enforce_audit_events_no_truncate();

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION: Confirm triggers are installed
-- Uses pg_trigger + pg_class (not information_schema.triggers, which omits
-- TRUNCATE triggers in PostgreSQL).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO trigger_count
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE c.relname = 'audit_events'
    AND t.tgname LIKE 'trg_audit_events_no_%'
    AND NOT t.tgisinternal;

  IF trigger_count < 3 THEN
    RAISE WARNING 'Expected 3 immutability triggers on audit_events (UPDATE, DELETE, TRUNCATE), found %', trigger_count;
  ELSE
    RAISE NOTICE 'audit_events immutability enforced: % triggers installed (UPDATE, DELETE, TRUNCATE)', trigger_count;
  END IF;
END;
$$;
