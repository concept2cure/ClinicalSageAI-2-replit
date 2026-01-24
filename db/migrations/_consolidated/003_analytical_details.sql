-- Migration 003: Analytical Details - Files & Change Control
-- Created: 2025-08-21
-- Purpose: Add method files and change control tracking

-- Files attached to a method
CREATE TABLE IF NOT EXISTS analytical_method_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id UUID NOT NULL,
  organization_id INTEGER NOT NULL DEFAULT 7,
  file_name TEXT NOT NULL,
  url TEXT,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  file_size BIGINT,
  file_type VARCHAR(50),
  
  INDEX idx_method_files_method (method_id),
  INDEX idx_method_files_org (organization_id)
);

-- Simple change-control records linked to a method
CREATE TABLE IF NOT EXISTS analytical_change_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL,
  method_id UUID,
  organization_id INTEGER NOT NULL DEFAULT 7,
  title TEXT NOT NULL,
  reason TEXT,
  status TEXT CHECK (status IN ('OPEN','IN_REVIEW','APPROVED','REJECTED','IMPLEMENTED')) NOT NULL DEFAULT 'OPEN',
  owner TEXT,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_change_controls_method (method_id),
  INDEX idx_change_controls_org (organization_id),
  INDEX idx_change_controls_status (status)
);

-- Enhanced method gaps table (if not exists)
CREATE TABLE IF NOT EXISTS analytical_method_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id UUID NOT NULL,
  organization_id INTEGER NOT NULL DEFAULT 7,
  rule_id VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('ERROR', 'WARNING', 'INFO')),
  title VARCHAR(500) NOT NULL,
  why TEXT,
  section VARCHAR(200),
  status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'WAIVED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_method_gaps_method (method_id),
  INDEX idx_method_gaps_severity (severity),
  INDEX idx_method_gaps_status (status)
);

-- Enhanced method runs table for trending
CREATE TABLE IF NOT EXISTS analytical_method_trend_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id UUID NOT NULL,
  organization_id INTEGER NOT NULL DEFAULT 7,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sst_metric DECIMAL(10,4),
  notes TEXT,
  operator VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_trend_runs_method_date (method_id, run_date DESC),
  INDEX idx_trend_runs_org (organization_id)
);

-- Insert demo files for existing methods
INSERT INTO analytical_method_files (method_id, organization_id, file_name, url, uploaded_by, file_size, file_type)
SELECT 
  id, 
  organization_id,
  CASE 
    WHEN method_name LIKE '%HPLC%' THEN 'HPLC Validation Protocol.pdf'
    WHEN method_name LIKE '%UPLC%' THEN 'UPLC Method Development Report.pdf'
    WHEN method_name LIKE '%GC%' THEN 'GC System Suitability SOP.pdf'
    ELSE 'Method Validation Plan.pdf'
  END,
  CASE 
    WHEN method_name LIKE '%HPLC%' THEN 'https://files.trialsage.com/hplc-validation.pdf'
    WHEN method_name LIKE '%UPLC%' THEN 'https://files.trialsage.com/uplc-development.pdf'
    WHEN method_name LIKE '%GC%' THEN 'https://files.trialsage.com/gc-suitability.pdf'
    ELSE 'https://files.trialsage.com/validation-plan.pdf'
  END,
  'Dr. Johnson',
  2048576,
  'application/pdf'
FROM analytical_methods 
WHERE organization_id = 7
LIMIT 5
ON CONFLICT DO NOTHING;

-- Insert demo change controls
INSERT INTO analytical_change_controls (product_id, method_id, organization_id, title, reason, owner, due_date, status)
SELECT 
  'DP-001',
  id,
  organization_id,
  CASE 
    WHEN method_name LIKE '%HPLC%' THEN 'Column lot change validation'
    WHEN method_name LIKE '%UPLC%' THEN 'Mobile phase composition update'
    WHEN method_name LIKE '%GC%' THEN 'Detector sensitivity optimization'
    ELSE 'Method parameter adjustment'
  END,
  CASE 
    WHEN method_name LIKE '%HPLC%' THEN 'Supplier discontinued lot A; validate equivalency with lot B'
    WHEN method_name LIKE '%UPLC%' THEN 'Improved separation achieved with modified mobile phase ratio'
    WHEN method_name LIKE '%GC%' THEN 'Enhanced detection limits required for new specification'
    ELSE 'Continuous improvement initiative'
  END,
  'QA Manager',
  NOW() + INTERVAL '21 days',
  CASE 
    WHEN random() < 0.3 THEN 'APPROVED'
    WHEN random() < 0.6 THEN 'IN_REVIEW'
    ELSE 'OPEN'
  END
FROM analytical_methods 
WHERE organization_id = 7
LIMIT 3
ON CONFLICT DO NOTHING;

-- Insert demo validation gaps
INSERT INTO analytical_method_gaps (method_id, organization_id, rule_id, severity, title, why, section)
SELECT 
  id,
  organization_id,
  CASE 
    WHEN method_name LIKE '%HPLC%' THEN 'Q2_LINEARITY'
    WHEN method_name LIKE '%UPLC%' THEN 'Q14_LIFECYCLE'
    WHEN method_name LIKE '%GC%' THEN 'Q2_SPECIFICITY'
    ELSE 'Q2_ACCURACY'
  END,
  'ERROR',
  CASE 
    WHEN method_name LIKE '%HPLC%' THEN 'Linearity validation incomplete'
    WHEN method_name LIKE '%UPLC%' THEN 'Lifecycle management plan missing'
    WHEN method_name LIKE '%GC%' THEN 'Specificity not demonstrated'
    ELSE 'Accuracy studies pending'
  END,
  CASE 
    WHEN method_name LIKE '%HPLC%' THEN 'Correlation coefficient r ≥ 0.99 required per ICH Q2(R1)'
    WHEN method_name LIKE '%UPLC%' THEN 'Analytical lifecycle management plan required per ICH Q14'
    WHEN method_name LIKE '%GC%' THEN 'Matrix interference studies incomplete'
    ELSE 'Recovery studies at multiple concentration levels required'
  END,
  'Analytical Validation'
FROM analytical_methods 
WHERE organization_id = 7 AND validation_status != 'APPROVED'
LIMIT 5
ON CONFLICT DO NOTHING;

-- Insert demo trending runs
INSERT INTO analytical_method_trend_runs (method_id, organization_id, run_date, sst_metric, notes, operator)
SELECT 
  id,
  organization_id,
  CURRENT_DATE - (generate_series(1, 10) || ' days')::INTERVAL,
  CASE 
    WHEN method_name LIKE '%HPLC%' THEN 2800 + (random() * 200)
    WHEN method_name LIKE '%UPLC%' THEN 1900 + (random() * 100)
    WHEN method_name LIKE '%GC%' THEN 3200 + (random() * 150)
    ELSE 2500 + (random() * 300)
  END,
  CASE 
    WHEN random() < 0.3 THEN 'System suitability passed'
    WHEN random() < 0.6 THEN 'Minor baseline drift observed'
    ELSE NULL
  END,
  CASE 
    WHEN random() < 0.5 THEN 'Analyst A'
    ELSE 'Analyst B'
  END
FROM analytical_methods 
WHERE organization_id = 7
LIMIT 3
ON CONFLICT DO NOTHING;

COMMENT ON TABLE analytical_method_files IS 'Files and documents attached to analytical methods';
COMMENT ON TABLE analytical_change_controls IS 'Change control records for method modifications';
COMMENT ON TABLE analytical_method_gaps IS 'ICH Q2/Q14 validation gaps tracking';
COMMENT ON TABLE analytical_method_trend_runs IS 'System suitability trending data';