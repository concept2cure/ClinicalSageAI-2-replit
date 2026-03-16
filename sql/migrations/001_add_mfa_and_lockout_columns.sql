-- Migration: Add MFA, account lockout, and password policy columns to users table
-- Part of: Security hardening for 21 CFR Part 11 compliance
-- Date: 2026-03-16

-- MFA fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_method TEXT DEFAULT 'totp';
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMP;

-- Account lockout fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMP;

-- Password policy fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_history JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- Index for lockout queries
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled) WHERE mfa_enabled = TRUE;
