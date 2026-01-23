-- ============================================================================
-- Concept2Cure "Global Command Center" Schema - Audit Immutability Migration
-- Migration: 002_gcc_audit_immutability.sql
-- Purpose: Enforces append-only semantics for audit.concomitant_audit_logs
--          and optionally for truth.clinical_truth_store
--          (21 CFR Part 11 audit trail hardening)
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- ============================================================================

BEGIN;

-- ============================================================================
-- AUDIT LOG IMMUTABILITY
-- ============================================================================
-- Create trigger function that prevents UPDATE and DELETE operations
-- This ensures the audit log is truly append-only, as required for
-- regulatory compliance (21 CFR Part 11, EU Annex 11, etc.)
-- ============================================================================

CREATE OR REPLACE FUNCTION audit.prevent_concomitant_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 
        'COMPLIANCE VIOLATION: audit.concomitant_audit_logs is append-only. '
        'UPDATE and DELETE operations are prohibited to maintain 21 CFR Part 11 audit trail integrity. '
        'Attempted operation: % on row ID: %',
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
END;
$$;

-- Drop existing trigger if present (idempotent)
DROP TRIGGER IF EXISTS trg_no_update_delete_concomitant_audit_logs 
    ON audit.concomitant_audit_logs;

-- Create trigger that fires BEFORE UPDATE or DELETE
CREATE TRIGGER trg_no_update_delete_concomitant_audit_logs
BEFORE UPDATE OR DELETE ON audit.concomitant_audit_logs
FOR EACH ROW
EXECUTE FUNCTION audit.prevent_concomitant_audit_mutation();

-- ============================================================================
-- TRUTH STORE IMMUTABILITY (Optional but Recommended)
-- ============================================================================
-- Scientific truth should also be append-only: corrections should be inserted
-- as new rows with provenance, not updates to existing rows.
-- This maintains a complete history of all data states.
-- ============================================================================

CREATE OR REPLACE FUNCTION truth.prevent_truth_store_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 
        'COMPLIANCE VIOLATION: truth.clinical_truth_store is append-only. '
        'Corrections should be inserted as new rows with appropriate provenance metadata. '
        'Attempted operation: % on row ID: %',
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
END;
$$;

-- Drop existing trigger if present (idempotent)
DROP TRIGGER IF EXISTS trg_no_update_delete_clinical_truth_store 
    ON truth.clinical_truth_store;

-- Create trigger that fires BEFORE UPDATE or DELETE
CREATE TRIGGER trg_no_update_delete_clinical_truth_store
BEFORE UPDATE OR DELETE ON truth.clinical_truth_store
FOR EACH ROW
EXECUTE FUNCTION truth.prevent_truth_store_mutation();

-- ============================================================================
-- ADDITIONAL SECURITY COMMENT
-- ============================================================================
-- Note: TRUNCATE prevention requires revoking TRUNCATE privilege from app roles
-- This should be done at the role level:
--
--   REVOKE TRUNCATE ON audit.concomitant_audit_logs FROM app_user;
--   REVOKE TRUNCATE ON truth.clinical_truth_store FROM app_user;
--
-- Only the database owner (typically 'neondb_owner') should retain TRUNCATE rights.
-- This is documented here for compliance auditors.
-- ============================================================================

COMMENT ON FUNCTION audit.prevent_concomitant_audit_mutation() IS 
    '21 CFR Part 11: Prevents UPDATE/DELETE on audit logs to maintain append-only integrity';

COMMENT ON FUNCTION truth.prevent_truth_store_mutation() IS 
    'Data integrity: Prevents UPDATE/DELETE on truth store - corrections must be new rows';

COMMENT ON TRIGGER trg_no_update_delete_concomitant_audit_logs 
    ON audit.concomitant_audit_logs IS 
    'Append-only enforcement trigger for 21 CFR Part 11 compliance';

COMMENT ON TRIGGER trg_no_update_delete_clinical_truth_store 
    ON truth.clinical_truth_store IS 
    'Append-only enforcement trigger for scientific data integrity';

COMMIT;
