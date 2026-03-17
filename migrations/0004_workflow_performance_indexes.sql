-- Workflow Performance Indexes
-- Adds composite indexes to accelerate high-frequency workflow queries.
-- All operations are IF NOT EXISTS to be safely idempotent.

-- unified_documents: list by org + status (used by document listing/filtering)
CREATE INDEX IF NOT EXISTS idx_unified_docs_org_status
  ON unified_documents (organization_id, status);

-- document_workflows: active workflows per org (used by getActiveWorkflows)
CREATE INDEX IF NOT EXISTS idx_doc_workflows_org_status
  ON document_workflows (organization_id, status);

-- document_workflows: lookup by document (used by getDocumentWorkflow)
CREATE INDEX IF NOT EXISTS idx_doc_workflows_document_id
  ON document_workflows (document_id);

-- workflow_approvals: pending approvals per workflow (used by getWorkflowApprovals, getPendingApprovals)
CREATE INDEX IF NOT EXISTS idx_wf_approvals_workflow_status
  ON workflow_approvals (workflow_id, status);

-- workflow_steps: steps per template ordered (used by getWorkflowTemplate)
CREATE INDEX IF NOT EXISTS idx_wf_steps_template_order
  ON workflow_steps (template_id, "order");

-- workflow_templates: lookup by module + org + active (used by getWorkflowTemplatesByModule)
CREATE INDEX IF NOT EXISTS idx_wf_templates_module_org_active
  ON workflow_templates (module_type, organization_id, is_active);

-- document_audit_logs: audit trail per document ordered by time (used by compliance queries)
CREATE INDEX IF NOT EXISTS idx_audit_logs_doc_time
  ON document_audit_logs (document_id, performed_at DESC);

-- workflow_history: history per workflow ordered by time
CREATE INDEX IF NOT EXISTS idx_wf_history_workflow_time
  ON workflow_history (workflow_id, created_at DESC);
