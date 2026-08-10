-- Performance Optimization: Add missing indexes on hot-path tables
-- These indexes target the top 30 most-queried tables, focusing on:
--   1. organizationId (tenant isolation — every query filters by org)
--   2. projectId (most queries are project-scoped)
--   3. status + type columns (common WHERE filters)
--   4. createdAt DESC (pagination/ordering)
--
-- All indexes use IF NOT EXISTS for idempotent application.
-- All statements are wrapped in DO blocks that verify table and column existence
-- before attempting index creation, making the migration safe against any schema.

DO $$ BEGIN
  IF to_regclass('public.csr_reports') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'csr_reports' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_csr_reports_org ON csr_reports(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.csr_reports') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'csr_reports' AND column_name IN ('organization_id', 'status'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_csr_reports_org_status ON csr_reports(organization_id, status);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_artifacts') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_artifacts' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_artifacts_org ON concept2cure_artifacts(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_artifacts') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_artifacts' AND column_name IN ('organization_id', 'project_id'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_artifacts_org_project ON concept2cure_artifacts(organization_id, project_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_artifacts') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_artifacts' AND column_name IN ('organization_id', 'artifact_type'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_artifacts_org_type ON concept2cure_artifacts(organization_id, artifact_type);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.users') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.users') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email')
  THEN
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.projects') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.projects') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name IN ('organization_id', 'status'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_projects_org_status ON projects(organization_id, status);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.csr_details') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'csr_details' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_csr_details_org ON csr_details(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.csr_details') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'csr_details' AND column_name = 'report_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_csr_details_report ON csr_details(report_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.documents') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.documents') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name IN ('organization_id', 'project_id'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_documents_org_project ON documents(organization_id, project_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_review_threads') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_review_threads' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_review_threads_org ON concept2cure_review_threads(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_review_threads') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_review_threads' AND column_name = 'artifact_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_review_threads_artifact ON concept2cure_review_threads(artifact_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_review_tasks') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_review_tasks' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_review_tasks_org ON concept2cure_review_tasks(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_review_tasks') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_review_tasks' AND column_name IN ('organization_id', 'status'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_review_tasks_org_status ON concept2cure_review_tasks(organization_id, status);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_review_assignments') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_review_assignments' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_review_assignments_org ON concept2cure_review_assignments(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_review_assignments') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_review_assignments' AND column_name = 'user_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_review_assignments_user ON concept2cure_review_assignments(user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.workflow_approvals') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'workflow_approvals' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_workflow_approvals_org ON workflow_approvals(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.workflow_approvals') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'workflow_approvals' AND column_name IN ('organization_id', 'status'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_workflow_approvals_org_status ON workflow_approvals(organization_id, status);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.document_workflows') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'document_workflows' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_document_workflows_org ON document_workflows(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.document_versions') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'document_versions' AND column_name = 'document_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_artifact_versions') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_artifact_versions' AND column_name = 'artifact_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_artifact_versions_artifact ON concept2cure_artifact_versions(artifact_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_artifact_versions') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_artifact_versions' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_artifact_versions_org ON concept2cure_artifact_versions(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_notifications') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_notifications' AND column_name IN ('organization_id', 'user_id'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_notifications_org_user ON concept2cure_notifications(organization_id, user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.concept2cure_notifications') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'concept2cure_notifications' AND column_name IN ('user_id', 'is_read'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_notifications_read ON concept2cure_notifications(user_id, is_read);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.project_intelligence_profiles') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'project_intelligence_profiles' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_proj_intel_profiles_org ON project_intelligence_profiles(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.project_intelligence_profiles') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'project_intelligence_profiles' AND column_name = 'project_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_proj_intel_profiles_project ON project_intelligence_profiles(project_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.project_memory_entries') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'project_memory_entries' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_proj_memory_entries_org ON project_memory_entries(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.project_memory_entries') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'project_memory_entries' AND column_name = 'project_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_proj_memory_entries_project ON project_memory_entries(project_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.project_memory_entries') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'project_memory_entries' AND column_name IN ('project_id', 'category'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_proj_memory_entries_category ON project_memory_entries(project_id, category);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.regulatory_audit_logs') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'regulatory_audit_logs' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_reg_audit_logs_org ON regulatory_audit_logs(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.regulatory_audit_logs') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'regulatory_audit_logs' AND column_name IN ('organization_id', 'created_at'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_reg_audit_logs_org_created ON regulatory_audit_logs(organization_id, created_at DESC);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.c2c_submission_packages') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'c2c_submission_packages' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_submissions_org ON c2c_submission_packages(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.c2c_submission_packages') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'c2c_submission_packages' AND column_name IN ('organization_id', 'status'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_submissions_org_status ON c2c_submission_packages(organization_id, status);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.c2c_blockers') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'c2c_blockers' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_blockers_org ON c2c_blockers(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.c2c_blockers') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'c2c_blockers' AND column_name = 'project_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_c2c_blockers_project ON c2c_blockers(project_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.quality_management_plans') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'quality_management_plans' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_qmp_org ON quality_management_plans(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.coauthor_documents') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'coauthor_documents' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_coauthor_docs_org ON coauthor_documents(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.coauthor_documents') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'coauthor_documents' AND column_name IN ('organization_id', 'project_id'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_coauthor_docs_org_project ON coauthor_documents(organization_id, project_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.unified_tasks') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'unified_tasks' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_unified_tasks_org ON unified_tasks(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.unified_tasks') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'unified_tasks' AND column_name IN ('organization_id', 'status'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_unified_tasks_org_status ON unified_tasks(organization_id, status);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.unified_tasks') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'unified_tasks' AND column_name = 'assigned_to')
  THEN
    CREATE INDEX IF NOT EXISTS idx_unified_tasks_assignee ON unified_tasks(assigned_to);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.stripe_events') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'stripe_events' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_stripe_events_org ON stripe_events(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.deep_research_jobs') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'deep_research_jobs' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_deep_research_jobs_org ON deep_research_jobs(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.deep_research_jobs') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'deep_research_jobs' AND column_name IN ('organization_id', 'status'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_deep_research_jobs_org_status ON deep_research_jobs(organization_id, status);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.organization_users') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'organization_users' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_org_users_org ON organization_users(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.organization_users') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'organization_users' AND column_name = 'user_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_org_users_user ON organization_users(user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'organization_id')
  THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL
     AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name IN ('organization_id', 'created_at'))
  THEN
    CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(organization_id, created_at DESC);
  END IF;
END $$;
