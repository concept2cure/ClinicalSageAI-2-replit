-- Create MAUD validation tables for persisting validation results
-- This migration adds proper GA-ready persistence for the MAUD integration

-- First, create a table to store information about MAUD algorithms
CREATE TABLE IF NOT EXISTS maud_algorithms (
  id SERIAL PRIMARY KEY,
  algorithm_id VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  validation_level VARCHAR(50),
  regulatory_frameworks JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for algorithm queries
CREATE INDEX IF NOT EXISTS idx_maud_algorithms_algorithm_id ON maud_algorithms(algorithm_id);
CREATE INDEX IF NOT EXISTS idx_maud_algorithms_validation_level ON maud_algorithms(validation_level);

-- Create a table to store validation results
CREATE TABLE IF NOT EXISTS maud_validations (
  id SERIAL PRIMARY KEY,
  validation_id VARCHAR(255) NOT NULL UNIQUE,
  document_id VARCHAR(255) NOT NULL,
  organization_id VARCHAR(255),  -- For multi-tenant support
  status VARCHAR(50) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  score INTEGER,
  validator_name VARCHAR(255),
  validator_version VARCHAR(50),
  regulatory_frameworks JSONB,
  algorithms_used JSONB,
  validation_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_maud_validations_document_id ON maud_validations(document_id);
CREATE INDEX IF NOT EXISTS idx_maud_validations_status ON maud_validations(status);
CREATE INDEX IF NOT EXISTS idx_maud_validations_organization_id ON maud_validations(organization_id);

-- Add a timestamp-based index for quick historical lookups
CREATE INDEX IF NOT EXISTS idx_maud_validations_timestamp ON maud_validations(timestamp DESC);

-- Create a compound index for organization + document lookups
CREATE INDEX IF NOT EXISTS idx_maud_validations_org_doc ON maud_validations(organization_id, document_id);

-- Create a table to track validation requests in progress
CREATE TABLE IF NOT EXISTS maud_validation_requests (
  id SERIAL PRIMARY KEY,
  request_id VARCHAR(255) NOT NULL UNIQUE,
  document_id VARCHAR(255) NOT NULL,
  organization_id VARCHAR(255),  -- For multi-tenant support
  status VARCHAR(50) NOT NULL,
  algorithms JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  estimated_completion_time TIMESTAMP WITH TIME ZONE
);

-- Create indexes for validation requests
CREATE INDEX IF NOT EXISTS idx_maud_validation_requests_document_id ON maud_validation_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_maud_validation_requests_status ON maud_validation_requests(status);
CREATE INDEX IF NOT EXISTS idx_maud_validation_requests_organization_id ON maud_validation_requests(organization_id);

-- Create a function to update the 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to update timestamps on data changes
CREATE TRIGGER maud_algorithms_updated
BEFORE UPDATE ON maud_algorithms
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER maud_validations_updated
BEFORE UPDATE ON maud_validations
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER maud_validation_requests_updated
BEFORE UPDATE ON maud_validation_requests
FOR EACH ROW EXECUTE FUNCTION update_timestamp();