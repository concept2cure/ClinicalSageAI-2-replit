-- AnA 1.0 RI: persistent cross-cutting kernel decision log
-- Append-only operational evidence for governance/security/observability runtime decisions.

CREATE TABLE IF NOT EXISTS ana_kernel_decision_log (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL,
  tenant_id TEXT,
  actor_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  final_decision TEXT NOT NULL CHECK (final_decision IN ('allow', 'review', 'deny')),
  enforced_decision TEXT NOT NULL CHECK (enforced_decision IN ('allow', 'review', 'deny')),
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  policy_bundle_id TEXT NOT NULL,
  policy_bundle_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('enforce', 'shadow')),
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ana_kernel_log_recorded_at
  ON ana_kernel_decision_log(recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_ana_kernel_log_decisions
  ON ana_kernel_decision_log(final_decision, enforced_decision);

CREATE INDEX IF NOT EXISTS idx_ana_kernel_log_policy
  ON ana_kernel_decision_log(policy_bundle_id, policy_bundle_version);

CREATE INDEX IF NOT EXISTS idx_ana_kernel_log_tenant
  ON ana_kernel_decision_log(tenant_id, recorded_at DESC);

COMMENT ON TABLE ana_kernel_decision_log IS
  'Append-only runtime decision evidence emitted by AnaMicrokernel for audit and observability.';
