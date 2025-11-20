-- TrialSage Vault - Section Reordering Schema

-- Table to store custom section ordering per submission
CREATE TABLE IF NOT EXISTS ind_section_order (
  submission_id UUID REFERENCES ind_wizards(id),
  section_code TEXT,
  sort_index INT,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID,
  PRIMARY KEY(submission_id, section_code)
);

-- Create index for fast lookup by submission
CREATE INDEX IF NOT EXISTS idx_section_order_submission ON ind_section_order(submission_id);

-- Create view to join with section metadata
CREATE OR REPLACE VIEW vw_section_order AS
SELECT 
  o.submission_id,
  o.section_code,
  o.sort_index,
  s.title AS section_title,
  s.parent_code
FROM 
  ind_section_order o
LEFT JOIN 
  ind_section_definitions s ON o.section_code = s.code;