-- ═══════════════════════════════════════════════════════════════════════════
-- Per-model usage attribution + rechargeable credit balance (Anthropic-style)
--
-- 1. api_usage_logs.model — which LLM served each metered call, so usage
--    limits can be bucketed per model family ("All models" vs premium)
--    the way Anthropic's plan usage limits are.
-- 2. credit_ledger — append-only signed ledger backing a purchasable credit
--    balance (grants, purchases, auto-reloads, debits, adjustments), each
--    row carrying the post-entry balance for cheap point-in-time reads.
-- 3. credit_autoreload_settings — per-org "top off to $X when balance is $Y"
--    configuration (defaults mirror Anthropic's $25 top-up at $10 floor).
-- ═══════════════════════════════════════════════════════════════════════════

-- api_usage_logs was originally created in db/migrations/
-- 20260319_billing_usage_budgets_alerts.sql — a directory outside this
-- migration chain, so environments built from migrations/ alone (e.g. the
-- Neon preview branch) may not have it. Create it here (identical
-- definition, IF NOT EXISTS everywhere) so the ALTER below is always valid.
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

ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS model TEXT;

CREATE INDEX IF NOT EXISTS api_usage_org_model_date_idx
  ON api_usage_logs (organization_id, model, created_at);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id                  SERIAL PRIMARY KEY,
  organization_id     INTEGER NOT NULL REFERENCES organizations(id),
  entry_type          TEXT NOT NULL CHECK (entry_type IN ('grant','purchase','auto_reload','debit','adjustment')),
  -- Signed: credits positive, debits negative. Balance = SUM(amount_cents).
  amount_cents        INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  description         TEXT,
  -- External correlation id (Stripe payment intent, feature run id, ...).
  reference           TEXT,
  created_by          INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_ledger_debit_sign  CHECK (entry_type <> 'debit' OR amount_cents <= 0),
  CONSTRAINT credit_ledger_credit_sign CHECK (entry_type NOT IN ('grant','purchase','auto_reload') OR amount_cents >= 0)
);

CREATE INDEX IF NOT EXISTS credit_ledger_org_date_idx
  ON credit_ledger (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS credit_autoreload_settings (
  organization_id INTEGER PRIMARY KEY REFERENCES organizations(id),
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  threshold_cents INTEGER NOT NULL DEFAULT 1000 CHECK (threshold_cents >= 0),
  topup_cents     INTEGER NOT NULL DEFAULT 2500 CHECK (topup_cents > 0),
  updated_by      INTEGER,
  reason          TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
