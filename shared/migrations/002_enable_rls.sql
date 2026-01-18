-- Apply to ALL regulatory tables
ALTER TABLE regulatory_atoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE cerv2_510k_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Isolation by organization
CREATE POLICY org_isolation ON regulatory_atoms
  FOR ALL
  USING (organization_id = current_setting('app.current_org_id')::int);

-- Allow admins to see all
CREATE POLICY admin_override ON regulatory_atoms
  FOR ALL
  TO admin
  USING (true);
