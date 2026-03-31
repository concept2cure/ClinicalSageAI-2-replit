-- Performance Optimization: Add missing indexes on hot-path tables
-- These indexes target the top 30 most-queried tables, focusing on:
--   1. organizationId (tenant isolation — every query filters by org)
--   2. projectId (most queries are project-scoped)
--   3. status + type columns (common WHERE filters)
--   4. createdAt DESC (pagination/ordering)
--
-- All indexes use IF NOT EXISTS for idempotent application.
-- Run time: ~30-60 seconds on a populated database.

-- ============================================================================
-- TIER 1: Top 10 most-queried tables (critical path)
-- ============================================================================

-- csr_reports (61 queries) — CSR/CER modules
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csr_reports_org
  ON csr_reports(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csr_reports_org_status
  ON csr_reports(organization_id, status);

-- concept2cure_artifacts (56 queries) — core artifacts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_artifacts_org
  ON concept2cure_artifacts(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_artifacts_org_project
  ON concept2cure_artifacts(organization_id, project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_artifacts_org_type
  ON concept2cure_artifacts(organization_id, artifact_type);

-- users (47 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_org
  ON users(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
  ON users(email);

-- projects (39 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_org
  ON projects(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_org_status
  ON projects(organization_id, status);

-- csr_details (32 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csr_details_org
  ON csr_details(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csr_details_report
  ON csr_details(report_id);

-- documents (20 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_org
  ON documents(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_org_project
  ON documents(organization_id, project_id);

-- ============================================================================
-- TIER 2: Review & workflow tables (high-frequency reads)
-- ============================================================================

-- concept2cure_review_threads (19 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_review_threads_org
  ON concept2cure_review_threads(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_review_threads_artifact
  ON concept2cure_review_threads(artifact_id);

-- concept2cure_review_tasks (18 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_review_tasks_org
  ON concept2cure_review_tasks(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_review_tasks_org_status
  ON concept2cure_review_tasks(organization_id, status);

-- concept2cure_review_assignments (14 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_review_assignments_org
  ON concept2cure_review_assignments(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_review_assignments_user
  ON concept2cure_review_assignments(user_id);

-- workflow_approvals (12 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_approvals_org
  ON workflow_approvals(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_approvals_org_status
  ON workflow_approvals(organization_id, status);

-- document_workflows (11 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_workflows_org
  ON document_workflows(organization_id);

-- document_versions (11 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_versions_doc
  ON document_versions(document_id);

-- concept2cure_artifact_versions (12 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_artifact_versions_artifact
  ON concept2cure_artifact_versions(artifact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_artifact_versions_org
  ON concept2cure_artifact_versions(organization_id);

-- ============================================================================
-- TIER 3: Intelligence & notification tables
-- ============================================================================

-- concept2cure_notifications (11 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_notifications_org_user
  ON concept2cure_notifications(organization_id, user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_notifications_read
  ON concept2cure_notifications(user_id, is_read);

-- project_intelligence_profiles (13 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proj_intel_profiles_org
  ON project_intelligence_profiles(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proj_intel_profiles_project
  ON project_intelligence_profiles(project_id);

-- project_memory_entries (knowledge atoms, heavily queried for AI context)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proj_memory_entries_org
  ON project_memory_entries(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proj_memory_entries_project
  ON project_memory_entries(project_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proj_memory_entries_category
  ON project_memory_entries(project_id, category);

-- regulatory_audit_logs (9 queries — compliance requirement)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reg_audit_logs_org
  ON regulatory_audit_logs(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reg_audit_logs_org_created
  ON regulatory_audit_logs(organization_id, created_at DESC);

-- ============================================================================
-- TIER 4: Submission & quality tables
-- ============================================================================

-- c2c_submission_packages (13 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_submissions_org
  ON c2c_submission_packages(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_submissions_org_status
  ON c2c_submission_packages(organization_id, status);

-- c2c_blockers (12 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_blockers_org
  ON c2c_blockers(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_c2c_blockers_project
  ON c2c_blockers(project_id);

-- quality_management_plans (14 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qmp_org
  ON quality_management_plans(organization_id);

-- coauthor_documents (10 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coauthor_docs_org
  ON coauthor_documents(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_coauthor_docs_org_project
  ON coauthor_documents(organization_id, project_id);

-- unified_tasks (14 queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unified_tasks_org
  ON unified_tasks(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unified_tasks_org_status
  ON unified_tasks(organization_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unified_tasks_assignee
  ON unified_tasks(assigned_to);

-- ============================================================================
-- TIER 5: Auth / billing / stripe
-- ============================================================================

-- stripe_events
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stripe_events_org
  ON stripe_events(organization_id);

-- deep_research_jobs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deep_research_jobs_org
  ON deep_research_jobs(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deep_research_jobs_org_status
  ON deep_research_jobs(organization_id, status);

-- organization_users
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_users_org
  ON organization_users(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_users_user
  ON organization_users(user_id);

-- audit_logs (generic)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_org
  ON audit_logs(organization_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_org_created
  ON audit_logs(organization_id, created_at DESC);
