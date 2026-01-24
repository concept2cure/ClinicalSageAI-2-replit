-- ============================================================================
-- Enterprise Authentication Security Tables
-- Concept2Cure TrialSage Platform
-- 21 CFR Part 11 Compliant
-- Version 1.0 | January 2026
-- ============================================================================

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- AUTH AUDIT LOG TABLE
-- Captures all authentication events for compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(50) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    email VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_fingerprint VARCHAR(255),
    organization_id INTEGER REFERENCES organizations(id),
    success BOOLEAN NOT NULL DEFAULT false,
    failure_reason VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id ON auth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_email ON auth_audit_log(email);
CREATE INDEX IF NOT EXISTS idx_auth_audit_event_type ON auth_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at ON auth_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_audit_ip_address ON auth_audit_log(ip_address);
CREATE INDEX IF NOT EXISTS idx_auth_audit_org_id ON auth_audit_log(organization_id);

-- ============================================================================
-- AUTH SESSIONS TABLE
-- Track active user sessions for concurrent session management
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_fingerprint VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoke_reason VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(user_id, revoked, expires_at);

-- ============================================================================
-- MFA SECRETS TABLE
-- Store TOTP secrets and backup codes
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_mfa_secrets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    secret_encrypted TEXT NOT NULL,
    mfa_type VARCHAR(20) DEFAULT 'totp',
    enabled BOOLEAN DEFAULT false,
    backup_codes TEXT[],
    backup_codes_used INTEGER DEFAULT 0,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfa_secrets_user_id ON auth_mfa_secrets(user_id);

-- ============================================================================
-- PASSWORD HISTORY TABLE
-- Prevent password reuse per 21 CFR Part 11 requirements
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_password_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON auth_password_history(user_id);
CREATE INDEX IF NOT EXISTS idx_password_history_changed_at ON auth_password_history(user_id, changed_at);

-- ============================================================================
-- FAILED LOGIN ATTEMPTS TABLE
-- Track failed logins for lockout and anomaly detection
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_failed_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER REFERENCES users(id),
    email VARCHAR(255),
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    failure_reason VARCHAR(100),
    attempt_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failed_attempts_ip ON auth_failed_attempts(ip_address, attempt_time);
CREATE INDEX IF NOT EXISTS idx_failed_attempts_user ON auth_failed_attempts(user_id, attempt_time);
CREATE INDEX IF NOT EXISTS idx_failed_attempts_email ON auth_failed_attempts(email, attempt_time);

-- ============================================================================
-- SSO CONFIGURATIONS TABLE
-- Store SSO provider configs per organization
-- ============================================================================

CREATE TABLE IF NOT EXISTS org_sso_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'azure_ad', 'google', 'okta', 'saml'
    provider_name VARCHAR(100),
    email_domain VARCHAR(255) NOT NULL,
    client_id VARCHAR(255),
    client_secret_encrypted TEXT,
    metadata_url TEXT,
    metadata_xml TEXT,
    attribute_mapping JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    jit_provisioning BOOLEAN DEFAULT true,
    default_role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(email_domain)
);

CREATE INDEX IF NOT EXISTS idx_sso_configs_domain ON org_sso_configs(email_domain);
CREATE INDEX IF NOT EXISTS idx_sso_configs_org ON org_sso_configs(organization_id);

-- ============================================================================
-- TRUSTED DEVICES TABLE
-- Track trusted devices for MFA bypass
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_trusted_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_name VARCHAR(100),
    ip_address VARCHAR(45),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    trusted_until TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON auth_trusted_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_fingerprint ON auth_trusted_devices(device_fingerprint);

-- ============================================================================
-- ADD SECURITY COLUMNS TO USERS TABLE
-- ============================================================================

DO $$
BEGIN
    -- Add failed_login_attempts column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'failed_login_attempts') THEN
        ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
    END IF;

    -- Add locked_until column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'locked_until') THEN
        ALTER TABLE users ADD COLUMN locked_until TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add lockout_count column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'lockout_count') THEN
        ALTER TABLE users ADD COLUMN lockout_count INTEGER DEFAULT 0;
    END IF;

    -- Add last_failed_login column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'last_failed_login') THEN
        ALTER TABLE users ADD COLUMN last_failed_login TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add last_failed_ip column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'last_failed_ip') THEN
        ALTER TABLE users ADD COLUMN last_failed_ip VARCHAR(45);
    END IF;

    -- Add mfa_enabled column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'mfa_enabled') THEN
        ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT false;
    END IF;

    -- Add password_changed_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'password_changed_at') THEN
        ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;

    -- Add last_login_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'last_login_at') THEN
        ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add last_login_ip column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'last_login_ip') THEN
        ALTER TABLE users ADD COLUMN last_login_ip VARCHAR(45);
    END IF;
END $$;

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions() RETURNS void AS $$
BEGIN
    DELETE FROM auth_sessions 
    WHERE expires_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old audit logs (keep 7 years for compliance)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs() RETURNS void AS $$
BEGIN
    DELETE FROM auth_audit_log 
    WHERE created_at < NOW() - INTERVAL '7 years';
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old failed attempts (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_failed_attempts() RETURNS void AS $$
BEGIN
    DELETE FROM auth_failed_attempts 
    WHERE attempt_time < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANT PERMISSIONS (adjust as needed for your setup)
-- ============================================================================

-- Example grants (uncomment and modify as needed):
-- GRANT SELECT, INSERT ON auth_audit_log TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON auth_sessions TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON auth_mfa_secrets TO app_user;

COMMENT ON TABLE auth_audit_log IS '21 CFR Part 11 compliant authentication audit trail';
COMMENT ON TABLE auth_sessions IS 'Active user sessions with concurrent session management';
COMMENT ON TABLE auth_mfa_secrets IS 'Multi-factor authentication secrets and backup codes';
COMMENT ON TABLE auth_password_history IS 'Password history for preventing reuse';
COMMENT ON TABLE auth_failed_attempts IS 'Failed login tracking for security monitoring';
COMMENT ON TABLE org_sso_configs IS 'SSO provider configurations per organization';
COMMENT ON TABLE auth_trusted_devices IS 'Trusted devices for MFA bypass';
