-- Quality Step 7: Enterprise Pro+ Features
-- Auto-Release Engine, Predictive Analytics, and Regulatory Compliance Monitoring

-- Auto-Release Status tracking
CREATE TABLE IF NOT EXISTS qc_auto_release_status (
  batch_id TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT FALSE,
  last_run TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Auto-Release Rules engine
CREATE TABLE IF NOT EXISTS qc_auto_release_rules (
  rule_id SERIAL PRIMARY KEY,
  batch_id TEXT, -- null means global rule
  rule_name TEXT NOT NULL,
  rule_condition JSONB,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Predictive Quality Analytics
CREATE TABLE IF NOT EXISTS qc_predictions (
  prediction_id SERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL,
  test_name TEXT NOT NULL,
  failure_prob DECIMAL(5,4), -- 0.0000 to 1.0000
  risk_level TEXT CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  recommendation TEXT,
  model_version TEXT DEFAULT 'v1.0',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Regulatory Compliance Monitoring
CREATE TABLE IF NOT EXISTS qc_compliance_history (
  compliance_id SERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL,
  region TEXT NOT NULL,
  compliance_score INTEGER,
  requirements_passed INTEGER,
  requirements_total INTEGER,
  warnings JSONB,
  generated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default auto-release rules
INSERT INTO qc_auto_release_rules (batch_id, rule_name, rule_condition, active) VALUES 
  (NULL, 'All Tests Pass', '{"type": "all_tests_pass"}', TRUE),
  (NULL, 'No OOS Alerts', '{"type": "no_oos_alerts"}', TRUE),
  (NULL, 'Specification Compliance', '{"type": "within_spec_limits"}', TRUE)
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_qc_auto_release_batch ON qc_auto_release_status(batch_id);
CREATE INDEX IF NOT EXISTS idx_qc_predictions_batch ON qc_predictions(batch_id);
CREATE INDEX IF NOT EXISTS idx_qc_compliance_batch_region ON qc_compliance_history(batch_id, region);