-- ============================================================================
-- GA Readiness: Immutability Hardening for Regulated Tables
-- Migration: 20260318_ga_immutability_hardening.sql
-- Purpose: Adds append-only triggers on artifact_versions, submission_snapshots,
--          account_events, and signature_log — closing gaps identified in the
--          GA record-integrity audit (Audit 5).
--          Also adds a trigger to prevent modification of locked canon items
--          and locked artifacts (Audit 2 — Policy-Gate Bypass).
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ARTIFACT VERSIONS — APPEND-ONLY
-- ============================================================================
-- concept2cure_artifact_versions must be immutable once written.
-- Version history is a core Part 11 record — no UPDATE or DELETE permitted.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_artifact_version_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'COMPLIANCE VIOLATION: concept2cure_artifact_versions is append-only. '
        'UPDATE and DELETE operations are prohibited to maintain 21 CFR Part 11 version history integrity. '
        'Attempted operation: % on row ID: %',
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_delete_artifact_versions
    ON concept2cure_artifact_versions;

CREATE TRIGGER trg_no_update_delete_artifact_versions
BEFORE UPDATE OR DELETE ON concept2cure_artifact_versions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_artifact_version_mutation();

COMMENT ON FUNCTION public.prevent_artifact_version_mutation() IS
    '21 CFR Part 11: Prevents UPDATE/DELETE on artifact versions to maintain append-only integrity';

COMMENT ON TRIGGER trg_no_update_delete_artifact_versions
    ON concept2cure_artifact_versions IS
    'Append-only enforcement trigger for artifact version history (21 CFR Part 11)';

-- ============================================================================
-- 2. SUBMISSION SNAPSHOTS — APPEND-ONLY
-- ============================================================================
-- Submission snapshots capture the exact state at publish/export time.
-- Tampering with these records invalidates the regulatory submission chain.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_submission_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'COMPLIANCE VIOLATION: concept2cure_submission_snapshots is append-only. '
        'UPDATE and DELETE operations are prohibited to maintain submission integrity. '
        'Attempted operation: % on row ID: %',
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_delete_submission_snapshots
    ON concept2cure_submission_snapshots;

CREATE TRIGGER trg_no_update_delete_submission_snapshots
BEFORE UPDATE OR DELETE ON concept2cure_submission_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.prevent_submission_snapshot_mutation();

COMMENT ON FUNCTION public.prevent_submission_snapshot_mutation() IS
    '21 CFR Part 11: Prevents UPDATE/DELETE on submission snapshots';

COMMENT ON TRIGGER trg_no_update_delete_submission_snapshots
    ON concept2cure_submission_snapshots IS
    'Append-only enforcement trigger for submission snapshots (21 CFR Part 11)';

-- ============================================================================
-- 3. ACCOUNT EVENTS — APPEND-ONLY
-- ============================================================================
-- The account event ledger is the canonical audit trail for all canon,
-- bundle, and term mutations. Must be immutable.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_account_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'COMPLIANCE VIOLATION: account_events is append-only. '
        'UPDATE and DELETE operations are prohibited to maintain audit trail integrity. '
        'Attempted operation: % on row ID: %',
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_delete_account_events
    ON account_events;

CREATE TRIGGER trg_no_update_delete_account_events
BEFORE UPDATE OR DELETE ON account_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_account_event_mutation();

COMMENT ON FUNCTION public.prevent_account_event_mutation() IS
    'Audit trail integrity: Prevents UPDATE/DELETE on account event ledger';

COMMENT ON TRIGGER trg_no_update_delete_account_events
    ON account_events IS
    'Append-only enforcement trigger for account event ledger';

-- ============================================================================
-- 4. SIGNATURE LOG — APPEND-ONLY
-- ============================================================================
-- Electronic signatures under Part 11 must be immutable once applied.
-- Invalidation should be a separate record, not an UPDATE.
-- ============================================================================

CREATE OR REPLACE FUNCTION audit.prevent_signature_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'COMPLIANCE VIOLATION: audit.signature_log is append-only. '
        'Signature invalidation must be recorded as a separate audit event, not an UPDATE. '
        'Attempted operation: % on row ID: %',
        TG_OP,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_delete_signature_log
    ON audit.signature_log;

CREATE TRIGGER trg_no_update_delete_signature_log
BEFORE UPDATE OR DELETE ON audit.signature_log
FOR EACH ROW
EXECUTE FUNCTION audit.prevent_signature_log_mutation();

COMMENT ON FUNCTION audit.prevent_signature_log_mutation() IS
    '21 CFR Part 11: Prevents UPDATE/DELETE on electronic signature records';

COMMENT ON TRIGGER trg_no_update_delete_signature_log
    ON audit.signature_log IS
    'Append-only enforcement trigger for electronic signatures (21 CFR Part 11)';

-- ============================================================================
-- 5. LOCKED CANON ITEMS — PREVENT MODIFICATION
-- ============================================================================
-- Once a canon item is locked, only supersession is allowed (which creates
-- a new row). Direct UPDATE of a locked item's content is prohibited.
-- Status transitions FROM 'locked' are only allowed to 'superseded'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_locked_canon_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Allow transition from locked → superseded (the only valid mutation)
    IF OLD.status = 'locked' AND NEW.status = 'superseded' AND NEW.superseded_by_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Block all other modifications to locked items
    IF OLD.status = 'locked' THEN
        RAISE EXCEPTION
            'COMPLIANCE VIOLATION: Cannot modify locked canon item (id=%). '
            'Locked items can only be superseded via supersedeCanonFact(). '
            'Attempted to change status from ''locked'' to ''%''.',
            OLD.id,
            NEW.status;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_locked_canon_items
    ON account_canon_items;

CREATE TRIGGER trg_protect_locked_canon_items
BEFORE UPDATE ON account_canon_items
FOR EACH ROW
EXECUTE FUNCTION public.prevent_locked_canon_mutation();

COMMENT ON FUNCTION public.prevent_locked_canon_mutation() IS
    'Canon governance: Prevents modification of locked canon items except for supersession';

COMMENT ON TRIGGER trg_protect_locked_canon_items
    ON account_canon_items IS
    'Locked canon item protection — only supersession (locked→superseded) is allowed';

-- ============================================================================
-- 6. LOCKED ARTIFACTS — PREVENT CONTENT MODIFICATION
-- ============================================================================
-- Once an artifact is locked (locked_at IS NOT NULL), content and status
-- changes are prohibited. Only unlocking by an admin creates a new version.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_locked_artifact_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.locked_at IS NOT NULL THEN
        -- Allow only specific admin unlock operations (cleared locked_at)
        IF NEW.locked_at IS NULL THEN
            RETURN NEW;
        END IF;

        -- Block content or status changes on locked artifacts
        IF OLD.content IS DISTINCT FROM NEW.content
           OR OLD.status IS DISTINCT FROM NEW.status
           OR OLD.title IS DISTINCT FROM NEW.title THEN
            RAISE EXCEPTION
                'COMPLIANCE VIOLATION: Cannot modify locked artifact (id=%). '
                'Unlock the artifact first or create a new version.',
                OLD.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_locked_artifacts
    ON concept2cure_artifacts;

CREATE TRIGGER trg_protect_locked_artifacts
BEFORE UPDATE ON concept2cure_artifacts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_locked_artifact_mutation();

COMMENT ON FUNCTION public.prevent_locked_artifact_mutation() IS
    'Artifact governance: Prevents content/status modification of locked artifacts';

COMMENT ON TRIGGER trg_protect_locked_artifacts
    ON concept2cure_artifacts IS
    'Locked artifact protection — content and status immutable while locked';

-- ============================================================================
-- 7. REVOKE DANGEROUS PRIVILEGES FROM APPLICATION ROLES
-- ============================================================================
-- Prevent TRUNCATE on all immutable tables. Only DB owner should have this.
-- Using DO block to gracefully handle missing roles.
-- ============================================================================

DO $$
BEGIN
    -- Revoke from common application roles (ignore errors for missing roles)
    BEGIN
        EXECUTE 'REVOKE DELETE, TRUNCATE ON concept2cure_artifact_versions FROM PUBLIC';
        EXECUTE 'REVOKE DELETE, TRUNCATE ON concept2cure_submission_snapshots FROM PUBLIC';
        EXECUTE 'REVOKE DELETE, TRUNCATE ON account_events FROM PUBLIC';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Some privilege revocations skipped (roles may not exist): %', SQLERRM;
    END;
END;
$$;

COMMIT;
