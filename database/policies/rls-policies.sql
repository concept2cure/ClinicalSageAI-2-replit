-- Roadmap Step 1.8: Row-Level Security Policies
-- Applies tenant isolation using app.current_tenant_id and app.current_user_role.

DO $$
BEGIN
  -- Organizations
  IF to_regclass('public.organizations') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'organizations_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
      CREATE POLICY organizations_tenant_policy ON organizations
        FOR ALL
        USING (
          id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Client workspaces
  IF to_regclass('public.client_workspaces') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'client_workspaces_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE client_workspaces ENABLE ROW LEVEL SECURITY;
      CREATE POLICY client_workspaces_tenant_policy ON client_workspaces
        FOR ALL
        USING (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Client access
  IF to_regclass('public.client_access') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'client_access_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE client_access ENABLE ROW LEVEL SECURITY;
      CREATE POLICY client_access_tenant_policy ON client_access
        FOR ALL
        USING (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Client workspace settings
  IF to_regclass('public.client_workspace_settings') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'client_workspace_settings_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE client_workspace_settings ENABLE ROW LEVEL SECURITY;
      CREATE POLICY client_workspace_settings_tenant_policy ON client_workspace_settings
        FOR ALL
        USING (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Client security settings
  IF to_regclass('public.client_security_settings') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'client_security_settings_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE client_security_settings ENABLE ROW LEVEL SECURITY;
      CREATE POLICY client_security_settings_tenant_policy ON client_security_settings
        FOR ALL
        USING (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Projects
  IF to_regclass('public.projects') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'projects_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
      CREATE POLICY projects_tenant_policy ON projects
        FOR ALL
        USING (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- PM settings
  IF to_regclass('public.pm_settings') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'pm_settings_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE pm_settings ENABLE ROW LEVEL SECURITY;
      CREATE POLICY pm_settings_tenant_policy ON pm_settings
        FOR ALL
        USING (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Communication channels
  IF to_regclass('public.communication_channels') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'communication_channels_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE communication_channels ENABLE ROW LEVEL SECURITY;
      CREATE POLICY communication_channels_tenant_policy ON communication_channels
        FOR ALL
        USING (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Communication messages
  IF to_regclass('public.communication_messages') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'communication_messages_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE communication_messages ENABLE ROW LEVEL SECURITY;
      CREATE POLICY communication_messages_tenant_policy ON communication_messages
        FOR ALL
        USING (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- FDA communications
  IF to_regclass('public.fda_communications') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'fda_communications_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE fda_communications ENABLE ROW LEVEL SECURITY;
      CREATE POLICY fda_communications_tenant_policy ON fda_communications
        FOR ALL
        USING (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Risk detections (scoped via projects)
  IF to_regclass('public.risk_detections') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'risk_detections_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE risk_detections ENABLE ROW LEVEL SECURITY;
      CREATE POLICY risk_detections_tenant_policy ON risk_detections
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = project_id
              AND p.organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          )
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = project_id
              AND p.organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          )
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Project predictions (scoped via projects)
  IF to_regclass('public.project_predictions') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'project_predictions_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE project_predictions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY project_predictions_tenant_policy ON project_predictions
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = project_id
              AND p.organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          )
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = project_id
              AND p.organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          )
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Documents
  IF to_regclass('public.documents') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'documents_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
      CREATE POLICY documents_tenant_policy ON documents
        FOR ALL
        USING (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Document versions (scoped via documents)
  IF to_regclass('public.document_versions') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'document_versions_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY document_versions_tenant_policy ON document_versions
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_id
              AND d.organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          )
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_id
              AND d.organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          )
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;

  -- Document audit trail
  IF to_regclass('public.document_audit_trail') IS NOT NULL THEN
    PERFORM 1 FROM pg_policies WHERE polname = 'document_audit_trail_tenant_policy';
    IF NOT FOUND THEN
      ALTER TABLE document_audit_trail ENABLE ROW LEVEL SECURITY;
      CREATE POLICY document_audit_trail_tenant_policy ON document_audit_trail
        FOR ALL
        USING (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        )
        WITH CHECK (
          organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
          OR organization_id = 0
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
        );
    END IF;
  END IF;
END $$;
