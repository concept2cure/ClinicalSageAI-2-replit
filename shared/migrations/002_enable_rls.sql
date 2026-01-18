-- Apply to ALL regulatory tables
ALTER TABLE regulatory_atoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE cerv2_510k_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON regulatory_atoms;
DROP POLICY IF EXISTS admin_override ON regulatory_atoms;
ALTER TABLE workbench_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cerv2_claims ENABLE ROW LEVEL SECURITY;

-- Isolation by organization
CREATE POLICY org_isolation ON regulatory_atoms
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id', true)::int);

-- Allow admins to see all when app flag is set
CREATE POLICY admin_override ON regulatory_atoms
  FOR ALL
  USING (current_setting('app.is_admin', true) = 'true');
