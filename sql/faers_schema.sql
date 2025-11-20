-- FAERS Reports Schema for TrialSage CER Module

-- Table: faers_reports
-- Stores FDA Adverse Event Reporting System (FAERS) data for medical products
CREATE TABLE IF NOT EXISTS faers_reports (
  id SERIAL PRIMARY KEY,
  product_name VARCHAR(255) NOT NULL,
  substance_name VARCHAR(255),
  unii_code VARCHAR(100),  -- Unique Ingredient Identifier
  reaction VARCHAR(255) NOT NULL,
  is_serious BOOLEAN DEFAULT FALSE,
  outcome_type VARCHAR(100),
  report_date DATE,
  patient_age INTEGER,
  patient_sex VARCHAR(10),
  report_id VARCHAR(100),  -- Original FDA report ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster searches by product name
CREATE INDEX IF NOT EXISTS idx_faers_product_name 
  ON faers_reports (product_name);

-- Index for faster searches by UNII code
CREATE INDEX IF NOT EXISTS idx_faers_unii_code 
  ON faers_reports (unii_code);

-- Index for filtering by serious events
CREATE INDEX IF NOT EXISTS idx_faers_is_serious 
  ON faers_reports (is_serious);

-- Table: faers_cached_analyses
-- Stores pre-computed analyses for faster retrieval
CREATE TABLE IF NOT EXISTS faers_cached_analyses (
  id SERIAL PRIMARY KEY,
  product_name VARCHAR(255) NOT NULL UNIQUE,
  total_reports INTEGER,
  serious_events INTEGER,
  risk_score NUMERIC(5,2),
  severity_assessment VARCHAR(50),
  top_reactions JSONB,
  demographics JSONB,
  report_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  cache_expires_at TIMESTAMP WITH TIME ZONE
);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update the updated_at column
CREATE TRIGGER update_faers_reports_updated_at
    BEFORE UPDATE ON faers_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_faers_cached_analyses_updated_at
    BEFORE UPDATE ON faers_cached_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
