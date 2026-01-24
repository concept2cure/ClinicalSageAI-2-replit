-- Sprint 1: Granular Discrepancy Reporting & Basic Remediation Tracking
-- Create regulatory_validation_issues table for persistent storage

CREATE TABLE IF NOT EXISTS regulatory_validation_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    check_id INTEGER,
    session_id TEXT,
    
    -- Granular discrepancy details
    specific_violation TEXT NOT NULL,
    conflicting_requirements TEXT,
    contextual_content_snippet TEXT,
    location_trace TEXT,
    recommended_remediation TEXT,
    ai_confidence_score DECIMAL(5,3),
    impact_assessment TEXT CHECK (impact_assessment IN ('Minor', 'Major', 'Critical')),
    harmonization_opportunity TEXT,
    
    -- Issue management
    status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved')),
    assigned_to_user_id TEXT,
    priority TEXT DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    
    -- Agency-specific details
    affected_agencies TEXT[], -- Array of agency codes
    regulatory_section TEXT,
    compliance_area TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Foreign key constraints (will be added after table creation)
    CONSTRAINT fk_regulatory_validation_issues_tenant 
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_regulatory_validation_issues_tenant_id ON regulatory_validation_issues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_validation_issues_document_id ON regulatory_validation_issues(document_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_validation_issues_status ON regulatory_validation_issues(status);
CREATE INDEX IF NOT EXISTS idx_regulatory_validation_issues_created_at ON regulatory_validation_issues(created_at);
CREATE INDEX IF NOT EXISTS idx_regulatory_validation_issues_session_id ON regulatory_validation_issues(session_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_validation_issues_assigned_to ON regulatory_validation_issues(assigned_to_user_id);

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_regulatory_validation_issues_tenant_document ON regulatory_validation_issues(tenant_id, document_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_validation_issues_tenant_status ON regulatory_validation_issues(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_regulatory_validation_issues_tenant_priority ON regulatory_validation_issues(tenant_id, priority);

-- Add update timestamp trigger
CREATE OR REPLACE FUNCTION update_regulatory_validation_issues_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_regulatory_validation_issues_updated_at
    BEFORE UPDATE ON regulatory_validation_issues
    FOR EACH ROW
    EXECUTE FUNCTION update_regulatory_validation_issues_updated_at();

-- Add comments for documentation
COMMENT ON TABLE regulatory_validation_issues IS 'Stores detailed discrepancy reports from multi-agency validation with granular tracking and remediation workflow';
COMMENT ON COLUMN regulatory_validation_issues.specific_violation IS 'Regulation/Guideline/Standard ID that was violated';
COMMENT ON COLUMN regulatory_validation_issues.conflicting_requirements IS 'Precise differences across agencies';
COMMENT ON COLUMN regulatory_validation_issues.contextual_content_snippet IS 'Exact violating text from document';
COMMENT ON COLUMN regulatory_validation_issues.location_trace IS 'Page/Section/Chunk/Sentence ID for violation location';
COMMENT ON COLUMN regulatory_validation_issues.recommended_remediation IS 'Actionable fix suggestion';
COMMENT ON COLUMN regulatory_validation_issues.ai_confidence_score IS 'Confidence score (0-1) in discrepancy detection';
COMMENT ON COLUMN regulatory_validation_issues.harmonization_opportunity IS 'Identified alignment areas across agencies';