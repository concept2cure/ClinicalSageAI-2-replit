/**
 * Harvest Rules for IND Wizard
 * 
 * This schema defines a flexible rule system for automatically populating
 * IND sections with content from source documents.
 * 
 * Rule syntax example:
 * {
 *   "condition": "section=='3.2.P.5.4' && !hasTable('MethodValidation')",
 *   "action": "pullTable(source='vault', docType='Validation Report', tableId='MethodValidation')"
 * }
 */

-- Rules table for data harvesting
CREATE TABLE IF NOT EXISTS harvest_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  section_code TEXT NOT NULL,
  rule_json JSONB NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Rule execution history for audit and debugging
CREATE TABLE IF NOT EXISTS harvest_rule_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES harvest_rules(id),
  submission_id UUID NOT NULL,
  section_code TEXT NOT NULL,
  execution_result JSONB,
  success BOOLEAN,
  block_ids_created TEXT[],
  execution_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient rule lookup by section
CREATE INDEX IF NOT EXISTS idx_harvest_rules_section ON harvest_rules(section_code, enabled);

-- Trigger for updating timestamp
CREATE OR REPLACE FUNCTION update_harvest_rules_updated_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_harvest_rules_timestamp
BEFORE UPDATE ON harvest_rules
FOR EACH ROW EXECUTE PROCEDURE update_harvest_rules_updated_timestamp();

-- Insert example rules
INSERT INTO harvest_rules (section_code, rule_json, enabled, priority) VALUES
('3.2.P.5.4', 
 '{"condition": "section==''3.2.P.5.4'' && !hasTable(''MethodValidation'')", 
   "action": "pullTable(source=''vault'', docType=''Validation Report'', tableId=''MethodValidation'')"}',
 TRUE, 10),
('2.7.4', 
 '{"condition": "section==''2.7.4'' && !hasTable(''SafetySummary'')", 
   "action": "pullTable(source=''vault'', docType=''CSR'', tableId=''SafetySummary'')"}',
 TRUE, 10),
('3.2.P.8.3', 
 '{"condition": "section==''3.2.P.8.3'' && !hasTable(''StabilityData'')", 
   "action": "pullTable(source=''vault'', docType=''Stability Report'', tableId=''StabilityData'')"}',
 TRUE, 10)
ON CONFLICT DO NOTHING;