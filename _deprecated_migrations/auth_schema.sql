-- Authentication Schema for Neon Database
-- This migration creates the necessary tables for email/password authentication
-- with refresh tokens and password reset functionality

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for authentication
CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  
  -- Indexes for faster lookups
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create indexes for auth_users
CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);
CREATE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(username);
CREATE INDEX IF NOT EXISTS idx_auth_users_is_active ON auth_users(is_active);

-- Refresh tokens table for JWT refresh functionality
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token VARCHAR(500) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMP WITH TIME ZONE,
  ip_address VARCHAR(45), -- Support both IPv4 and IPv6
  user_agent TEXT
);

-- Create indexes for auth_refresh_tokens
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_id ON auth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_token ON auth_refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_expires_at ON auth_refresh_tokens(expires_at);

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS auth_password_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token VARCHAR(500) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP WITH TIME ZONE,
  ip_address VARCHAR(45)
);

-- Create indexes for auth_password_resets
CREATE INDEX IF NOT EXISTS idx_auth_password_resets_user_id ON auth_password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_password_resets_token ON auth_password_resets(token);
CREATE INDEX IF NOT EXISTS idx_auth_password_resets_expires_at ON auth_password_resets(expires_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on auth_users
DROP TRIGGER IF EXISTS update_auth_users_updated_at ON auth_users;
CREATE TRIGGER update_auth_users_updated_at
  BEFORE UPDATE ON auth_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  -- Delete expired refresh tokens
  DELETE FROM auth_refresh_tokens
  WHERE expires_at < NOW() AND revoked = false;
  
  -- Delete expired password reset tokens
  DELETE FROM auth_password_resets
  WHERE expires_at < NOW() AND used = false;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE auth_users IS 'User accounts for authentication';
COMMENT ON TABLE auth_refresh_tokens IS 'JWT refresh tokens for maintaining user sessions';
COMMENT ON TABLE auth_password_resets IS 'Tokens for password reset functionality';
COMMENT ON COLUMN auth_users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN auth_users.email_verified IS 'Whether the user has verified their email address';
COMMENT ON COLUMN auth_refresh_tokens.revoked IS 'Whether this refresh token has been revoked';
COMMENT ON COLUMN auth_password_resets.used IS 'Whether this reset token has been used';

-- Grant appropriate permissions (adjust based on your database user)
-- Note: In production, you should use a specific database user with limited permissions
-- GRANT SELECT, INSERT, UPDATE, DELETE ON auth_users TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON auth_refresh_tokens TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON auth_password_resets TO your_app_user;
