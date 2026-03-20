-- Add email OTP fields for email-based two-factor authentication
-- These replace TOTP (authenticator app) as the default MFA method

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_otp_attempts INTEGER DEFAULT 0;

-- Switch default MFA method from 'totp' to 'email' for all users
-- who haven't explicitly configured TOTP
UPDATE users SET mfa_method = 'email' WHERE mfa_method = 'totp' AND mfa_secret IS NULL;
