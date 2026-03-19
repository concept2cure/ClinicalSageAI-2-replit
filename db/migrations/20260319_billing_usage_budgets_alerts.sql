-- Migration: Billing Usage Tracking, Budgets & Alerts
-- Date: 2026-03-19
-- Description: Adds tables for API usage tracking, budget/spending limits,
--              and billing alerts to replicate Anthropic/Claude-style billing UX.

-- ============================================================
-- API USAGE LOGS
-- Tracks per-request API usage for billing dashboards
-- ============================================================
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  user_id INTEGER,
  module TEXT NOT NULL,                -- '510k', 'cer', 'ectd', 'cmc', 'ai_assistance', 'vault'
  endpoint TEXT,
  request_count INTEGER NOT NULL DEFAULT 1,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_usage_org_date_idx ON api_usage_logs (organization_id, created_at);
CREATE INDEX IF NOT EXISTS api_usage_module_idx ON api_usage_logs (module);

-- ============================================================
-- BILLING BUDGETS
-- Per-org monthly spending limits and alert thresholds
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_budgets (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) UNIQUE,
  monthly_budget_cents INTEGER,        -- NULL = no budget set
  hard_limit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  alert_thresholds JSONB DEFAULT '[
    {"threshold": 50, "emailEnabled": false, "inAppEnabled": true},
    {"threshold": 75, "emailEnabled": true, "inAppEnabled": true},
    {"threshold": 90, "emailEnabled": true, "inAppEnabled": true},
    {"threshold": 100, "emailEnabled": true, "inAppEnabled": true}
  ]'::jsonb,
  notify_emails JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BILLING ALERTS
-- History of all billing notifications sent
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_alerts (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  type TEXT NOT NULL,                  -- 'budget_warning', 'budget_exceeded', 'payment_failed', 'plan_change', 'invoice_ready'
  threshold INTEGER,                   -- percentage threshold (50, 75, 90, 100)
  message TEXT NOT NULL,
  metadata JSONB,
  email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_alerts_org_idx ON billing_alerts (organization_id);
CREATE INDEX IF NOT EXISTS billing_alerts_type_idx ON billing_alerts (type);
