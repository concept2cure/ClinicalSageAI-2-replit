-- Migration: 20260129_proof_audit_logs.sql
-- Description: Create proof_audit_logs table for 21 CFR Part 11 compliant audit trail
-- Phase 4.1 Proof System - Regulatory Compliance

-- ============================================================================
-- PROOF AUDIT LOGS TABLE
-- ============================================================================
-- Hash-chained, immutable audit trail for the Proof System
-- Required for 21 CFR Part 11 § 11.10(e) compliance

CREATE TABLE IF NOT EXISTS proof_audit_logs (
    id SERIAL PRIMARY KEY,
    entry_id TEXT NOT NULL UNIQUE,
    organization_id INTEGER REFERENCES organizations(id),
    workflow_run_id TEXT,
    
    -- Event Details
    event_type TEXT NOT NULL CHECK (event_type IN (
        'GRAPH_COMPILE',
        'GRAPH_TRANSITION', 
        'GRAPH_INVARIANT_CHECK',
        'ZK_PROOF_GENERATED',
        'ZK_VERIFICATION_SUCCESS',
        'ZK_VERIFICATION_FAILED',
        'DELTA_BASELINE_SET',
        'DELTA_DRIFT_DETECTED',
        'DELTA_TAMPER_DETECTED',
        'CERTIFICATE_GENERATED',
        'CERTIFICATE_VERIFIED',
        'CERTIFICATE_VERIFICATION_FAILED',
        'UI_PROOF_VIEW',
        'UI_VERIFICATION_REQUEST'
    )),
    actor_id TEXT,
    actor_role TEXT,
    
    -- Proof Data (redacted for compliance)
    details JSONB NOT NULL DEFAULT '{}',
    
    -- Hash Chain Integrity (required for 21 CFR Part 11 § 11.10(e))
    previous_hash TEXT,
    hash_chain TEXT NOT NULL,
    
    -- Trusted Timestamp
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    timestamp_source TEXT NOT NULL DEFAULT 'server' CHECK (timestamp_source IN ('server', 'ntp', 'tsa')),
    
    -- Immutability marker - prevents updates/deletes
    immutable BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS proof_audit_entry_id_idx 
    ON proof_audit_logs(entry_id);

CREATE INDEX IF NOT EXISTS proof_audit_org_idx 
    ON proof_audit_logs(organization_id);

CREATE INDEX IF NOT EXISTS proof_audit_workflow_idx 
    ON proof_audit_logs(workflow_run_id);

CREATE INDEX IF NOT EXISTS proof_audit_event_type_idx 
    ON proof_audit_logs(event_type);

CREATE INDEX IF NOT EXISTS proof_audit_timestamp_idx 
    ON proof_audit_logs(timestamp);

CREATE INDEX IF NOT EXISTS proof_audit_hash_chain_idx 
    ON proof_audit_logs(hash_chain);

-- ============================================================================
-- IMMUTABILITY ENFORCEMENT (21 CFR Part 11 Compliance)
-- ============================================================================

-- Prevent UPDATE on immutable rows
CREATE OR REPLACE FUNCTION prevent_proof_audit_update()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.immutable = TRUE THEN
        RAISE EXCEPTION 'Cannot update immutable proof audit entry: %', OLD.entry_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_proof_audit_immutability_update ON proof_audit_logs;
CREATE TRIGGER enforce_proof_audit_immutability_update
    BEFORE UPDATE ON proof_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_proof_audit_update();

-- Prevent DELETE on immutable rows  
CREATE OR REPLACE FUNCTION prevent_proof_audit_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.immutable = TRUE THEN
        RAISE EXCEPTION 'Cannot delete immutable proof audit entry: %', OLD.entry_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_proof_audit_immutability_delete ON proof_audit_logs;
CREATE TRIGGER enforce_proof_audit_immutability_delete
    BEFORE DELETE ON proof_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_proof_audit_delete();

-- ============================================================================
-- ROW LEVEL SECURITY (Tenant Isolation)
-- ============================================================================

ALTER TABLE proof_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their organization's audit entries
DROP POLICY IF EXISTS proof_audit_tenant_isolation ON proof_audit_logs;
CREATE POLICY proof_audit_tenant_isolation ON proof_audit_logs
    FOR SELECT
    USING (
        organization_id IS NULL 
        OR organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::INTEGER
    );

-- Policy: Insert allowed for authenticated users in their org
DROP POLICY IF EXISTS proof_audit_insert_policy ON proof_audit_logs;
CREATE POLICY proof_audit_insert_policy ON proof_audit_logs
    FOR INSERT
    WITH CHECK (
        organization_id IS NULL 
        OR organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::INTEGER
    );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE proof_audit_logs IS '21 CFR Part 11 compliant audit trail for Phase 4.1 Proof System';
COMMENT ON COLUMN proof_audit_logs.hash_chain IS 'SHA-256 hash of entry for chain integrity verification';
COMMENT ON COLUMN proof_audit_logs.previous_hash IS 'Hash of previous entry in chain (NULL for genesis)';
COMMENT ON COLUMN proof_audit_logs.immutable IS 'When TRUE, row cannot be updated or deleted';
COMMENT ON COLUMN proof_audit_logs.timestamp_source IS 'Source of timestamp: server=local, ntp=NTP verified, tsa=Timestamp Authority';

-- ============================================================================
-- VERIFICATION FUNCTION
-- ============================================================================

-- Function to verify hash chain integrity
CREATE OR REPLACE FUNCTION verify_proof_audit_chain(p_organization_id INTEGER DEFAULT NULL)
RETURNS TABLE (
    valid BOOLEAN,
    total_entries BIGINT,
    broken_at TEXT
) AS $$
DECLARE
    v_prev_hash TEXT := NULL;
    v_entry RECORD;
    v_count BIGINT := 0;
BEGIN
    FOR v_entry IN 
        SELECT entry_id, previous_hash, hash_chain 
        FROM proof_audit_logs 
        WHERE (p_organization_id IS NULL OR organization_id = p_organization_id)
        ORDER BY timestamp ASC
    LOOP
        v_count := v_count + 1;
        IF v_entry.previous_hash IS DISTINCT FROM v_prev_hash THEN
            RETURN QUERY SELECT FALSE, v_count, v_entry.entry_id;
            RETURN;
        END IF;
        v_prev_hash := v_entry.hash_chain;
    END LOOP;
    
    RETURN QUERY SELECT TRUE, v_count, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION verify_proof_audit_chain IS 'Verify hash chain integrity for proof audit logs';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 20260129_proof_audit_logs.sql completed successfully';
    RAISE NOTICE 'Proof audit table created with:';
    RAISE NOTICE '  - Hash chain integrity';
    RAISE NOTICE '  - Immutability triggers';
    RAISE NOTICE '  - Row Level Security';
    RAISE NOTICE '  - Timestamp source tracking';
END $$;
