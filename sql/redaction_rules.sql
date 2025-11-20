-- TrialSage Vault - Redaction Rules Schema

-- Redaction Patterns Table
CREATE TABLE IF NOT EXISTS redaction_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  pattern TEXT NOT NULL,
  replacement TEXT NOT NULL,
  priority INTEGER DEFAULT 100,
  is_regex BOOLEAN DEFAULT TRUE,
  is_global BOOLEAN DEFAULT TRUE,
  case_sensitive BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID
);

-- Document Type Redaction Rules
CREATE TABLE IF NOT EXISTS document_type_redaction_rules (
  document_type_id VARCHAR(50) REFERENCES document_types(id),
  redaction_pattern_id UUID REFERENCES redaction_patterns(id),
  enabled BOOLEAN DEFAULT TRUE,
  priority_override INTEGER,
  PRIMARY KEY (document_type_id, redaction_pattern_id)
);

-- Document Subtype Redaction Rules (More specific than type)
CREATE TABLE IF NOT EXISTS document_subtype_redaction_rules (
  document_subtype_id VARCHAR(50) REFERENCES document_subtypes(id),
  redaction_pattern_id UUID REFERENCES redaction_patterns(id),
  enabled BOOLEAN DEFAULT TRUE,
  priority_override INTEGER,
  PRIMARY KEY (document_subtype_id, redaction_pattern_id)
);

-- Tenant Redaction Rules (Organization specific rules)
CREATE TABLE IF NOT EXISTS tenant_redaction_rules (
  tenant_id UUID NOT NULL,
  redaction_pattern_id UUID REFERENCES redaction_patterns(id),
  enabled BOOLEAN DEFAULT TRUE,
  priority_override INTEGER,
  PRIMARY KEY (tenant_id, redaction_pattern_id)
);

-- Redaction Log for auditing
CREATE TABLE IF NOT EXISTS redaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id INTEGER NOT NULL REFERENCES documents(id),
  version_id UUID REFERENCES document_versions(id),
  inspector_token_id UUID REFERENCES inspector_tokens(id),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  patterns_applied INTEGER NOT NULL,
  matches_found INTEGER NOT NULL,
  execution_time_ms INTEGER,
  inspector_ip TEXT,
  inspector_user_agent TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_redaction_patterns_priority ON redaction_patterns(priority);
CREATE INDEX IF NOT EXISTS idx_document_type_redaction_rules ON document_type_redaction_rules(document_type_id);
CREATE INDEX IF NOT EXISTS idx_document_subtype_redaction_rules ON document_subtype_redaction_rules(document_subtype_id);
CREATE INDEX IF NOT EXISTS idx_tenant_redaction_rules ON tenant_redaction_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_redaction_logs_document ON redaction_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_redaction_logs_inspector ON redaction_logs(inspector_token_id);

-- Insert default redaction patterns
INSERT INTO redaction_patterns (name, description, pattern, replacement, priority, is_regex)
VALUES 
  ('US Social Security Number', 'Redacts US Social Security Numbers in XXX-XX-XXXX format', '\\b\\d{3}-\\d{2}-\\d{4}\\b', '[REDACTED-SSN]', 10, TRUE),
  ('US Phone Number', 'Redacts US phone numbers in various formats', '\\b\\(\\d{3}\\)\\s?\\d{3}[-]?\\d{4}\\b|\\b\\d{3}[-]?\\d{3}[-]?\\d{4}\\b', '[REDACTED-PHONE]', 20, TRUE),
  ('Email Address', 'Redacts email addresses', '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b', '[REDACTED-EMAIL]', 30, TRUE),
  ('Credit Card Number', 'Redacts 16-digit credit card numbers', '\\b(?:\\d{4}[- ]?){3}\\d{4}\\b', '[REDACTED-CC]', 40, TRUE),
  ('Patient ID', 'Redacts patient ID numbers', 'Patient\\s?(?:ID|Id|id)?:\\s?[A-Z0-9-]+', 'Patient ID: [REDACTED-ID]', 50, TRUE),
  ('Doctor Name', 'Redacts doctor names with titles', 'Dr\\.\\s[A-Z][a-z]+ [A-Z][a-z]+', '[REDACTED-NAME]', 60, TRUE),
  ('Date of Birth', 'Redacts DOB in MM/DD/YYYY format', '\\b(0[1-9]|1[0-2])/(0[1-9]|[12]\\d|3[01])/(19|20)\\d{2}\\b', '[REDACTED-DOB]', 70, TRUE),
  ('IP Address', 'Redacts IP addresses', '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', '[REDACTED-IP]', 80, TRUE),
  ('Address Line', 'Redacts street addresses', '\\d+\\s+[A-Za-z0-9\\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct)\\b', '[REDACTED-ADDRESS]', 90, TRUE),
  ('Age Over 89', 'Redacts ages over 89 (HIPAA requirement)', '\\b(?:9\\d|1\\d{2,})\\s+(?:years? old|yrs?(?:\\s+old)?)\\b', '[REDACTED-AGE]', 100, TRUE)
ON CONFLICT DO NOTHING;

-- Associate default patterns with document types
-- For example, connecting PHI-focused patterns to clinical documents
INSERT INTO document_type_redaction_rules (document_type_id, redaction_pattern_id, enabled)
SELECT 
  'clinical' AS document_type_id,
  id AS redaction_pattern_id,
  TRUE AS enabled
FROM 
  redaction_patterns
WHERE
  name IN ('US Social Security Number', 'Patient ID', 'Doctor Name', 'Date of Birth', 'Age Over 89')
ON CONFLICT DO NOTHING;

-- Add function to get applicable redaction patterns for a document
CREATE OR REPLACE FUNCTION get_document_redaction_patterns(doc_id INTEGER)
RETURNS TABLE (
  pattern_id UUID,
  pattern TEXT,
  replacement TEXT,
  priority INTEGER,
  is_regex BOOLEAN,
  is_global BOOLEAN,
  case_sensitive BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH document_info AS (
    SELECT 
      d.id,
      d.document_type_id,
      d.document_subtype_id,
      d.tenant_id
    FROM 
      documents d
    WHERE 
      d.id = doc_id
  )
  SELECT DISTINCT ON (rp.id)
    rp.id AS pattern_id,
    rp.pattern,
    rp.replacement,
    COALESCE(
      dsr.priority_override,
      dtr.priority_override,
      tr.priority_override,
      rp.priority
    ) AS priority,
    rp.is_regex,
    rp.is_global,
    rp.case_sensitive
  FROM 
    redaction_patterns rp
  LEFT JOIN 
    document_info di ON TRUE
  LEFT JOIN
    document_subtype_redaction_rules dsr ON dsr.redaction_pattern_id = rp.id AND dsr.document_subtype_id = di.document_subtype_id AND dsr.enabled = TRUE
  LEFT JOIN
    document_type_redaction_rules dtr ON dtr.redaction_pattern_id = rp.id AND dtr.document_type_id = di.document_type_id AND dtr.enabled = TRUE
  LEFT JOIN
    tenant_redaction_rules tr ON tr.redaction_pattern_id = rp.id AND tr.tenant_id = di.tenant_id AND tr.enabled = TRUE
  WHERE
    dsr.enabled = TRUE OR dtr.enabled = TRUE OR tr.enabled = TRUE
  ORDER BY 
    rp.id, priority;
END;
$$ LANGUAGE plpgsql;