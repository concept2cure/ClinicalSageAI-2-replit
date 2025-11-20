
-- TrialSage Performance Optimization Indexes
-- Optimizes document upload/download and tenant-based queries

-- Core document indexing for tenant isolation and time-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_tenant_uploaded_at 
ON documents(tenant_id, uploaded_at DESC);

-- Composite index for document search and filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_tenant_type_status 
ON documents(tenant_id, document_type, status);

-- Index for document metadata queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_tenant_filename 
ON documents(tenant_id, filename) WHERE filename IS NOT NULL;

-- Index for document size and type analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_tenant_size_type 
ON documents(tenant_id, filesize, filetype);

-- Partial index for active documents only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_active_tenant 
ON documents(tenant_id, updated_at DESC) 
WHERE status = 'active';

-- Document chunks indexing for vector search performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_tenant_doc 
ON document_chunks(tenant_id, document_id);

-- Vector similarity search optimization (if using pgvector)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunks_embedding 
ON document_chunks USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100) WHERE embedding IS NOT NULL;

-- Full-text search optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_content_search 
ON documents USING gin(to_tsvector('english', content)) 
WHERE content IS NOT NULL;

-- Audit trail performance for document history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_audit_tenant_time 
ON documents(tenant_id, (audit_trail->0->>'timestamp')) 
WHERE audit_trail IS NOT NULL;

-- CER-specific indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cer_reports_tenant_device 
ON cer_reports(tenant_id, device_name, created_at DESC) 
WHERE device_name IS NOT NULL;

-- Literature search optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_literature_entries_tenant_topic 
ON literature_entries(tenant_id, topic, relevance_score DESC) 
WHERE topic IS NOT NULL;

-- Vault document access patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vault_documents_tenant_access 
ON vault_documents(tenant_id, last_accessed DESC, access_count DESC);

-- Study and trial indexing for regulatory intelligence
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trials_therapeutic_area_phase 
ON trials(therapeutic_area, phase, status) 
WHERE therapeutic_area IS NOT NULL;

-- Compliance tracking indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_compliance_checks_tenant_date 
ON compliance_checks(tenant_id, check_date DESC, status);

-- User activity and session optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_tenant_active 
ON user_sessions(tenant_id, last_activity DESC) 
WHERE is_active = true;

-- Export and download tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_export_logs_tenant_type_date 
ON export_logs(tenant_id, export_type, created_at DESC);

-- Notification and alert indexing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_tenant_unread 
ON notifications(tenant_id, created_at DESC) 
WHERE read_at IS NULL;

-- Workflow and process tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_steps_tenant_status 
ON workflow_steps(tenant_id, status, updated_at DESC);

-- Document versioning performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_versions_tenant_latest 
ON document_versions(tenant_id, document_id, version DESC);
