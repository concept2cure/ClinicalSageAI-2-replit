-- ============================================================================
-- Migration 051: Multi-Tenant Identity Core
-- Purpose: Organizations, users, and Sponsor/CRO relationships
--          Solves the "many-to-many" identity management problem
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- Reference: Concept2Cure Architecture Specification v1.0
-- Compliance: FDA 21 CFR Part 11, GDPR, SOC2
-- ============================================================================

BEGIN;

-- Create identity schema
CREATE SCHEMA IF NOT EXISTS identity;

COMMENT ON SCHEMA identity IS 
  'Multi-tenant identity management - organizations, users, and access delegation';

-- =============================================================================
-- A) ORGANIZATION TYPES
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE identity.org_business_model AS ENUM (
        'BIO_PHARMA_SPONSOR',      -- Data owner (Pfizer, Novartis, etc.)
        'CRO_PARTNER',              -- Contract research organization
        'REGULATORY_CONSULTANCY',   -- Regulatory affairs consulting
        'CMO_CDMO',                  -- Contract manufacturing
        'ACADEMIC_INSTITUTION',     -- Universities, research hospitals
        'GOVERNMENT_AGENCY',        -- FDA, NIH, etc. (read-only access)
        'DEVICE_MANUFACTURER',      -- Medical device companies
        'DIAGNOSTIC_COMPANY'        -- IVD/diagnostic companies
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE identity.access_level AS ENUM (
        'READ_ONLY',               -- View documents only
        'READ_WRITE',              -- Create and edit
        'ADMIN',                   -- Full control including user management
        'AUDITOR'                  -- Read-only with audit log access
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE identity.user_role AS ENUM (
        'QA',                      -- Quality Assurance
        'RA',                      -- Regulatory Affairs
        'CLINICAL',                -- Clinical Operations
        'MEDICAL',                 -- Medical Affairs / Safety
        'STATS',                   -- Biostatistics
        'CMC',                     -- Chemistry, Manufacturing, Controls
        'SAFETY',                  -- Pharmacovigilance
        'LEGAL',                   -- Legal / IP
        'EXECUTIVE',               -- C-suite / Executive
        'IT_ADMIN',                -- IT Administration
        'EXTERNAL_AUDITOR'         -- External audit access
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- B) ORGANIZATIONS (Tenants)
-- =============================================================================

CREATE TABLE IF NOT EXISTS identity.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic Info
    legal_name TEXT NOT NULL,
    display_name TEXT,
    business_model identity.org_business_model NOT NULL,
    
    -- Contact
    headquarters_country TEXT,               -- ISO 3166-1 alpha-2
    headquarters_address JSONB,              -- Structured address
    primary_contact_email TEXT,
    primary_contact_phone TEXT,
    
    -- Enterprise SSO
    sso_provider TEXT,                       -- 'AZURE_AD', 'OKTA', 'PING', 'SAML'
    sso_tenant_id TEXT,                      -- Azure AD Tenant ID / Okta Org ID
    sso_domain TEXT,                         -- e.g., 'pfizer.com'
    allowed_email_domains TEXT[],            -- ['pfizer.com', 'pfizer.eu']
    
    -- Part 11 Compliance
    signature_legal_disclaimer TEXT NOT NULL DEFAULT 'I hereby certify that the information provided is true, accurate, and complete to the best of my knowledge.',
    requires_dual_signature BOOLEAN DEFAULT FALSE,
    esignature_method TEXT DEFAULT 'PASSWORD', -- 'PASSWORD', 'MFA', 'PKI', 'BIOMETRIC'
    
    -- Data Residency (GDPR/Regional Compliance)
    data_residency_region TEXT DEFAULT 'aws-us-east-1',
    data_residency_requirements TEXT[],      -- ['GDPR', 'HIPAA', 'PMDA']
    
    -- Subscription / Licensing
    subscription_tier TEXT DEFAULT 'ENTERPRISE', -- 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'
    max_users INT,
    max_submissions INT,
    contract_start_date DATE,
    contract_end_date DATE,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    onboarding_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'IN_PROGRESS', 'COMPLETE'
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'system'
);

COMMENT ON TABLE identity.organizations IS 
  'Multi-tenant organization registry - each org is a data owner or delegate';

COMMENT ON COLUMN identity.organizations.data_residency_region IS 
  'Neon region for data storage - critical for GDPR/PMDA compliance';

CREATE INDEX IF NOT EXISTS org_business_model_idx ON identity.organizations(business_model);
CREATE INDEX IF NOT EXISTS org_sso_domain_idx ON identity.organizations(sso_domain);
CREATE INDEX IF NOT EXISTS org_active_idx ON identity.organizations(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- C) USERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS identity.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,                 -- Required for Part 11 signatures
    display_name TEXT,
    
    -- Home Organization
    home_org_id UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
    
    -- Role within home org
    primary_role identity.user_role,
    job_title TEXT,
    department TEXT,
    
    -- SSO Binding
    sso_subject_id TEXT,                     -- SSO provider's user ID
    sso_last_login TIMESTAMPTZ,
    
    -- Part 11 Compliance
    signature_meaning TEXT,                  -- What their signature means legally
    can_sign_submissions BOOLEAN DEFAULT FALSE,
    requires_training_verification BOOLEAN DEFAULT TRUE,
    training_verified_at TIMESTAMPTZ,
    training_expiry_date DATE,
    
    -- Security
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_locked BOOLEAN DEFAULT FALSE,
    lock_reason TEXT,
    failed_login_attempts INT DEFAULT 0,
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    password_changed_at TIMESTAMPTZ,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_method TEXT,                         -- 'TOTP', 'SMS', 'EMAIL', 'HARDWARE_KEY'
    
    -- Metadata
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'system'
);

COMMENT ON TABLE identity.users IS 
  'User registry with Part 11 compliance attributes';

COMMENT ON COLUMN identity.users.full_name IS 
  'Required for 21 CFR Part 11 electronic signatures - must match legal name';

CREATE INDEX IF NOT EXISTS user_home_org_idx ON identity.users(home_org_id);
CREATE INDEX IF NOT EXISTS user_email_idx ON identity.users(email);
CREATE INDEX IF NOT EXISTS user_sso_idx ON identity.users(sso_subject_id);
CREATE INDEX IF NOT EXISTS user_active_idx ON identity.users(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- D) ORGANIZATION RELATIONSHIPS (Sponsor/CRO Contracts)
-- =============================================================================

CREATE TABLE IF NOT EXISTS identity.org_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- The Contract
    sponsor_org_id UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
    delegate_org_id UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
    
    -- Relationship Type
    relationship_type TEXT NOT NULL DEFAULT 'CRO_CONTRACT', -- 'CRO_CONTRACT', 'CONSULTANCY', 'CMO', 'COLLABORATION'
    
    -- Contract Details
    contract_reference TEXT,                 -- MSA reference number
    contract_start_date DATE NOT NULL,
    contract_end_date DATE,                  -- NULL = indefinite
    
    -- Scope (which programs/submissions does this cover?)
    scope_all_programs BOOLEAN DEFAULT FALSE, -- TRUE = access to all sponsor programs
    scoped_program_ids UUID[],               -- If not all, specific program IDs
    scoped_therapeutic_areas TEXT[],         -- Or by therapeutic area
    
    -- Granular Permissions
    can_view_submissions BOOLEAN DEFAULT TRUE,
    can_edit_submissions BOOLEAN DEFAULT TRUE,
    can_upload_documents BOOLEAN DEFAULT TRUE,
    can_manage_users BOOLEAN DEFAULT FALSE,
    can_sign_submissions BOOLEAN DEFAULT FALSE, -- Delegation of signing authority
    can_view_financials BOOLEAN DEFAULT FALSE,
    can_export_data BOOLEAN DEFAULT TRUE,
    
    -- Data Access Level
    access_level identity.access_level NOT NULL DEFAULT 'READ_WRITE',
    
    -- Audit
    approved_by TEXT,                        -- Who approved this relationship
    approved_at TIMESTAMPTZ,
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    suspended_at TIMESTAMPTZ,
    suspension_reason TEXT,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'system',
    
    -- Constraints
    CONSTRAINT no_self_relationship CHECK (sponsor_org_id != delegate_org_id),
    CONSTRAINT valid_contract_dates CHECK (contract_end_date IS NULL OR contract_end_date >= contract_start_date)
);

COMMENT ON TABLE identity.org_relationships IS 
  'Sponsor/CRO relationships - backbone of RLS access policies';

COMMENT ON COLUMN identity.org_relationships.sponsor_org_id IS 
  'The DATA OWNER - legally owns the IP and regulatory data';

COMMENT ON COLUMN identity.org_relationships.delegate_org_id IS 
  'The SERVICE PROVIDER - contracted to access sponsor data';

CREATE INDEX IF NOT EXISTS org_rel_sponsor_idx ON identity.org_relationships(sponsor_org_id);
CREATE INDEX IF NOT EXISTS org_rel_delegate_idx ON identity.org_relationships(delegate_org_id);
CREATE INDEX IF NOT EXISTS org_rel_active_idx ON identity.org_relationships(is_active) WHERE is_active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS org_rel_unique_idx ON identity.org_relationships(sponsor_org_id, delegate_org_id, relationship_type) WHERE is_active = TRUE;

-- =============================================================================
-- E) USER PROGRAM MEMBERSHIPS (User-level access to programs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS identity.user_program_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Who
    user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    
    -- What program (links to core.programs if exists, or use program_id directly)
    program_id UUID NOT NULL,                -- FK to core.programs
    
    -- What can they do
    access_level identity.access_level NOT NULL DEFAULT 'READ_WRITE',
    role_in_program identity.user_role,      -- May differ from home org role
    
    -- Constraints
    can_view BOOLEAN NOT NULL DEFAULT TRUE,
    can_edit BOOLEAN NOT NULL DEFAULT TRUE,
    can_delete BOOLEAN NOT NULL DEFAULT FALSE,
    can_sign BOOLEAN NOT NULL DEFAULT FALSE,
    can_approve BOOLEAN NOT NULL DEFAULT FALSE,
    can_export BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Temporal
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    granted_by TEXT NOT NULL,
    expires_at TIMESTAMPTZ,                  -- For temporary access
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    revoked_at TIMESTAMPTZ,
    revoked_by TEXT,
    revocation_reason TEXT,
    
    -- Metadata
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_user_program UNIQUE (user_id, program_id)
);

COMMENT ON TABLE identity.user_program_access IS 
  'Granular user access to specific programs/assets';

CREATE INDEX IF NOT EXISTS upa_user_idx ON identity.user_program_access(user_id);
CREATE INDEX IF NOT EXISTS upa_program_idx ON identity.user_program_access(program_id);
CREATE INDEX IF NOT EXISTS upa_active_idx ON identity.user_program_access(user_id, program_id) WHERE is_active = TRUE;

-- =============================================================================
-- F) SESSION CONTEXT FUNCTIONS (For RLS)
-- =============================================================================

-- Get current user ID from session
CREATE OR REPLACE FUNCTION identity.current_user_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
$$;

-- Get current organization ID from session
CREATE OR REPLACE FUNCTION identity.current_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
    SELECT NULLIF(current_setting('app.active_org_id', TRUE), '')::UUID;
$$;

-- Set session context (called by application at start of each transaction)
CREATE OR REPLACE FUNCTION identity.set_app_context(
    p_user_id UUID,
    p_org_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, TRUE);
    PERFORM set_config('app.active_org_id', p_org_id::TEXT, TRUE);
END;
$$;

-- =============================================================================
-- G) ACCESS CHECK FUNCTIONS (SECURITY DEFINER - bypasses RLS)
-- =============================================================================

-- Check if current user can access an organization's data
-- Returns TRUE if:
--   1. User belongs to the organization (direct membership), OR
--   2. User's organization has a valid contract with the target organization (delegation)
CREATE OR REPLACE FUNCTION identity.check_org_access(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, public
AS $$
DECLARE
    v_user_org_id UUID;
BEGIN
    -- Get user's organization
    v_user_org_id := identity.current_org_id();
    
    -- No context set = no access
    IF v_user_org_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- 1. Direct membership (Sponsor user accessing Sponsor data)
    IF v_user_org_id = target_org_id THEN
        RETURN TRUE;
    END IF;
    
    -- 2. Delegated access (CRO user accessing Sponsor data via contract)
    RETURN EXISTS (
        SELECT 1
        FROM identity.org_relationships r
        WHERE r.sponsor_org_id = target_org_id
          AND r.delegate_org_id = v_user_org_id
          AND r.is_active = TRUE
          AND (r.contract_end_date IS NULL OR r.contract_end_date > CURRENT_DATE)
    );
END;
$$;

COMMENT ON FUNCTION identity.check_org_access IS 
  'RLS helper: checks if current user has access to organization data';

-- Check if current user can write to an organization's data
CREATE OR REPLACE FUNCTION identity.check_org_write_access(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, public
AS $$
DECLARE
    v_user_org_id UUID;
BEGIN
    v_user_org_id := identity.current_org_id();
    
    IF v_user_org_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Direct membership with write access
    IF v_user_org_id = target_org_id THEN
        RETURN TRUE;
    END IF;
    
    -- Delegated access with edit permissions
    RETURN EXISTS (
        SELECT 1
        FROM identity.org_relationships r
        WHERE r.sponsor_org_id = target_org_id
          AND r.delegate_org_id = v_user_org_id
          AND r.is_active = TRUE
          AND r.can_edit_submissions = TRUE
          AND (r.contract_end_date IS NULL OR r.contract_end_date > CURRENT_DATE)
    );
END;
$$;

-- Check if current user can sign for an organization
CREATE OR REPLACE FUNCTION identity.check_signing_authority(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = identity, public
AS $$
DECLARE
    v_user_id UUID;
    v_user_org_id UUID;
BEGIN
    v_user_id := identity.current_user_id();
    v_user_org_id := identity.current_org_id();
    
    IF v_user_id IS NULL OR v_user_org_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- User must have can_sign_submissions = TRUE
    IF NOT EXISTS (
        SELECT 1 FROM identity.users
        WHERE id = v_user_id AND can_sign_submissions = TRUE
    ) THEN
        RETURN FALSE;
    END IF;
    
    -- Direct membership
    IF v_user_org_id = target_org_id THEN
        RETURN TRUE;
    END IF;
    
    -- Delegated signing authority
    RETURN EXISTS (
        SELECT 1
        FROM identity.org_relationships r
        WHERE r.sponsor_org_id = target_org_id
          AND r.delegate_org_id = v_user_org_id
          AND r.is_active = TRUE
          AND r.can_sign_submissions = TRUE
          AND (r.contract_end_date IS NULL OR r.contract_end_date > CURRENT_DATE)
    );
END;
$$;

-- =============================================================================
-- H) SEED DATA: Sample Organizations
-- =============================================================================

-- Demo Sponsor
DO $$
BEGIN
    BEGIN
INSERT INTO identity.organizations (id, legal_name, display_name, business_model, headquarters_country, signature_legal_disclaimer, is_active)
VALUES (
    'a1000000-0000-0000-0000-000000000001'::UUID,
    'Innovix Therapeutics, Inc.',
    'Innovix',
    'BIO_PHARMA_SPONSOR',
    'US',
    'I hereby certify that this electronic submission is true, accurate, and complete. I understand that any false or misleading information may be punishable under law.',
    TRUE
)
ON CONFLICT (id) DO UPDATE SET updated_at = NOW();

-- Demo CRO
INSERT INTO identity.organizations (id, legal_name, display_name, business_model, headquarters_country, signature_legal_disclaimer, is_active)
VALUES (
    'a2000000-0000-0000-0000-000000000002'::UUID,
    'GlobalClin Research Partners',
    'GlobalClin',
    'CRO_PARTNER',
    'US',
    'As a contracted service provider, I certify that the work performed is in accordance with the applicable protocols and regulations.',
    TRUE
)
ON CONFLICT (id) DO UPDATE SET updated_at = NOW();

-- Demo Medical Device Company
INSERT INTO identity.organizations (id, legal_name, display_name, business_model, headquarters_country, signature_legal_disclaimer, is_active)
VALUES (
    'a3000000-0000-0000-0000-000000000003'::UUID,
    'MedTech Diagnostics Corp',
    'MedTech Dx',
    'DEVICE_MANUFACTURER',
    'US',
    'I certify that this device submission is complete and accurate, and that the device meets all applicable regulatory requirements.',
    TRUE
)
ON CONFLICT (id) DO UPDATE SET updated_at = NOW();

-- Demo Academic Institution
INSERT INTO identity.organizations (id, legal_name, display_name, business_model, headquarters_country, signature_legal_disclaimer, is_active)
VALUES (
    'a4000000-0000-0000-0000-000000000004'::UUID,
    'University Medical Research Center',
    'UMRC',
    'ACADEMIC_INSTITUTION',
    'US',
    'This research has been conducted in accordance with IRB protocols and all applicable research ethics guidelines.',
    TRUE
)
ON CONFLICT (id) DO UPDATE SET updated_at = NOW();

-- Demo CRO relationship with Sponsor
INSERT INTO identity.org_relationships (sponsor_org_id, delegate_org_id, relationship_type, contract_reference, contract_start_date, scope_all_programs, can_view_submissions, can_edit_submissions, can_upload_documents, can_sign_submissions, approved_by, approved_at, is_active)
VALUES (
    'a1000000-0000-0000-0000-000000000001'::UUID,
    'a2000000-0000-0000-0000-000000000002'::UUID,
    'CRO_CONTRACT',
    'MSA-2024-001',
    '2024-01-01',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    'system',
    NOW(),
    TRUE
)
ON CONFLICT DO NOTHING;
    EXCEPTION WHEN undefined_column THEN
        RAISE NOTICE 'Skipping identity demo seed data (column mismatch in trigger).';
    END;
END $$;

-- =============================================================================
-- I) VIEWS
-- =============================================================================

-- View: Organization with user count
CREATE OR REPLACE VIEW identity.v_organization_summary AS
SELECT 
    o.id,
    o.legal_name,
    o.display_name,
    o.business_model,
    o.headquarters_country,
    o.is_active,
    COUNT(DISTINCT u.id) AS user_count,
    COUNT(DISTINCT r.id) FILTER (WHERE r.sponsor_org_id = o.id) AS cro_contracts,
    COUNT(DISTINCT r.id) FILTER (WHERE r.delegate_org_id = o.id) AS sponsor_clients
FROM identity.organizations o
LEFT JOIN identity.users u ON u.home_org_id = o.id AND u.is_active = TRUE
LEFT JOIN identity.org_relationships r ON (r.sponsor_org_id = o.id OR r.delegate_org_id = o.id) AND r.is_active = TRUE
GROUP BY o.id, o.legal_name, o.display_name, o.business_model, o.headquarters_country, o.is_active;

-- View: User with access summary
CREATE OR REPLACE VIEW identity.v_user_access_summary AS
SELECT 
    u.id AS user_id,
    u.email,
    u.full_name,
    u.primary_role,
    o.legal_name AS home_org_name,
    o.business_model,
    u.can_sign_submissions,
    u.is_active,
    COUNT(DISTINCT upa.program_id) AS program_access_count
FROM identity.users u
JOIN identity.organizations o ON u.home_org_id = o.id
LEFT JOIN identity.user_program_access upa ON upa.user_id = u.id AND upa.is_active = TRUE
GROUP BY u.id, u.email, u.full_name, u.primary_role, o.legal_name, o.business_model, u.can_sign_submissions, u.is_active;

-- =============================================================================
-- J) GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA identity TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA identity TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA identity TO PUBLIC;

COMMIT;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 051_gcc_multi_tenant_identity completed successfully';
    RAISE NOTICE 'Created identity schema with:';
    RAISE NOTICE '  - organizations (multi-tenant registry)';
    RAISE NOTICE '  - users (Part 11 compliant)';
    RAISE NOTICE '  - org_relationships (Sponsor/CRO contracts)';
    RAISE NOTICE '  - user_program_access (granular permissions)';
    RAISE NOTICE '  - RLS helper functions (SECURITY DEFINER)';
END $$;
