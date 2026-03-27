-- Performance indexes for External Evidence Intelligence GA readiness

CREATE INDEX IF NOT EXISTS idx_external_evidence_documents_tenant_created
  ON external_evidence_documents (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_evidence_documents_canonical_hash
  ON external_evidence_documents (tenant_id, canonical_url, content_hash);

CREATE INDEX IF NOT EXISTS idx_external_tool_audit_log_tenant_created
  ON external_tool_audit_log (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_firecrawl_usage_daily_tenant_date
  ON firecrawl_usage_daily (tenant_id, usage_date DESC);
