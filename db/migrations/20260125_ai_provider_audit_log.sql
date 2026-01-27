-- ═══════════════════════════════════════════════════════════════════════════
--                    AI PROVIDER AUDIT LOG MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Creates the audit log table for AI provider routing decisions, usage,
-- and cost tracking. Required for 21 CFR Part 11 compliance.
--
-- @author TrialSage AI Team
-- @date 2025-01-25
-- ═══════════════════════════════════════════════════════════════════════════

-- Create the AI provider audit log table
CREATE TABLE IF NOT EXISTS ai_provider_audit_log (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Provider and model information
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  task_type VARCHAR(50) NOT NULL,

  -- Usage metrics
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  cost DECIMAL(10, 6) NOT NULL DEFAULT 0,

  -- Request outcome
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,

  -- Organization tracking
  organization_id UUID,
  user_id UUID,
  project_id UUID,

  -- Request fingerprint for deduplication
  request_hash VARCHAR(64) NOT NULL,

  -- Audit trail metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_audit_timestamp ON ai_provider_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_provider ON ai_provider_audit_log(provider, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_org ON ai_provider_audit_log(organization_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_project ON ai_provider_audit_log(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_task ON ai_provider_audit_log(task_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_audit_hash ON ai_provider_audit_log(request_hash);

-- Create a view for cost analytics
CREATE OR REPLACE VIEW ai_provider_cost_summary AS
SELECT
  date_trunc('day', timestamp) as day,
  provider,
  model,
  task_type,
  organization_id,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(cost) as total_cost,
  AVG(latency_ms) as avg_latency_ms,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate
FROM ai_provider_audit_log
GROUP BY
  date_trunc('day', timestamp),
  provider,
  model,
  task_type,
  organization_id;

-- Create function to get organization's AI usage summary
CREATE OR REPLACE FUNCTION get_org_ai_usage(
  p_org_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
  provider VARCHAR,
  model VARCHAR,
  task_type VARCHAR,
  request_count BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_cost DECIMAL,
  avg_latency_ms DECIMAL,
  success_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.provider,
    al.model,
    al.task_type,
    COUNT(*)::BIGINT as request_count,
    SUM(al.input_tokens)::BIGINT as total_input_tokens,
    SUM(al.output_tokens)::BIGINT as total_output_tokens,
    SUM(al.cost) as total_cost,
    AVG(al.latency_ms)::DECIMAL as avg_latency_ms,
    (SUM(CASE WHEN al.success THEN 1 ELSE 0 END)::float / COUNT(*))::DECIMAL as success_rate
  FROM ai_provider_audit_log al
  WHERE al.organization_id = p_org_id
    AND al.timestamp BETWEEN p_start_date AND p_end_date
  GROUP BY al.provider, al.model, al.task_type
  ORDER BY total_cost DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to get real-time provider health metrics
CREATE OR REPLACE FUNCTION get_provider_health_metrics(
  p_lookback_minutes INTEGER DEFAULT 60
)
RETURNS TABLE (
  provider VARCHAR,
  total_requests BIGINT,
  successful_requests BIGINT,
  failed_requests BIGINT,
  avg_latency_ms DECIMAL,
  p95_latency_ms DECIMAL,
  error_rate DECIMAL,
  total_cost DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.provider,
    COUNT(*)::BIGINT as total_requests,
    SUM(CASE WHEN al.success THEN 1 ELSE 0 END)::BIGINT as successful_requests,
    SUM(CASE WHEN NOT al.success THEN 1 ELSE 0 END)::BIGINT as failed_requests,
    AVG(al.latency_ms)::DECIMAL as avg_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY al.latency_ms)::DECIMAL as p95_latency_ms,
    (SUM(CASE WHEN NOT al.success THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0))::DECIMAL as error_rate,
    SUM(al.cost) as total_cost
  FROM ai_provider_audit_log al
  WHERE al.timestamp > NOW() - (p_lookback_minutes || ' minutes')::INTERVAL
  GROUP BY al.provider
  ORDER BY al.provider;
END;
$$ LANGUAGE plpgsql;

-- Add comment documentation
COMMENT ON TABLE ai_provider_audit_log IS
  'Comprehensive audit log for all AI provider interactions. Required for 21 CFR Part 11 compliance.';
COMMENT ON COLUMN ai_provider_audit_log.request_hash IS
  'SHA-256 hash of request content for deduplication and caching analysis';
COMMENT ON COLUMN ai_provider_audit_log.cost IS
  'Estimated cost in USD based on token usage and provider pricing';

SELECT 'AI Provider Audit Log table and functions created successfully' as result;
