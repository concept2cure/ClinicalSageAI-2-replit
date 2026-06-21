-- Migration: Weekly Usage Limits & Overage Caps
-- Date: 2026-06-21
-- Description: Per-organization, per-metric WEEKLY usage limits with overage
--              caps (allow spend past the limit up to a ceiling, then block),
--              modeled after Anthropic/Claude's API usage-limit + overage
--              controls. Complements the existing MONTHLY billing_budgets.
--              Limit changes are governed (reason-for-change + audit trail,
--              21 CFR Part 11 §11.10(e)) — captured via the audit service and
--              the updated_by / reason columns below.

-- ============================================================
-- WEEKLY USAGE LIMITS
-- One row per (organization, metric). A metric is one of:
--   'cost_cents' | 'requests' | 'tokens' | 'documents' | 'seats'
-- A missing row means "no weekly limit configured for that metric"
-- (the enforcement layer fails open — usage is allowed).
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_usage_limits (
  id                 SERIAL PRIMARY KEY,
  organization_id    INTEGER NOT NULL REFERENCES organizations(id),
  metric             TEXT    NOT NULL,

  -- The weekly limit, in the metric's native unit (cents / requests / tokens /
  -- documents / distinct active users). Crossing this starts "overage".
  weekly_limit       BIGINT  NOT NULL,

  -- Overage cap. Spend is ALLOWED past weekly_limit up to the effective cap,
  -- then BLOCKED. The effective cap is:
  --   overage_hard_cap            when set (absolute ceiling), else
  --   floor(weekly_limit * (1 + overage_cap_pct / 100))
  -- overage_cap_pct = 0 means a hard block exactly at the limit (no overage).
  overage_cap_pct    INTEGER NOT NULL DEFAULT 0,
  overage_hard_cap   BIGINT,

  -- Monitoring: emit a 'warn' state once usage reaches this % of the limit.
  warn_threshold_pct INTEGER NOT NULL DEFAULT 80,

  -- Day the weekly window resets on: 0=Sunday .. 6=Saturday (Monday default).
  week_start_dow     INTEGER NOT NULL DEFAULT 1,

  enabled            BOOLEAN NOT NULL DEFAULT TRUE,

  -- Governance: who last changed this limit and why (reason-for-change).
  updated_by         INTEGER,
  reason             TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT weekly_usage_limits_metric_chk
    CHECK (metric IN ('cost_cents', 'requests', 'tokens', 'documents', 'seats')),
  CONSTRAINT weekly_usage_limits_nonneg_chk
    CHECK (weekly_limit >= 0 AND overage_cap_pct >= 0
           AND warn_threshold_pct BETWEEN 0 AND 100
           AND week_start_dow BETWEEN 0 AND 6
           AND (overage_hard_cap IS NULL OR overage_hard_cap >= weekly_limit)),
  CONSTRAINT weekly_usage_limits_org_metric_uq
    UNIQUE (organization_id, metric)
);

CREATE INDEX IF NOT EXISTS weekly_usage_limits_org_idx
  ON weekly_usage_limits (organization_id);

-- ============================================================
-- WEEKLY USAGE ALERTS (idempotent threshold notifications)
-- Reuses the existing billing_alerts table (read by GET /alerts/history) for
-- weekly threshold alerts (types: 'weekly_warning' | 'weekly_overage' |
-- 'weekly_blocked'). A dedup_key makes each (metric, window_start, kind) alert
-- fire AT MOST ONCE per weekly window. Pre-existing alerts keep dedup_key NULL;
-- the unique index is partial so multiple NULLs are allowed.
-- ============================================================
ALTER TABLE billing_alerts ADD COLUMN IF NOT EXISTS dedup_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS billing_alerts_dedup_key_uq
  ON billing_alerts (dedup_key) WHERE dedup_key IS NOT NULL;

