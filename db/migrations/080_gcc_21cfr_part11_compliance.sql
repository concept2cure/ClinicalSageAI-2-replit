-- ============================================================================
-- Migration 080: 21 CFR Part 11 Electronic Records Compliance
-- ============================================================================
-- 
-- ⚠️  DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE
-- 
-- Document ID: MIG-080-21CFR11
-- Version: 1.0.0-DRAFT
-- Classification: GxP Critical System Component
-- Validation Status: PENDING IQ/OQ/PQ
-- 
-- Purpose: Implements 21 CFR Part 11 compliance requirements for electronic
--          records and electronic signatures in the Cortex Prime AI system.
-- 
-- Regulatory References:
--   - 21 CFR Part 11 (Electronic Records; Electronic Signatures)
--   - 21 CFR Part 820 (Quality System Regulation)
--   - EU Annex 11 (Computerised Systems)
--   - GAMP 5 (Good Automated Manufacturing Practice)
--   - ICH E6(R2) GCP Guidelines
-- 
-- Dependencies: Migrations 073-079 (Cortex Prime Core)
-- 
-- Change History:
--   2025-01-24 | v1.0.0-DRAFT | Initial creation | Requires validation
-- 
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: COMPLIANCE SCHEMA
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS compliance;
COMMENT ON SCHEMA compliance IS 
'21 CFR Part 11 compliance infrastructure. GxP critical - all changes require change control.
DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';

-- Grant restricted access
REVOKE ALL ON SCHEMA compliance FROM PUBLIC;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
        CREATE ROLE app_service NOLOGIN;
    END IF;
END $$;
GRANT USAGE ON SCHEMA compliance TO app_service;

-- ============================================================================
-- SECTION 2: AUDIT TRAIL (21 CFR 11.10(e))
-- ============================================================================
-- Computer-generated, time-stamped audit trails to independently record
-- the date and time of operator entries and actions

CREATE TABLE IF NOT EXISTS compliance.audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event identification
    event_id TEXT NOT NULL UNIQUE DEFAULT 'AUD-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::TEXT, 1, 8),
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'CREATE', 'READ', 'UPDATE', 'DELETE',
        'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
        'SIGNATURE', 'SIGNATURE_REVOKED',
        'EXPORT', 'IMPORT', 'PRINT',
        'SYSTEM_CONFIG', 'USER_CONFIG',
        'VALIDATION_EVENT', 'COMPLIANCE_CHECK',
        'DATA_MIGRATION', 'BACKUP', 'RESTORE'
    )),
    
    -- User identification (21 CFR 11.10(d))
    user_id UUID NOT NULL,
    user_email TEXT NOT NULL,
    user_full_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    organization_id UUID NOT NULL,
    
    -- Session context
    session_id UUID,
    ip_address INET,
    user_agent TEXT,
    request_id TEXT,
    
    -- Record identification
    record_schema TEXT,
    record_table TEXT,
    record_id UUID,
    record_type TEXT,
    
    -- Change details (21 CFR 11.10(e))
    previous_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    
    -- Reason for change (if required)
    change_reason TEXT,
    change_reason_code TEXT CHECK (change_reason_code IN (
        'CORRECTION', 'AMENDMENT', 'REGULATORY_UPDATE',
        'CLINICAL_UPDATE', 'ADMINISTRATIVE', 'ERROR_CORRECTION',
        'QUALITY_IMPROVEMENT', 'AUDIT_FINDING', 'OTHER'
    )),
    
    -- Integrity verification
    record_hash TEXT NOT NULL,
    previous_record_hash TEXT,
    chain_hash TEXT NOT NULL,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps (immutable)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent modification
    CONSTRAINT audit_immutable CHECK (created_at = event_timestamp)
);

-- Make audit trail append-only (no updates or deletes)
CREATE OR REPLACE FUNCTION compliance.audit_trail_immutable()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        RAISE EXCEPTION '21 CFR Part 11 Violation: Audit trail records are immutable. Record ID: %', OLD.id
            USING HINT = 'Audit trail entries cannot be modified or deleted per 21 CFR 11.10(e)';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_audit_immutability ON compliance.audit_trail;
CREATE TRIGGER enforce_audit_immutability
    BEFORE UPDATE OR DELETE ON compliance.audit_trail
    FOR EACH ROW EXECUTE FUNCTION compliance.audit_trail_immutable();

-- Indexes for audit trail queries
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON compliance.audit_trail(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON compliance.audit_trail(user_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_record ON compliance.audit_trail(record_schema, record_table, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_type ON compliance.audit_trail(event_type, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org ON compliance.audit_trail(organization_id, event_timestamp DESC);

COMMENT ON TABLE compliance.audit_trail IS
'21 CFR Part 11 compliant audit trail. Immutable, computer-generated, time-stamped records.
DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';

-- ============================================================================
-- SECTION 3: ELECTRONIC SIGNATURES (21 CFR 11.50, 11.70, 11.100)
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance.electronic_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Signature identification
    signature_id TEXT NOT NULL UNIQUE DEFAULT 'SIG-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::TEXT, 1, 8),
    
    -- Signer identification (21 CFR 11.50)
    signer_id UUID NOT NULL,
    signer_email TEXT NOT NULL,
    signer_full_name TEXT NOT NULL,
    signer_title TEXT NOT NULL,
    organization_id UUID NOT NULL,
    
    -- Signature manifestation (21 CFR 11.50(a))
    printed_name TEXT NOT NULL,
    signature_meaning TEXT NOT NULL CHECK (signature_meaning IN (
        'AUTHOR', 'REVIEWER', 'APPROVER',
        'VERIFIER', 'WITNESS', 'RESPONSIBLE_PARTY',
        'QUALITY_APPROVAL', 'REGULATORY_APPROVAL',
        'CLINICAL_APPROVAL', 'TECHNICAL_APPROVAL'
    )),
    
    -- Date and time (21 CFR 11.50(b))
    signature_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signature_timezone TEXT NOT NULL DEFAULT current_setting('TIMEZONE'),
    
    -- Record being signed
    record_schema TEXT NOT NULL,
    record_table TEXT NOT NULL,
    record_id UUID NOT NULL,
    record_version INTEGER NOT NULL DEFAULT 1,
    record_hash TEXT NOT NULL,
    
    -- Authentication (21 CFR 11.100)
    authentication_method TEXT NOT NULL CHECK (authentication_method IN (
        'PASSWORD', 'MFA_TOTP', 'MFA_SMS', 'MFA_EMAIL',
        'BIOMETRIC', 'PKI_CERTIFICATE', 'HARDWARE_TOKEN'
    )),
    authentication_timestamp TIMESTAMPTZ NOT NULL,
    authentication_session_id UUID NOT NULL,
    
    -- Signature components (21 CFR 11.200)
    -- Component 1: Something the signer knows (password hash)
    credential_hash TEXT NOT NULL,
    -- Component 2: Something unique to the signer (device/token)
    device_fingerprint TEXT,
    
    -- Signature validity
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    invalidation_reason TEXT,
    invalidated_at TIMESTAMPTZ,
    invalidated_by UUID,
    
    -- Legal attestation
    legal_attestation TEXT NOT NULL DEFAULT 
        'I am signing this record electronically and acknowledge that this signature is legally binding equivalent to a handwritten signature.',
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent modification of valid signatures
CREATE OR REPLACE FUNCTION compliance.signature_immutable()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION '21 CFR Part 11 Violation: Electronic signatures cannot be deleted. Signature ID: %', OLD.signature_id
            USING HINT = 'Signatures may only be invalidated with documented reason per 21 CFR 11.10(e)';
    END IF;
    
    IF TG_OP = 'UPDATE' THEN
        -- Only allow invalidation updates
        IF OLD.is_valid = TRUE AND NEW.is_valid = FALSE THEN
            IF NEW.invalidation_reason IS NULL OR NEW.invalidated_by IS NULL THEN
                RAISE EXCEPTION '21 CFR Part 11 Violation: Signature invalidation requires reason and authorizing user'
                    USING HINT = 'Provide invalidation_reason and invalidated_by';
            END IF;
            NEW.invalidated_at := NOW();
            RETURN NEW;
        ELSE
            RAISE EXCEPTION '21 CFR Part 11 Violation: Electronic signatures are immutable. Signature ID: %', OLD.signature_id
                USING HINT = 'Only invalidation is permitted';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_signature_immutability ON compliance.electronic_signatures;
CREATE TRIGGER enforce_signature_immutability
    BEFORE UPDATE OR DELETE ON compliance.electronic_signatures
    FOR EACH ROW EXECUTE FUNCTION compliance.signature_immutable();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_esig_signer ON compliance.electronic_signatures(signer_id, signature_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_esig_record ON compliance.electronic_signatures(record_schema, record_table, record_id);
CREATE INDEX IF NOT EXISTS idx_esig_meaning ON compliance.electronic_signatures(signature_meaning);
CREATE INDEX IF NOT EXISTS idx_esig_valid ON compliance.electronic_signatures(is_valid) WHERE is_valid = TRUE;

COMMENT ON TABLE compliance.electronic_signatures IS
'21 CFR Part 11 compliant electronic signatures with full traceability.
DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';

-- ============================================================================
-- SECTION 4: ACCESS CONTROLS (21 CFR 11.10(d), 11.10(g))
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance.access_controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Control identification
    control_id TEXT NOT NULL UNIQUE DEFAULT 'ACL-' || substr(gen_random_uuid()::TEXT, 1, 8),
    control_name TEXT NOT NULL,
    control_description TEXT,
    
    -- Scope
    resource_type TEXT NOT NULL CHECK (resource_type IN (
        'SCHEMA', 'TABLE', 'COLUMN', 'ROW', 'FUNCTION',
        'API_ENDPOINT', 'UI_COMPONENT', 'REPORT', 'DOCUMENT'
    )),
    resource_identifier TEXT NOT NULL,
    
    -- Access matrix
    role_permissions JSONB NOT NULL DEFAULT '{}',
    -- Format: {"role_name": {"create": true, "read": true, "update": false, "delete": false, "sign": false}}
    
    -- Validation requirements
    requires_mfa BOOLEAN NOT NULL DEFAULT FALSE,
    requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
    requires_dual_control BOOLEAN NOT NULL DEFAULT FALSE,
    requires_change_reason BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Time-based controls
    access_schedule JSONB, -- {"allowed_hours": [9, 17], "allowed_days": [1,2,3,4,5]}
    
    -- Metadata
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_date TIMESTAMPTZ,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_date_range CHECK (expiration_date IS NULL OR expiration_date > effective_date)
);

CREATE INDEX IF NOT EXISTS idx_acl_resource ON compliance.access_controls(resource_type, resource_identifier);
CREATE INDEX IF NOT EXISTS idx_acl_active ON compliance.access_controls(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE compliance.access_controls IS
'Access control matrix for 21 CFR Part 11 compliance.
DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';

-- ============================================================================
-- SECTION 5: SYSTEM VALIDATION STATUS (21 CFR 11.10(a))
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance.validation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Validation identification
    validation_id TEXT NOT NULL UNIQUE DEFAULT 'VAL-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::TEXT, 1, 8),
    
    -- Component being validated
    component_type TEXT NOT NULL CHECK (component_type IN (
        'SYSTEM', 'MODULE', 'FUNCTION', 'MIGRATION',
        'INTEGRATION', 'REPORT', 'CALCULATION', 'INTERFACE'
    )),
    component_name TEXT NOT NULL,
    component_version TEXT NOT NULL,
    
    -- Validation type
    validation_type TEXT NOT NULL CHECK (validation_type IN (
        'IQ', 'OQ', 'PQ', 'REVALIDATION', 'CHANGE_CONTROL'
    )),
    
    -- Validation status
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED',
        'SUPERSEDED', 'RETIRED'
    )),
    
    -- Documentation
    protocol_id TEXT,
    protocol_version TEXT,
    test_results JSONB,
    deviations JSONB,
    
    -- Approval chain
    prepared_by UUID,
    prepared_at TIMESTAMPTZ,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    
    -- Signatures
    approval_signature_id UUID REFERENCES compliance.electronic_signatures(id),
    
    -- Validity
    effective_date TIMESTAMPTZ,
    next_review_date TIMESTAMPTZ,
    expiration_date TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_val_component ON compliance.validation_records(component_type, component_name);
CREATE INDEX IF NOT EXISTS idx_val_status ON compliance.validation_records(status);

COMMENT ON TABLE compliance.validation_records IS
'System validation records per 21 CFR Part 11 and GAMP 5.
DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';

-- ============================================================================
-- SECTION 6: CHANGE CONTROL (21 CFR 11.10(k))
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance.change_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Change identification
    change_id TEXT NOT NULL UNIQUE DEFAULT 'CHG-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::TEXT, 1, 8),
    
    -- Change classification
    change_type TEXT NOT NULL CHECK (change_type IN (
        'EMERGENCY', 'STANDARD', 'MINOR', 'CONFIGURATION'
    )),
    change_category TEXT NOT NULL CHECK (change_category IN (
        'SOFTWARE', 'HARDWARE', 'CONFIGURATION', 'PROCESS',
        'DOCUMENTATION', 'SECURITY', 'REGULATORY'
    )),
    
    -- Impact assessment
    gxp_impact BOOLEAN NOT NULL DEFAULT TRUE,
    validation_impact TEXT CHECK (validation_impact IN (
        'NONE', 'REVALIDATION_REQUIRED', 'IQ_REQUIRED', 
        'OQ_REQUIRED', 'PQ_REQUIRED', 'FULL_VALIDATION'
    )),
    risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    
    -- Change details
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    justification TEXT NOT NULL,
    affected_systems TEXT[],
    affected_documents TEXT[],
    
    -- Implementation
    implementation_plan TEXT,
    rollback_plan TEXT,
    testing_requirements TEXT,
    
    -- Workflow status
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED',
        'IMPLEMENTING', 'TESTING', 'COMPLETED', 'REJECTED', 'CANCELLED'
    )),
    
    -- Approval chain
    requested_by UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    technical_reviewer_id UUID,
    technical_review_date TIMESTAMPTZ,
    technical_review_comments TEXT,
    
    qa_reviewer_id UUID,
    qa_review_date TIMESTAMPTZ,
    qa_review_comments TEXT,
    
    approver_id UUID,
    approval_date TIMESTAMPTZ,
    approval_comments TEXT,
    
    -- Implementation tracking
    implemented_by UUID,
    implemented_at TIMESTAMPTZ,
    implementation_notes TEXT,
    
    -- Verification
    verified_by UUID,
    verified_at TIMESTAMPTZ,
    verification_results JSONB,
    
    -- Closure
    closed_by UUID,
    closed_at TIMESTAMPTZ,
    closure_summary TEXT,
    
    -- Signatures
    approval_signature_id UUID REFERENCES compliance.electronic_signatures(id),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_status ON compliance.change_control(status);
CREATE INDEX IF NOT EXISTS idx_cc_type ON compliance.change_control(change_type, change_category);
CREATE INDEX IF NOT EXISTS idx_cc_risk ON compliance.change_control(risk_level);

COMMENT ON TABLE compliance.change_control IS
'Change control records per 21 CFR Part 11 requirements.
DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';

-- ============================================================================
-- SECTION 7: DATA INTEGRITY VERIFICATION (21 CFR 11.10(c))
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance.data_integrity_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Check identification
    check_id TEXT NOT NULL UNIQUE DEFAULT 'DIC-' || to_char(NOW(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::TEXT, 1, 8),
    
    -- Scope
    check_type TEXT NOT NULL CHECK (check_type IN (
        'HASH_VERIFICATION', 'REFERENTIAL_INTEGRITY', 'AUDIT_CHAIN',
        'SIGNATURE_VALIDATION', 'TIMESTAMP_VERIFICATION', 'BACKUP_VERIFICATION'
    )),
    
    -- Target
    target_schema TEXT,
    target_table TEXT,
    target_record_id UUID,
    
    -- Results
    check_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_result TEXT NOT NULL CHECK (check_result IN ('PASS', 'FAIL', 'WARNING', 'SKIPPED')),
    
    -- Details
    expected_value TEXT,
    actual_value TEXT,
    discrepancy_details TEXT,
    
    -- Response
    requires_investigation BOOLEAN NOT NULL DEFAULT FALSE,
    investigation_id TEXT,
    corrective_action TEXT,
    
    -- Metadata
    performed_by TEXT NOT NULL DEFAULT 'SYSTEM',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dic_type ON compliance.data_integrity_checks(check_type, check_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_dic_result ON compliance.data_integrity_checks(check_result) WHERE check_result = 'FAIL';
CREATE INDEX IF NOT EXISTS idx_dic_target ON compliance.data_integrity_checks(target_schema, target_table, target_record_id);

COMMENT ON TABLE compliance.data_integrity_checks IS
'Data integrity verification records per 21 CFR Part 11.
DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';

-- ============================================================================
-- SECTION 8: AUDIT TRAIL FUNCTIONS
-- ============================================================================

-- Function to generate record hash for integrity verification
CREATE OR REPLACE FUNCTION compliance.generate_record_hash(
    p_schema TEXT,
    p_table TEXT,
    p_record JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN encode(
        sha256(
            (p_schema || '.' || p_table || '|' || p_record::TEXT)::BYTEA
        ),
        'hex'
    );
END;
$$;

-- Function to generate chain hash for audit trail integrity
CREATE OR REPLACE FUNCTION compliance.generate_chain_hash(
    p_previous_hash TEXT,
    p_record_hash TEXT,
    p_timestamp TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN encode(
        sha256(
            (COALESCE(p_previous_hash, 'GENESIS') || '|' || p_record_hash || '|' || p_timestamp::TEXT)::BYTEA
        ),
        'hex'
    );
END;
$$;

-- Function to write audit trail entry
CREATE OR REPLACE FUNCTION compliance.write_audit_entry(
    p_event_type TEXT,
    p_user_id UUID,
    p_user_email TEXT,
    p_user_full_name TEXT,
    p_user_role TEXT,
    p_organization_id UUID,
    p_record_schema TEXT DEFAULT NULL,
    p_record_table TEXT DEFAULT NULL,
    p_record_id UUID DEFAULT NULL,
    p_record_type TEXT DEFAULT NULL,
    p_previous_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_change_reason TEXT DEFAULT NULL,
    p_change_reason_code TEXT DEFAULT NULL,
    p_session_id UUID DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = compliance, pg_catalog
AS $$
DECLARE
    v_record_hash TEXT;
    v_previous_chain_hash TEXT;
    v_chain_hash TEXT;
    v_changed_fields TEXT[];
    v_audit_id UUID;
    v_event_timestamp TIMESTAMPTZ := NOW();
BEGIN
    -- Calculate record hash
    v_record_hash := compliance.generate_record_hash(
        p_record_schema,
        p_record_table,
        COALESCE(p_new_values, p_previous_values, '{}'::JSONB)
    );
    
    -- Get previous chain hash
    SELECT chain_hash INTO v_previous_chain_hash
    FROM compliance.audit_trail
    WHERE organization_id = p_organization_id
    ORDER BY event_timestamp DESC, id DESC
    LIMIT 1;
    
    -- Calculate chain hash
    v_chain_hash := compliance.generate_chain_hash(
        v_previous_chain_hash,
        v_record_hash,
        v_event_timestamp
    );
    
    -- Determine changed fields
    IF p_previous_values IS NOT NULL AND p_new_values IS NOT NULL THEN
        SELECT ARRAY_AGG(key)
        INTO v_changed_fields
        FROM (
            SELECT key FROM jsonb_each(p_previous_values)
            EXCEPT
            SELECT key FROM jsonb_each(p_new_values)
            WHERE p_previous_values->key = p_new_values->key
        ) changed;
    END IF;
    
    -- Insert audit record
    INSERT INTO compliance.audit_trail (
        event_timestamp, event_type,
        user_id, user_email, user_full_name, user_role, organization_id,
        session_id, ip_address,
        record_schema, record_table, record_id, record_type,
        previous_values, new_values, changed_fields,
        change_reason, change_reason_code,
        record_hash, previous_record_hash, chain_hash,
        metadata
    ) VALUES (
        v_event_timestamp, p_event_type,
        p_user_id, p_user_email, p_user_full_name, p_user_role, p_organization_id,
        p_session_id, p_ip_address,
        p_record_schema, p_record_table, p_record_id, p_record_type,
        p_previous_values, p_new_values, v_changed_fields,
        p_change_reason, p_change_reason_code,
        v_record_hash, v_previous_chain_hash, v_chain_hash,
        p_metadata
    )
    RETURNING id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$;

COMMENT ON FUNCTION compliance.write_audit_entry IS
'Writes a 21 CFR Part 11 compliant audit trail entry with hash chain verification.
DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';

-- ============================================================================
-- SECTION 9: ELECTRONIC SIGNATURE FUNCTIONS
-- ============================================================================

-- Function to create electronic signature
CREATE OR REPLACE FUNCTION compliance.create_electronic_signature(
    p_signer_id UUID,
    p_signer_email TEXT,
    p_signer_full_name TEXT,
    p_signer_title TEXT,
    p_organization_id UUID,
    p_signature_meaning TEXT,
    p_record_schema TEXT,
    p_record_table TEXT,
    p_record_id UUID,
    p_record_version INTEGER,
    p_authentication_method TEXT,
    p_authentication_session_id UUID,
    p_credential_hash TEXT,
    p_device_fingerprint TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = compliance, pg_catalog
AS $$
DECLARE
    v_record_hash TEXT;
    v_signature_id UUID;
    v_auth_timestamp TIMESTAMPTZ := NOW();
BEGIN
    -- Verify the record exists and get its hash
    EXECUTE format(
        'SELECT compliance.generate_record_hash($1, $2, to_jsonb(t.*)) FROM %I.%I t WHERE id = $3',
        p_record_schema, p_record_table
    )
    INTO v_record_hash
    USING p_record_schema, p_record_table, p_record_id;
    
    IF v_record_hash IS NULL THEN
        RAISE EXCEPTION 'Record not found for signature: %.%.%', p_record_schema, p_record_table, p_record_id;
    END IF;
    
    -- Create signature
    INSERT INTO compliance.electronic_signatures (
        signer_id, signer_email, signer_full_name, signer_title,
        organization_id, printed_name, signature_meaning,
        record_schema, record_table, record_id, record_version, record_hash,
        authentication_method, authentication_timestamp, authentication_session_id,
        credential_hash, device_fingerprint
    ) VALUES (
        p_signer_id, p_signer_email, p_signer_full_name, p_signer_title,
        p_organization_id, p_signer_full_name, p_signature_meaning,
        p_record_schema, p_record_table, p_record_id, p_record_version, v_record_hash,
        p_authentication_method, v_auth_timestamp, p_authentication_session_id,
        p_credential_hash, p_device_fingerprint
    )
    RETURNING id INTO v_signature_id;
    
    -- Write audit trail
    PERFORM compliance.write_audit_entry(
        'SIGNATURE',
        p_signer_id, p_signer_email, p_signer_full_name, 'SIGNER', p_organization_id,
        p_record_schema, p_record_table, p_record_id, 'ELECTRONIC_SIGNATURE',
        NULL,
        jsonb_build_object(
            'signature_id', v_signature_id,
            'signature_meaning', p_signature_meaning,
            'record_hash', v_record_hash
        ),
        'Electronic signature applied',
        'REGULATORY_UPDATE',
        p_authentication_session_id
    );
    
    RETURN v_signature_id;
END;
$$;

COMMENT ON FUNCTION compliance.create_electronic_signature IS
'Creates a 21 CFR Part 11 compliant electronic signature.
DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';

-- ============================================================================
-- SECTION 10: VERIFY AUDIT CHAIN INTEGRITY
-- ============================================================================

CREATE OR REPLACE FUNCTION compliance.verify_audit_chain(
    p_organization_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
    is_valid BOOLEAN,
    total_records BIGINT,
    verified_records BIGINT,
    broken_chain_at UUID,
    error_details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = compliance, pg_catalog
AS $$
DECLARE
    v_record RECORD;
    v_previous_hash TEXT := NULL;
    v_expected_chain_hash TEXT;
    v_total BIGINT := 0;
    v_verified BIGINT := 0;
    v_broken_at UUID := NULL;
    v_error TEXT := NULL;
BEGIN
    FOR v_record IN
        SELECT id, record_hash, chain_hash, event_timestamp, previous_record_hash
        FROM compliance.audit_trail
        WHERE organization_id = p_organization_id
          AND (p_start_date IS NULL OR event_timestamp >= p_start_date)
          AND (p_end_date IS NULL OR event_timestamp <= p_end_date)
        ORDER BY event_timestamp ASC, id ASC
    LOOP
        v_total := v_total + 1;
        
        -- Calculate expected chain hash
        v_expected_chain_hash := compliance.generate_chain_hash(
            v_previous_hash,
            v_record.record_hash,
            v_record.event_timestamp
        );
        
        -- Verify chain hash
        IF v_record.chain_hash = v_expected_chain_hash THEN
            v_verified := v_verified + 1;
        ELSE
            v_broken_at := v_record.id;
            v_error := format(
                'Chain hash mismatch at record %s. Expected: %s, Found: %s',
                v_record.id, v_expected_chain_hash, v_record.chain_hash
            );
            EXIT;
        END IF;
        
        v_previous_hash := v_record.chain_hash;
    END LOOP;
    
    RETURN QUERY SELECT
        (v_broken_at IS NULL) AS is_valid,
        v_total AS total_records,
        v_verified AS verified_records,
        v_broken_at AS broken_chain_at,
        v_error AS error_details;
END;
$$;

COMMENT ON FUNCTION compliance.verify_audit_chain IS
'Verifies the integrity of the audit trail hash chain.
DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';

-- ============================================================================
-- SECTION 11: DATA RESIDENCY CONTROLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance.data_residency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Organization
    organization_id UUID NOT NULL UNIQUE,
    
    -- Residency requirements
    primary_region TEXT NOT NULL CHECK (primary_region IN (
        'US-EAST', 'US-WEST', 'EU-WEST', 'EU-CENTRAL',
        'UK', 'CANADA', 'AUSTRALIA', 'JAPAN', 'SINGAPORE'
    )),
    allowed_regions TEXT[] NOT NULL,
    
    -- Compliance frameworks
    gdpr_applicable BOOLEAN NOT NULL DEFAULT FALSE,
    hipaa_applicable BOOLEAN NOT NULL DEFAULT FALSE,
    ccpa_applicable BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Data handling
    data_encryption_required BOOLEAN NOT NULL DEFAULT TRUE,
    cross_border_transfer_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    cross_border_mechanisms TEXT[], -- 'SCCs', 'BCRs', 'Adequacy Decision'
    
    -- Retention
    minimum_retention_years INTEGER NOT NULL DEFAULT 7,
    maximum_retention_years INTEGER,
    
    -- BAA status
    baa_executed BOOLEAN NOT NULL DEFAULT FALSE,
    baa_execution_date DATE,
    baa_document_id TEXT,
    
    -- Metadata
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE compliance.data_residency IS
'Data residency and jurisdiction controls for GDPR, HIPAA, and regional compliance.
DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';

-- ============================================================================
-- SECTION 12: ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE compliance.audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.electronic_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.access_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.validation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.change_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.data_integrity_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance.data_residency ENABLE ROW LEVEL SECURITY;

-- Audit trail: Read-only for same org, no writes through RLS
DROP POLICY IF EXISTS audit_trail_read ON compliance.audit_trail;
CREATE POLICY audit_trail_read ON compliance.audit_trail
    FOR SELECT
    USING (organization_id = current_setting('app.current_org_id', true)::UUID);

-- Electronic signatures: Read for same org
DROP POLICY IF EXISTS esig_read ON compliance.electronic_signatures;
CREATE POLICY esig_read ON compliance.electronic_signatures
    FOR SELECT
    USING (organization_id = current_setting('app.current_org_id', true)::UUID);

-- ============================================================================
-- SECTION 13: PERMISSIONS
-- ============================================================================

GRANT SELECT ON compliance.audit_trail TO app_service;
GRANT SELECT ON compliance.electronic_signatures TO app_service;
GRANT SELECT, INSERT, UPDATE ON compliance.access_controls TO app_service;
GRANT SELECT, INSERT, UPDATE ON compliance.validation_records TO app_service;
GRANT SELECT, INSERT, UPDATE ON compliance.change_control TO app_service;
GRANT SELECT, INSERT ON compliance.data_integrity_checks TO app_service;
GRANT SELECT ON compliance.data_residency TO app_service;

GRANT EXECUTE ON FUNCTION compliance.write_audit_entry TO app_service;
GRANT EXECUTE ON FUNCTION compliance.create_electronic_signature TO app_service;
GRANT EXECUTE ON FUNCTION compliance.verify_audit_chain TO app_service;
GRANT EXECUTE ON FUNCTION compliance.generate_record_hash TO app_service;

-- ============================================================================
-- COMPLETION
-- ============================================================================

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Migration 080: 21 CFR Part 11 Compliance - COMPLETE';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE';
    RAISE NOTICE '';
    RAISE NOTICE 'Components Created:';
    RAISE NOTICE '  - compliance.audit_trail (immutable, hash-chained)';
    RAISE NOTICE '  - compliance.electronic_signatures (21 CFR 11.50/11.100)';
    RAISE NOTICE '  - compliance.access_controls (21 CFR 11.10(d))';
    RAISE NOTICE '  - compliance.validation_records (IQ/OQ/PQ tracking)';
    RAISE NOTICE '  - compliance.change_control (21 CFR 11.10(k))';
    RAISE NOTICE '  - compliance.data_integrity_checks';
    RAISE NOTICE '  - compliance.data_residency (GDPR/HIPAA)';
    RAISE NOTICE '';
    RAISE NOTICE 'Functions:';
    RAISE NOTICE '  - write_audit_entry()';
    RAISE NOTICE '  - create_electronic_signature()';
    RAISE NOTICE '  - verify_audit_chain()';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '  1. Execute IQ protocol (VAL-IQ-080)';
    RAISE NOTICE '  2. Execute OQ protocol (VAL-OQ-080)';
    RAISE NOTICE '  3. Execute PQ protocol (VAL-PQ-080)';
    RAISE NOTICE '  4. Obtain QA approval signature';
    RAISE NOTICE '============================================================';
END $$;
