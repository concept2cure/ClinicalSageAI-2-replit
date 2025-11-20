-- eCTD 4.0 Compliance Enhancement Migration
-- Adds Context of Use, Lifecycle Management, and Source Data Reference fields
-- Implements regulatory mandate requirements from Section 2.2 and Table 2

-- Add Context of Use fields for regulatory purpose tracking (Mandate Section 2.2)
ALTER TABLE components ADD COLUMN IF NOT EXISTS context_of_use TEXT;
ALTER TABLE components ADD COLUMN IF NOT EXISTS context_group TEXT;
ALTER TABLE components ADD COLUMN IF NOT EXISTS controlled_vocabulary JSONB;

-- Add Lifecycle Management fields for eCTD 4.0 operations
ALTER TABLE components ADD COLUMN IF NOT EXISTS lifecycle_state TEXT DEFAULT 'new';
ALTER TABLE components ADD COLUMN IF NOT EXISTS replaced_udi TEXT;
ALTER TABLE components ADD COLUMN IF NOT EXISTS replacement_mapping JSONB;

-- Add Source Data Reference fields for data lineage (Mandate Table 2)
ALTER TABLE components ADD COLUMN IF NOT EXISTS source_data_reference JSONB;
ALTER TABLE components ADD COLUMN IF NOT EXISTS data_traceability JSONB;

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS component_context_of_use_idx ON components(context_of_use);
CREATE INDEX IF NOT EXISTS component_lifecycle_state_idx ON components(lifecycle_state);

-- Add comments for documentation
COMMENT ON COLUMN components.context_of_use IS 'Regulatory purpose: clinical, quality, nonclinical, administrative';
COMMENT ON COLUMN components.context_group IS 'Combined COU + keywords for accurate eCTD section placement';
COMMENT ON COLUMN components.controlled_vocabulary IS 'Enforced metadata governance terms';
COMMENT ON COLUMN components.lifecycle_state IS 'eCTD operation state: new, replace, delete';
COMMENT ON COLUMN components.replaced_udi IS 'UDI of component being replaced in lifecycle operation';
COMMENT ON COLUMN components.replacement_mapping IS '1-to-N content replacement relationships';
COMMENT ON COLUMN components.source_data_reference IS 'Links to LIMS, CDISC datasets, and raw data sources';
COMMENT ON COLUMN components.data_traceability IS 'Complete data lineage tracking for regulatory compliance';