-- Migration: 041_gcc_signing_gates.sql
-- Purpose: Signing Gates - 21 CFR Part 11 compliant e-signature workflow
-- Part of Phase 2 - 038+ Migrations

BEGIN;

-- =============================================================================
-- SIGNING SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS signing;

-- =============================================================================
-- SIGNATURE TYPES AND REASONS
-- =============================================================================

CREATE TYPE signing.signature_meaning AS ENUM (
    'AUTHOR',           -- I am the author of this document
    'REVIEW',           -- I have reviewed this document
    'APPROVAL',         -- I approve this document
    'VERIFICATION',     -- I verify the accuracy of this data
    'RESPONSIBILITY',   -- I accept responsibility for this content
    'REJECTION',        -- I reject this document
    'ACKNOWLEDGMENT'    -- I acknowledge receipt/awareness
);

CREATE TYPE signing.signature_status AS ENUM (
    'PENDING',          -- Signature requested but not yet signed
    'SIGNED',           -- Successfully signed
    'DECLINED',         -- Signer declined to sign
    'EXPIRED',          -- Signature request expired
    'REVOKED',          -- Signature was revoked
    'SUPERSEDED'        -- Document was superseded before signing
);

-- =============================================================================
-- SIGNING WORKFLOW DEFINITIONS
-- =============================================================================

CREATE TABLE signing.workflow_definitions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Workflow identification
    workflow_code       TEXT NOT NULL UNIQUE,
    workflow_name       TEXT NOT NULL,
    description         TEXT,
    
    -- Applicability
    document_types      TEXT[],                     -- e.g., ['CER', 'CSR', 'PROTOCOL']
    regulatory_context  TEXT[],                     -- e.g., ['FDA', 'EMA', 'GxP']
    
    -- Workflow structure (JSONB for flexibility)
    steps               JSONB NOT NULL,             -- Array of signing steps
    /*
    Example steps structure:
    [
        {
            "step_order": 1,
            "step_name": "Author Sign-off",
            "signature_meaning": "AUTHOR",
            "required_roles": ["AUTHOR"],
            "parallel": false,
            "timeout_hours": 72
        },
        {
            "step_order": 2,
            "step_name": "QA Review",
            "signature_meaning": "REVIEW",
            "required_roles": ["QA_REVIEWER"],
            "parallel": false,
            "timeout_hours": 48
        }
    ]
    */
    
    -- Settings
    require_all_signatures BOOLEAN DEFAULT TRUE,
    allow_delegation    BOOLEAN DEFAULT FALSE,
    expiry_hours        INTEGER DEFAULT 168,        -- 7 days default
    
    -- Status
    is_active           BOOLEAN DEFAULT TRUE,
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_defs_code ON signing.workflow_definitions(workflow_code);
CREATE INDEX idx_workflow_defs_active ON signing.workflow_definitions(is_active);

COMMENT ON TABLE signing.workflow_definitions IS 
'Signing workflow templates defining multi-step signature requirements.';

-- Insert standard workflows
INSERT INTO signing.workflow_definitions (workflow_code, workflow_name, description, document_types, regulatory_context, steps)
VALUES 
(
    'WF_CER_APPROVAL',
    'CER Review and Approval',
    'Standard workflow for Clinical Evaluation Report approval',
    ARRAY['CER'],
    ARRAY['FDA', 'EMA', 'GxP'],
    '[
        {"step_order": 1, "step_name": "Author Sign-off", "signature_meaning": "AUTHOR", "required_roles": ["AUTHOR"], "parallel": false, "timeout_hours": 72},
        {"step_order": 2, "step_name": "Medical Review", "signature_meaning": "REVIEW", "required_roles": ["MEDICAL_WRITER", "MEDICAL_REVIEWER"], "parallel": false, "timeout_hours": 48},
        {"step_order": 3, "step_name": "QA Review", "signature_meaning": "REVIEW", "required_roles": ["QA_REVIEWER"], "parallel": false, "timeout_hours": 48},
        {"step_order": 4, "step_name": "Final Approval", "signature_meaning": "APPROVAL", "required_roles": ["REGULATORY_AFFAIRS", "SPONSOR_SIGNATORY"], "parallel": false, "timeout_hours": 72}
    ]'::jsonb
),
(
    'WF_CSR_APPROVAL',
    'CSR Review and Approval',
    'Clinical Study Report multi-step approval workflow',
    ARRAY['CSR'],
    ARRAY['FDA', 'EMA', 'PMDA', 'GxP'],
    '[
        {"step_order": 1, "step_name": "Statistical Analysis Sign-off", "signature_meaning": "AUTHOR", "required_roles": ["STATISTICIAN"], "parallel": false, "timeout_hours": 72},
        {"step_order": 2, "step_name": "Medical Writing Sign-off", "signature_meaning": "AUTHOR", "required_roles": ["MEDICAL_WRITER"], "parallel": false, "timeout_hours": 72},
        {"step_order": 3, "step_name": "Clinical Review", "signature_meaning": "REVIEW", "required_roles": ["CLINICAL_REVIEWER"], "parallel": false, "timeout_hours": 48},
        {"step_order": 4, "step_name": "QC Review", "signature_meaning": "VERIFICATION", "required_roles": ["QC_REVIEWER"], "parallel": false, "timeout_hours": 24},
        {"step_order": 5, "step_name": "Principal Investigator Approval", "signature_meaning": "APPROVAL", "required_roles": ["PRINCIPAL_INVESTIGATOR"], "parallel": false, "timeout_hours": 72},
        {"step_order": 6, "step_name": "Sponsor Approval", "signature_meaning": "APPROVAL", "required_roles": ["SPONSOR_SIGNATORY"], "parallel": false, "timeout_hours": 72}
    ]'::jsonb
),
(
    'WF_PROTOCOL_APPROVAL',
    'Protocol Approval',
    'Study protocol approval workflow',
    ARRAY['PROTOCOL', 'PROTOCOL_AMENDMENT'],
    ARRAY['FDA', 'EMA', 'GxP'],
    '[
        {"step_order": 1, "step_name": "Author Sign-off", "signature_meaning": "AUTHOR", "required_roles": ["AUTHOR"], "parallel": false, "timeout_hours": 72},
        {"step_order": 2, "step_name": "Medical Monitor Review", "signature_meaning": "REVIEW", "required_roles": ["MEDICAL_MONITOR"], "parallel": false, "timeout_hours": 48},
        {"step_order": 3, "step_name": "Sponsor Approval", "signature_meaning": "APPROVAL", "required_roles": ["SPONSOR_SIGNATORY"], "parallel": false, "timeout_hours": 72}
    ]'::jsonb
),
(
    'WF_ECTD_SUBMISSION',
    'eCTD Submission Package',
    'eCTD submission package final approval',
    ARRAY['ECTD_PACKAGE'],
    ARRAY['FDA', 'EMA', 'PMDA'],
    '[
        {"step_order": 1, "step_name": "Publishing QC", "signature_meaning": "VERIFICATION", "required_roles": ["ECTD_PUBLISHER", "QC_REVIEWER"], "parallel": false, "timeout_hours": 24},
        {"step_order": 2, "step_name": "Regulatory Affairs Approval", "signature_meaning": "APPROVAL", "required_roles": ["REGULATORY_AFFAIRS"], "parallel": false, "timeout_hours": 48},
        {"step_order": 3, "step_name": "Sponsor Authorization", "signature_meaning": "APPROVAL", "required_roles": ["SPONSOR_SIGNATORY", "AUTHORIZED_REPRESENTATIVE"], "parallel": false, "timeout_hours": 72}
    ]'::jsonb
);

-- =============================================================================
-- SIGNING REQUESTS (Individual document signing instances)
-- =============================================================================

CREATE TYPE signing.request_status AS ENUM (
    'DRAFT',            -- Not yet initiated
    'IN_PROGRESS',      -- Actively collecting signatures
    'COMPLETED',        -- All signatures collected
    'CANCELLED',        -- Cancelled before completion
    'EXPIRED'           -- Timed out
);

CREATE TABLE signing.signing_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id          UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
    
    -- Workflow reference
    workflow_id         UUID NOT NULL REFERENCES signing.workflow_definitions(id),
    
    -- Document reference
    document_type       TEXT NOT NULL,
    document_id         UUID NOT NULL,              -- Reference to source document
    document_version    TEXT,
    document_title      TEXT NOT NULL,
    document_hash       TEXT,                       -- SHA256 of document content
    
    -- Status
    status              signing.request_status NOT NULL DEFAULT 'DRAFT',
    current_step        INTEGER DEFAULT 1,
    total_steps         INTEGER NOT NULL,
    
    -- Timing
    initiated_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signing_requests_program ON signing.signing_requests(program_id);
CREATE INDEX idx_signing_requests_status ON signing.signing_requests(status);
CREATE INDEX idx_signing_requests_document ON signing.signing_requests(document_type, document_id);
CREATE INDEX idx_signing_requests_workflow ON signing.signing_requests(workflow_id);

COMMENT ON TABLE signing.signing_requests IS 
'Individual signing request instances linking documents to signing workflows.';

-- =============================================================================
-- SIGNATURES (Individual signature records - 21 CFR Part 11 compliant)
-- =============================================================================

CREATE TABLE signing.signatures (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id          UUID NOT NULL REFERENCES signing.signing_requests(id) ON DELETE RESTRICT,
    
    -- Signature step
    step_order          INTEGER NOT NULL,
    step_name           TEXT NOT NULL,
    
    -- Signer info (captured at sign time for audit)
    signer_id           UUID NOT NULL,
    signer_name         TEXT NOT NULL,              -- Full name at time of signing
    signer_email        TEXT NOT NULL,
    signer_role         TEXT NOT NULL,
    signer_title        TEXT,
    signer_organization TEXT,
    
    -- Signature details
    signature_meaning   signing.signature_meaning NOT NULL,
    status              signing.signature_status NOT NULL DEFAULT 'PENDING',
    
    -- 21 CFR Part 11 requirements
    signature_reason    TEXT NOT NULL,              -- Explicit reason for signing
    document_hash       TEXT NOT NULL,              -- Hash of document at sign time
    
    -- Timestamps
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    signed_at           TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    
    -- Authentication (for audit trail)
    auth_method         TEXT,                       -- e.g., 'PASSWORD', 'SSO', 'MFA'
    ip_address          INET,
    user_agent          TEXT,
    
    -- Comments
    signer_comments     TEXT,
    decline_reason      TEXT,
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signatures_request ON signing.signatures(request_id);
CREATE INDEX idx_signatures_signer ON signing.signatures(signer_id);
CREATE INDEX idx_signatures_status ON signing.signatures(status);
CREATE INDEX idx_signatures_meaning ON signing.signatures(signature_meaning);

COMMENT ON TABLE signing.signatures IS 
'21 CFR Part 11 compliant electronic signatures with full audit trail.';

-- =============================================================================
-- SIGNATURE MANIFEST (Immutable record of completed signing)
-- =============================================================================

CREATE TABLE signing.signature_manifests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id          UUID NOT NULL REFERENCES signing.signing_requests(id) ON DELETE RESTRICT,
    
    -- Document info (frozen at manifest creation)
    document_type       TEXT NOT NULL,
    document_id         UUID NOT NULL,
    document_version    TEXT NOT NULL,
    document_title      TEXT NOT NULL,
    document_hash       TEXT NOT NULL,
    
    -- Manifest content
    manifest_hash       TEXT NOT NULL,              -- Hash of entire manifest
    manifest_data       JSONB NOT NULL,             -- Full manifest including all signatures
    
    -- Timing
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Make immutable
    UNIQUE(request_id)
);

CREATE INDEX idx_signature_manifests_document ON signing.signature_manifests(document_type, document_id);

COMMENT ON TABLE signing.signature_manifests IS 
'Immutable signature manifests created upon workflow completion.';

-- Prevent modification of signature manifests
CREATE OR REPLACE FUNCTION signing.prevent_manifest_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Signature manifests are immutable and cannot be modified or deleted';
END;
$$;

CREATE TRIGGER trg_immutable_signature_manifests
    BEFORE UPDATE OR DELETE ON signing.signature_manifests
    FOR EACH ROW
    EXECUTE FUNCTION signing.prevent_manifest_modification();

-- =============================================================================
-- SIGNING FUNCTIONS
-- =============================================================================

-- Sign a document
CREATE OR REPLACE FUNCTION signing.sign_document(
    p_signature_id UUID,
    p_signer_id UUID,
    p_auth_method TEXT,
    p_signature_reason TEXT,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_comments TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_signature RECORD;
    v_request RECORD;
    v_step_count INTEGER;
BEGIN
    -- Get signature record
    SELECT * INTO v_signature FROM signing.signatures WHERE id = p_signature_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Signature not found';
    END IF;
    
    IF v_signature.status != 'PENDING' THEN
        RAISE EXCEPTION 'Signature is not in PENDING status';
    END IF;
    
    IF v_signature.signer_id != p_signer_id THEN
        RAISE EXCEPTION 'Signer ID does not match';
    END IF;
    
    -- Check expiry
    IF v_signature.expires_at IS NOT NULL AND v_signature.expires_at < now() THEN
        UPDATE signing.signatures SET status = 'EXPIRED' WHERE id = p_signature_id;
        RAISE EXCEPTION 'Signature request has expired';
    END IF;
    
    -- Update signature record
    UPDATE signing.signatures
    SET 
        status = 'SIGNED',
        signature_reason = p_signature_reason,
        signed_at = now(),
        auth_method = p_auth_method,
        ip_address = p_ip_address,
        user_agent = p_user_agent,
        signer_comments = p_comments
    WHERE id = p_signature_id;
    
    -- Check if all signatures for current step are complete
    SELECT * INTO v_request FROM signing.signing_requests WHERE id = v_signature.request_id;
    
    SELECT COUNT(*) INTO v_step_count
    FROM signing.signatures
    WHERE request_id = v_request.id
      AND step_order = v_request.current_step
      AND status = 'PENDING';
    
    -- If all signatures for step are complete, advance to next step
    IF v_step_count = 0 THEN
        IF v_request.current_step >= v_request.total_steps THEN
            -- Workflow complete
            UPDATE signing.signing_requests
            SET 
                status = 'COMPLETED',
                completed_at = now(),
                updated_at = now()
            WHERE id = v_request.id;
            
            -- Create signature manifest
            PERFORM signing.create_signature_manifest(v_request.id);
        ELSE
            -- Advance to next step
            UPDATE signing.signing_requests
            SET 
                current_step = current_step + 1,
                updated_at = now()
            WHERE id = v_request.id;
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$;

-- Decline to sign
CREATE OR REPLACE FUNCTION signing.decline_signature(
    p_signature_id UUID,
    p_signer_id UUID,
    p_decline_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE signing.signatures
    SET 
        status = 'DECLINED',
        decline_reason = p_decline_reason,
        signed_at = now()
    WHERE id = p_signature_id
      AND signer_id = p_signer_id
      AND status = 'PENDING';
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$;

-- Create signature manifest
CREATE OR REPLACE FUNCTION signing.create_signature_manifest(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_request RECORD;
    v_manifest_data JSONB;
    v_manifest_hash TEXT;
    v_manifest_id UUID;
BEGIN
    SELECT * INTO v_request FROM signing.signing_requests WHERE id = p_request_id;
    
    IF NOT FOUND OR v_request.status != 'COMPLETED' THEN
        RAISE EXCEPTION 'Request not found or not completed';
    END IF;
    
    -- Build manifest data
    v_manifest_data := jsonb_build_object(
        'request_id', p_request_id,
        'document_type', v_request.document_type,
        'document_id', v_request.document_id,
        'document_version', v_request.document_version,
        'document_title', v_request.document_title,
        'document_hash', v_request.document_hash,
        'completed_at', v_request.completed_at,
        'signatures', (
            SELECT jsonb_agg(jsonb_build_object(
                'step_order', s.step_order,
                'step_name', s.step_name,
                'signer_name', s.signer_name,
                'signer_email', s.signer_email,
                'signer_role', s.signer_role,
                'signature_meaning', s.signature_meaning,
                'signature_reason', s.signature_reason,
                'signed_at', s.signed_at,
                'auth_method', s.auth_method
            ) ORDER BY s.step_order)
            FROM signing.signatures s
            WHERE s.request_id = p_request_id
              AND s.status = 'SIGNED'
        )
    );
    
    -- Calculate manifest hash
    v_manifest_hash := encode(sha256(v_manifest_data::TEXT::BYTEA), 'hex');
    
    -- Insert manifest
    INSERT INTO signing.signature_manifests (
        request_id,
        document_type,
        document_id,
        document_version,
        document_title,
        document_hash,
        manifest_hash,
        manifest_data
    ) VALUES (
        p_request_id,
        v_request.document_type,
        v_request.document_id,
        v_request.document_version,
        v_request.document_title,
        v_request.document_hash,
        v_manifest_hash,
        v_manifest_data
    )
    RETURNING id INTO v_manifest_id;
    
    RETURN v_manifest_id;
END;
$$;

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Pending Signatures Dashboard
CREATE OR REPLACE VIEW signing.v_pending_signatures AS
SELECT 
    s.id AS signature_id,
    sr.id AS request_id,
    sr.program_id,
    p.code AS program_code,
    sr.document_type,
    sr.document_title,
    s.step_order,
    s.step_name,
    s.signature_meaning,
    s.signer_id,
    s.signer_name,
    s.signer_email,
    s.requested_at,
    s.expires_at,
    EXTRACT(EPOCH FROM (s.expires_at - now())) / 3600 AS hours_remaining
FROM signing.signatures s
JOIN signing.signing_requests sr ON sr.id = s.request_id
JOIN core.programs p ON p.id = sr.program_id
WHERE s.status = 'PENDING'
  AND (s.expires_at IS NULL OR s.expires_at > now())
ORDER BY s.requested_at ASC;

COMMENT ON VIEW signing.v_pending_signatures IS 
'Dashboard of pending signature requests with time remaining.';

-- Signing Request Progress
CREATE OR REPLACE VIEW signing.v_request_progress AS
SELECT 
    sr.id AS request_id,
    sr.program_id,
    p.code AS program_code,
    sr.document_type,
    sr.document_title,
    sr.status,
    sr.current_step,
    sr.total_steps,
    ROUND(sr.current_step::NUMERIC / sr.total_steps * 100, 0) AS progress_pct,
    COUNT(*) FILTER (WHERE s.status = 'SIGNED') AS signatures_complete,
    COUNT(*) FILTER (WHERE s.status = 'PENDING') AS signatures_pending,
    sr.initiated_at,
    sr.expires_at,
    sr.completed_at
FROM signing.signing_requests sr
JOIN core.programs p ON p.id = sr.program_id
LEFT JOIN signing.signatures s ON s.request_id = sr.id
GROUP BY sr.id, p.code
ORDER BY sr.status, sr.initiated_at DESC;

COMMENT ON VIEW signing.v_request_progress IS 
'Signing request progress with completion statistics.';

-- Signature Audit Trail
CREATE OR REPLACE VIEW signing.v_signature_audit_trail AS
SELECT 
    s.id AS signature_id,
    sr.document_type,
    sr.document_id,
    sr.document_title,
    s.step_order,
    s.step_name,
    s.signature_meaning,
    s.status,
    s.signer_name,
    s.signer_email,
    s.signer_role,
    s.signer_organization,
    s.signature_reason,
    s.auth_method,
    s.ip_address,
    s.requested_at,
    s.signed_at,
    s.signer_comments,
    s.decline_reason,
    sr.document_hash
FROM signing.signatures s
JOIN signing.signing_requests sr ON sr.id = s.request_id
ORDER BY sr.document_id, s.step_order, s.signed_at;

COMMENT ON VIEW signing.v_signature_audit_trail IS 
'Complete audit trail of all signatures for 21 CFR Part 11 compliance.';

COMMIT;
