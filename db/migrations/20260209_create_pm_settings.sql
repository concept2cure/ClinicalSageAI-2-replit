-- =============================================================================
-- Phase 5: PM Settings & Configuration (Week 6)
-- Date: 2026-02-09
-- Purpose: Organization-specific project management AI settings
-- =============================================================================

-- Create pm_settings table
CREATE TABLE IF NOT EXISTS pm_settings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ai_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  notification_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  compliance_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  therapeutic_area_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id),
  CONSTRAINT unique_pm_settings_org UNIQUE (organization_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pm_settings_org ON pm_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_pm_settings_updated ON pm_settings(updated_at DESC);

-- Comment on table and columns
COMMENT ON TABLE pm_settings IS 'Organization-specific PM settings for AI behavior, workflows, notifications, compliance, and therapeutic areas';
COMMENT ON COLUMN pm_settings.ai_settings IS 'AI behavior settings: tone, riskTolerance, citationPreference';
COMMENT ON COLUMN pm_settings.workflow_settings IS 'Workflow settings: defaultSubmissionType, reviewCadenceDays, requireSecondReviewer';
COMMENT ON COLUMN pm_settings.notification_settings IS 'Notification preferences: emailDigest, notifyOnRiskDetection, notifyOnSubmissionMilestones';
COMMENT ON COLUMN pm_settings.compliance_settings IS 'Compliance settings: part11Enabled, auditTrailRetentionDays, redactionMode';
COMMENT ON COLUMN pm_settings.therapeutic_area_settings IS 'Therapeutic area configuration: primaryArea, secondaryAreas';

-- =============================================================================
-- Audit Trail Trigger
-- =============================================================================

-- Function to audit pm_settings changes
CREATE OR REPLACE FUNCTION audit_pm_settings_changes()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO audit_logs (
      tenant_id,
      user_id,
      action,
      table_name,
      record_id,
      old_values,
      new_values,
      created_at
    ) VALUES (
      NEW.organization_id,
      NEW.updated_by,
      TG_OP,
      'pm_settings',
      NEW.id::text,
      CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
      row_to_json(NEW),
      NOW()
    );
  EXCEPTION WHEN undefined_column OR not_null_violation THEN
    BEGIN
      INSERT INTO audit_logs (
        tenant_id,
        user_id,
        action,
        table_name,
        record_id,
        created_at
      ) VALUES (
        NEW.organization_id,
        NEW.updated_by,
        TG_OP,
        'pm_settings',
        NEW.id::text,
        NOW()
      );
    EXCEPTION WHEN undefined_column OR not_null_violation THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for INSERT and UPDATE operations
DROP TRIGGER IF EXISTS pm_settings_audit_trigger ON pm_settings;
CREATE TRIGGER pm_settings_audit_trigger
  AFTER INSERT OR UPDATE ON pm_settings
  FOR EACH ROW
  EXECUTE FUNCTION audit_pm_settings_changes();

-- =============================================================================
-- Row-Level Security (RLS)
-- =============================================================================

-- Enable RLS on pm_settings
ALTER TABLE pm_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policy (if not already exists from database/policies/rls-policies.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'pm_settings' AND policyname = 'pm_settings_tenant_policy'
  ) THEN
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
END $$;

-- =============================================================================
-- Seed Default Settings for Existing Organizations
-- =============================================================================

-- Insert default pm_settings for organizations that don't have settings yet
INSERT INTO pm_settings (
  organization_id,
  ai_settings,
  workflow_settings,
  notification_settings,
  compliance_settings,
  therapeutic_area_settings
)
SELECT
  id,
  '{"tone": "regulatory", "riskTolerance": "moderate", "citationPreference": "primary_sources"}'::jsonb,
  '{"defaultSubmissionType": "IND", "reviewCadenceDays": 7, "requireSecondReviewer": true}'::jsonb,
  '{"emailDigest": "daily", "notifyOnRiskDetection": true, "notifyOnSubmissionMilestones": true}'::jsonb,
  '{"part11Enabled": true, "auditTrailRetentionDays": 3650, "redactionMode": "auto"}'::jsonb,
  '{"primaryArea": "oncology", "secondaryAreas": []}'::jsonb
FROM organizations
WHERE NOT EXISTS (
  SELECT 1 FROM pm_settings WHERE pm_settings.organization_id = organizations.id
)
ON CONFLICT (organization_id) DO NOTHING;

-- =============================================================================
-- Verification Queries (for manual testing)
-- =============================================================================

-- Verify table creation
-- SELECT COUNT(*) as pm_settings_count FROM pm_settings;

-- Verify RLS policy
-- SELECT tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'pm_settings';

-- Verify audit trigger
-- SELECT tgname, tgtype, tgenabled
-- FROM pg_trigger
-- WHERE tgrelid = 'pm_settings'::regclass;

-- View default settings for all orgs
-- SELECT
--   ps.organization_id,
--   o.name as org_name,
--   ps.ai_settings,
--   ps.workflow_settings,
--   ps.notification_settings,
--   ps.updated_at
-- FROM pm_settings ps
-- JOIN organizations o ON ps.organization_id = o.id
-- ORDER BY o.name;

-- =============================================================================
-- End of migration
-- =============================================================================
