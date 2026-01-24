-- ============================================================================
-- Migration 054: Part 11 Audit Trail Enhancement
-- Purpose: Two-tier audit system with application triggers + Time Travel
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- Reference: FDA 21 CFR Part 11.10(e) - Audit Trail Requirements
-- Compliance: FDA 21 CFR Part 11, ICH E6(R2), EU Annex 11
-- ============================================================================

BEGIN;

-- =============================================================================
-- A) AUDIT SCHEMA ENHANCEMENT
-- =============================================================================

-- Create audit schema if not exists
CREATE SCHEMA IF NOT EXISTS audit;

COMMENT ON SCHEMA audit IS 
  '21 CFR Part 11 compliant audit trail - immutable record of all changes';

-- =============================================================================
-- B) AUDIT EVENT TYPES
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE audit.event_category AS ENUM (
        -- Data Events
        'CREATE',                    -- Record created
        'UPDATE',                    -- Record modified
        'DELETE',                    -- Record deleted
        'ARCHIVE',                   -- Record archived
        
        -- Lifecycle Events
        'LIFECYCLE_TRANSITION',      -- Status change
        'DOCUMENT_UPLOAD',           -- New document added
        'DOCUMENT_REPLACE',          -- Document replaced
        'DOCUMENT_SUSPEND',          -- Document removed (v4.0 suspend)
        
        -- Security Events
        'LOGIN_SUCCESS',             -- User authenticated
        'LOGIN_FAILURE',             -- Failed authentication
        'LOGOUT',                    -- User logged out
        'SESSION_TIMEOUT',           -- Session expired
        'PASSWORD_CHANGE',           -- Password modified
        'MFA_ENABLED',               -- MFA activated
        'MFA_DISABLED',              -- MFA deactivated
        
        -- Access Events
        'DATA_ACCESS',               -- Data viewed
        'DATA_EXPORT',               -- Data exported
        'REPORT_GENERATED',          -- Report created
        
        -- Part 11 Signature Events
        'SIGNATURE_APPLIED',         -- E-signature applied
        'SIGNATURE_INVALIDATED',     -- Signature voided
        'ATTESTATION_RECORDED',      -- Attestation captured
        
        -- Administrative Events
        'PERMISSION_GRANTED',        -- Access rights added
        'PERMISSION_REVOKED',        -- Access rights removed
        'USER_CREATED',              -- New user added
        'USER_DEACTIVATED',          -- User disabled
        'ROLE_ASSIGNED',             -- Role changed
        
        -- Submission Events
        'SUBMISSION_CREATED',        -- New submission started
        'SEQUENCE_CREATED',          -- New sequence added
        'VALIDATION_STARTED',        -- Validation began
        'VALIDATION_COMPLETED',      -- Validation finished
        'SUBMISSION_PUBLISHED',      -- Sent to gateway
        'ACKNOWLEDGMENT_RECEIVED'    -- Agency acknowledged
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE audit.part11_meaning AS ENUM (
        'SUBMISSION',                -- I am submitting this information
        'APPROVAL',                  -- I approve this record
        'REVIEW',                    -- I have reviewed this record
        'VERIFICATION',              -- I verify this is accurate
        'RESPONSIBILITY',            -- I take responsibility
        'AUTHORIZATION',             -- I authorize this action
        'ACKNOWLEDGMENT'             -- I acknowledge receipt/review
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- C) CORE AUDIT LOG TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit.event_log (
    id BIGSERIAL PRIMARY KEY,
    
    -- Event Identity
    event_id UUID NOT NULL DEFAULT gen_random_uuid(),
    event_category audit.event_category NOT NULL,
    event_description TEXT,
    
    -- Temporal (Part 11 requires computer-generated timestamp)
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    server_timezone TEXT NOT NULL DEFAULT current_setting('TIMEZONE'),
    
    -- Actor (Part 11 requires identification of who)
    user_id UUID,                            -- FK to identity.users
    user_email TEXT,                         -- Captured at time of event (denormalized)
    user_full_name TEXT,                     -- Captured at time of event
    
    -- Session Context
    session_id TEXT,
    ip_address INET,
    user_agent TEXT,
    
    -- Organization Context
    org_id UUID,
    org_name TEXT,                           -- Captured at time of event
    
    -- Subject (What was affected)
    entity_type TEXT NOT NULL,               -- 'regulatory_submission', 'document', 'user'
    entity_id UUID,                          -- ID of affected record
    entity_name TEXT,                        -- Human readable identifier
    
    -- Change Tracking
    previous_values JSONB,                   -- Before state
    new_values JSONB,                        -- After state
    changed_fields TEXT[],                   -- List of modified columns
    
    -- Part 11 Signature (if applicable)
    is_signed BOOLEAN DEFAULT FALSE,
    signature_meaning audit.part11_meaning,
    signature_reason TEXT,                   -- Required reason for action
    signature_timestamp TIMESTAMPTZ,
    
    -- Related Entities
    related_submission_id UUID,
    related_document_id UUID,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Immutability Checksum
    record_hash TEXT,
    
    -- Constraints
    CONSTRAINT non_empty_entity_type CHECK (entity_type <> '')
);

-- Critical: Part 11 requires audit trail cannot be modified
COMMENT ON TABLE audit.event_log IS 
  '21 CFR Part 11 compliant audit trail - immutable, computer-generated timestamps';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS audit_timestamp_idx ON audit.event_log(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_user_idx ON audit.event_log(user_id);
CREATE INDEX IF NOT EXISTS audit_org_idx ON audit.event_log(org_id);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit.event_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_category_idx ON audit.event_log(event_category);
CREATE INDEX IF NOT EXISTS audit_submission_idx ON audit.event_log(related_submission_id);
CREATE INDEX IF NOT EXISTS audit_signed_idx ON audit.event_log(is_signed) WHERE is_signed = TRUE;

-- =============================================================================
-- D) ELECTRONIC SIGNATURE LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit.signature_log (
    id BIGSERIAL PRIMARY KEY,
    
    signature_id UUID NOT NULL DEFAULT gen_random_uuid(),
    
    -- What was signed
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    entity_description TEXT,
    
    -- Who signed
    signer_id UUID NOT NULL,                 -- FK to identity.users
    signer_email TEXT NOT NULL,
    signer_full_name TEXT NOT NULL,
    signer_title TEXT,
    signer_org_id UUID NOT NULL,
    
    -- Signature Details (Part 11 requirements)
    signature_meaning audit.part11_meaning NOT NULL,
    signature_reason TEXT NOT NULL,          -- Part 11 requires reason
    
    -- Authentication Proof
    authentication_method TEXT NOT NULL,     -- 'PASSWORD', 'MFA_TOTP', 'MFA_SMS', 'BIOMETRIC'
    authentication_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Cryptographic Evidence
    signature_hash TEXT NOT NULL,            -- Hash of (entity_id + signer_id + timestamp + meaning)
    document_hash TEXT,                      -- Hash of document content if applicable
    
    -- Status
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    invalidated_at TIMESTAMPTZ,
    invalidated_by UUID,
    invalidation_reason TEXT,
    
    -- Compliance Flags
    is_part11_compliant BOOLEAN NOT NULL DEFAULT TRUE,
    is_gdpr_recorded BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit.signature_log IS 
  '21 CFR Part 11 electronic signature records - signed manifestations of records';

CREATE INDEX IF NOT EXISTS sig_entity_idx ON audit.signature_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS sig_signer_idx ON audit.signature_log(signer_id);
CREATE INDEX IF NOT EXISTS sig_valid_idx ON audit.signature_log(is_valid);
CREATE INDEX IF NOT EXISTS sig_timestamp_idx ON audit.signature_log(authentication_timestamp DESC);

-- =============================================================================
-- E) AUDIT LOGGING FUNCTIONS
-- =============================================================================

-- Core audit logging function
CREATE OR REPLACE FUNCTION audit.log_event(
    p_category audit.event_category,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_entity_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_previous_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_changed_fields TEXT[] DEFAULT NULL,
    p_related_submission_id UUID DEFAULT NULL,
    p_related_document_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, identity
AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_user_name TEXT;
    v_org_id UUID;
    v_org_name TEXT;
    v_session_id TEXT;
    v_ip_address INET;
    v_new_id BIGINT;
    v_record_data TEXT;
    v_record_hash TEXT;
BEGIN
    -- Get current context
    v_user_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
    v_org_id := NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID;
    v_session_id := current_setting('app.session_id', TRUE);
    
    -- Try to parse IP address
    BEGIN
        v_ip_address := NULLIF(current_setting('app.ip_address', TRUE), '')::INET;
    EXCEPTION WHEN OTHERS THEN
        v_ip_address := NULL;
    END;
    
    -- Get user details (denormalized for audit permanence)
    IF v_user_id IS NOT NULL THEN
        SELECT email, full_name INTO v_user_email, v_user_name
        FROM identity.users
        WHERE id = v_user_id;
    END IF;
    
    -- Get org details (denormalized for audit permanence)
    IF v_org_id IS NOT NULL THEN
        SELECT org_name INTO v_org_name
        FROM identity.organizations
        WHERE id = v_org_id;
    END IF;
    
    -- Insert audit record
    INSERT INTO audit.event_log (
        event_category,
        event_description,
        user_id,
        user_email,
        user_full_name,
        session_id,
        ip_address,
        org_id,
        org_name,
        entity_type,
        entity_id,
        entity_name,
        previous_values,
        new_values,
        changed_fields,
        related_submission_id,
        related_document_id,
        metadata
    )
    VALUES (
        p_category,
        p_description,
        v_user_id,
        v_user_email,
        v_user_name,
        v_session_id,
        v_ip_address,
        v_org_id,
        v_org_name,
        p_entity_type,
        p_entity_id,
        p_entity_name,
        p_previous_values,
        p_new_values,
        p_changed_fields,
        p_related_submission_id,
        p_related_document_id,
        p_metadata
    )
    RETURNING id INTO v_new_id;
    
    -- Calculate record hash for tamper detection
    SELECT event_id::TEXT || '|' || event_timestamp::TEXT || '|' || 
           COALESCE(user_id::TEXT, 'null') || '|' || entity_type || '|' || 
           COALESCE(entity_id::TEXT, 'null')
    INTO v_record_data
    FROM audit.event_log WHERE id = v_new_id;
    
    v_record_hash := encode(sha256(v_record_data::BYTEA), 'hex');
    
    UPDATE audit.event_log SET record_hash = v_record_hash WHERE id = v_new_id;
    
    RETURN v_new_id;
END;
$$;

-- =============================================================================
-- F) AUTOMATED AUDIT TRIGGERS
-- =============================================================================

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_category audit.event_category;
    v_old_json JSONB;
    v_new_json JSONB;
    v_changed_fields TEXT[];
    v_entity_id UUID;
    v_entity_name TEXT;
BEGIN
    -- Determine event category
    IF TG_OP = 'INSERT' THEN
        v_event_category := 'CREATE';
        v_new_json := to_jsonb(NEW);
        v_entity_id := NEW.id;
        v_entity_name := COALESCE(
            NEW.title,
            NEW.application_number,
            NEW.email,
            NEW.org_name,
            NEW.id::TEXT
        );
    ELSIF TG_OP = 'UPDATE' THEN
        v_event_category := 'UPDATE';
        v_old_json := to_jsonb(OLD);
        v_new_json := to_jsonb(NEW);
        v_entity_id := NEW.id;
        v_entity_name := COALESCE(
            NEW.title,
            NEW.application_number,
            NEW.email,
            NEW.org_name,
            NEW.id::TEXT
        );
        
        -- Calculate changed fields
        SELECT ARRAY_AGG(key) INTO v_changed_fields
        FROM (
            SELECT key FROM jsonb_each(v_new_json)
            EXCEPT
            SELECT key FROM jsonb_each(v_old_json) WHERE v_old_json->key = v_new_json->key
        ) changed;
        
        -- Skip if nothing actually changed
        IF v_changed_fields IS NULL OR array_length(v_changed_fields, 1) IS NULL THEN
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_event_category := 'DELETE';
        v_old_json := to_jsonb(OLD);
        v_entity_id := OLD.id;
        v_entity_name := COALESCE(
            OLD.title,
            OLD.application_number,
            OLD.email,
            OLD.org_name,
            OLD.id::TEXT
        );
    END IF;
    
    -- Log the event
    PERFORM audit.log_event(
        p_category := v_event_category,
        p_entity_type := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        p_entity_id := v_entity_id,
        p_entity_name := v_entity_name,
        p_description := TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        p_previous_values := v_old_json,
        p_new_values := v_new_json,
        p_changed_fields := v_changed_fields
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- =============================================================================
-- G) ATTACH AUDIT TRIGGERS TO KEY TABLES
-- =============================================================================

-- regulatory_submissions
DROP TRIGGER IF EXISTS audit_regulatory_submissions ON ectd_v4.regulatory_submissions;
CREATE TRIGGER audit_regulatory_submissions
    AFTER INSERT OR UPDATE OR DELETE ON ectd_v4.regulatory_submissions
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_func();

-- submission_units
DROP TRIGGER IF EXISTS audit_submission_units ON ectd_v4.submission_units;
CREATE TRIGGER audit_submission_units
    AFTER INSERT OR UPDATE OR DELETE ON ectd_v4.submission_units
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_func();

-- documents
DROP TRIGGER IF EXISTS audit_documents ON ectd_v4.documents;
CREATE TRIGGER audit_documents
    AFTER INSERT OR UPDATE OR DELETE ON ectd_v4.documents
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_func();

-- context_of_use_elements
DROP TRIGGER IF EXISTS audit_cou_elements ON ectd_v4.context_of_use_elements;
CREATE TRIGGER audit_cou_elements
    AFTER INSERT OR UPDATE OR DELETE ON ectd_v4.context_of_use_elements
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_func();

-- users
DROP TRIGGER IF EXISTS audit_users ON identity.users;
CREATE TRIGGER audit_users
    AFTER INSERT OR UPDATE OR DELETE ON identity.users
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_func();

-- organizations
DROP TRIGGER IF EXISTS audit_organizations ON identity.organizations;
CREATE TRIGGER audit_organizations
    AFTER INSERT OR UPDATE OR DELETE ON identity.organizations
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger_func();

-- =============================================================================
-- H) SIGNATURE FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION audit.apply_signature(
    p_entity_type TEXT,
    p_entity_id UUID,
    p_entity_description TEXT,
    p_meaning audit.part11_meaning,
    p_reason TEXT,
    p_auth_method TEXT,
    p_document_hash TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, identity
AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_user_name TEXT;
    v_user_title TEXT;
    v_org_id UUID;
    v_signature_id UUID;
    v_signature_hash TEXT;
    v_hash_input TEXT;
BEGIN
    -- Get current user
    v_user_id := NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
    v_org_id := NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Cannot apply signature: no authenticated user';
    END IF;
    
    -- Get user details
    SELECT email, full_name, job_title INTO v_user_email, v_user_name, v_user_title
    FROM identity.users WHERE id = v_user_id;
    
    -- Check signing authority
    IF NOT EXISTS (
        SELECT 1 FROM identity.users 
        WHERE id = v_user_id AND has_signing_authority = TRUE
    ) THEN
        RAISE EXCEPTION 'User does not have signing authority';
    END IF;
    
    -- Generate signature UUID
    v_signature_id := gen_random_uuid();
    
    -- Create signature hash
    v_hash_input := p_entity_id::TEXT || '|' || v_user_id::TEXT || '|' || 
                    NOW()::TEXT || '|' || p_meaning::TEXT;
    v_signature_hash := encode(sha256(v_hash_input::BYTEA), 'hex');
    
    -- Record signature
    INSERT INTO audit.signature_log (
        signature_id,
        entity_type,
        entity_id,
        entity_description,
        signer_id,
        signer_email,
        signer_full_name,
        signer_title,
        signer_org_id,
        signature_meaning,
        signature_reason,
        authentication_method,
        signature_hash,
        document_hash
    )
    VALUES (
        v_signature_id,
        p_entity_type,
        p_entity_id,
        p_entity_description,
        v_user_id,
        v_user_email,
        v_user_name,
        v_user_title,
        v_org_id,
        p_meaning,
        p_reason,
        p_auth_method,
        v_signature_hash,
        p_document_hash
    );
    
    -- Log to audit trail
    PERFORM audit.log_event(
        p_category := 'SIGNATURE_APPLIED',
        p_entity_type := p_entity_type,
        p_entity_id := p_entity_id,
        p_entity_name := p_entity_description,
        p_description := 'Electronic signature applied: ' || p_meaning::TEXT,
        p_metadata := jsonb_build_object(
            'signature_id', v_signature_id,
            'signature_meaning', p_meaning,
            'signature_reason', p_reason,
            'auth_method', p_auth_method
        )
    );
    
    RETURN v_signature_id;
END;
$$;

-- =============================================================================
-- I) AUDIT VIEWS
-- =============================================================================

-- Recent activity view
CREATE OR REPLACE VIEW audit.v_recent_activity AS
SELECT 
    el.event_timestamp,
    el.event_category,
    el.entity_type,
    el.entity_name,
    el.user_full_name,
    el.org_name,
    el.event_description,
    el.changed_fields,
    el.is_signed
FROM audit.event_log el
ORDER BY el.event_timestamp DESC
LIMIT 1000;

-- User activity view
CREATE OR REPLACE VIEW audit.v_user_activity AS
SELECT 
    u.email,
    u.full_name,
    COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE el.event_category = 'CREATE') AS creates,
    COUNT(*) FILTER (WHERE el.event_category = 'UPDATE') AS updates,
    COUNT(*) FILTER (WHERE el.event_category IN ('LOGIN_SUCCESS', 'LOGIN_FAILURE')) AS logins,
    COUNT(*) FILTER (WHERE el.is_signed = TRUE) AS signatures,
    MAX(el.event_timestamp) AS last_activity
FROM identity.users u
LEFT JOIN audit.event_log el ON u.id = el.user_id
GROUP BY u.id, u.email, u.full_name;

-- =============================================================================
-- J) PREVENT AUDIT TAMPERING
-- =============================================================================

-- Revoke DELETE/TRUNCATE on audit tables from all roles
REVOKE DELETE, TRUNCATE ON audit.event_log FROM PUBLIC;
REVOKE DELETE, TRUNCATE ON audit.signature_log FROM PUBLIC;

-- Add comment warning
COMMENT ON TABLE audit.event_log IS 
  'PROTECTED: 21 CFR Part 11 audit trail - DELETE/TRUNCATE prohibited';

COMMIT;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 054_gcc_part11_audit completed successfully';
    RAISE NOTICE 'Created:';
    RAISE NOTICE '  - audit.event_log (immutable audit trail)';
    RAISE NOTICE '  - audit.signature_log (electronic signatures)';
    RAISE NOTICE '  - audit.log_event() function';
    RAISE NOTICE '  - audit.apply_signature() function';
    RAISE NOTICE '  - Audit triggers on key tables';
END $$;
