-- Phase 17: Audit Ledger (Glass Box)
-- Creates or upgrades the audit_logs table for immutable AI decisions

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  tenant_id INTEGER,
  user_id INTEGER,
  action VARCHAR(255),
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  actor_id VARCHAR(255) NOT NULL DEFAULT 'SYSTEM',
  action_type VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN',
  target_resource VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  session_id VARCHAR(255),
  severity VARCHAR(20) DEFAULT 'info'
);

-- Add missing columns for backward compatibility if table already exists
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS tenant_id INTEGER,
  ADD COLUMN IF NOT EXISTS user_id INTEGER,
  ADD COLUMN IF NOT EXISTS action VARCHAR(255),
  ADD COLUMN IF NOT EXISTS resource_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS resource_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS actor_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS action_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS target_resource VARCHAR(255),
  ADD COLUMN IF NOT EXISTS details JSONB,
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS severity VARCHAR(20);

-- Indexes for fast forensic searching
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp DESC);
