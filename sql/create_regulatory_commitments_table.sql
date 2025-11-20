-- Create regulatory_commitments table for enhanced commitment management
-- This table stores extracted commitments with full lifecycle management capabilities

CREATE TABLE IF NOT EXISTS regulatory_commitments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core commitment data (from AI extraction)
    description TEXT NOT NULL,
    due_date DATE,
    authority VARCHAR(255),
    priority VARCHAR(50) CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
    commitment_type VARCHAR(100),
    regulatory_section VARCHAR(255),
    risk_level VARCHAR(50) CHECK (risk_level IN ('High', 'Medium', 'Low')),
    status VARCHAR(50) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'In Progress', 'Under Review', 'Completed', 'Overdue', 'Cancelled', 'Deferred')),
    ai_analysis TEXT,
    dependencies TEXT,
    compliance_risk VARCHAR(50),
    monitoring_approach TEXT,
    extracted_from TEXT,
    
    -- Assignment and responsibility fields
    assigned_to_user_id INTEGER REFERENCES users(id),
    assigned_to_team_id UUID, -- Placeholder for future teams table
    assigned_to_role TEXT,
    
    -- Internal management fields
    internal_notes TEXT,
    last_note_updated_at TIMESTAMPTZ,
    note_author_user_id INTEGER REFERENCES users(id),
    
    -- Linked entities (for cross-platform integration)
    linked_entities JSONB DEFAULT '[]'::jsonb,
    
    -- Reminder and notification settings
    reminder_date DATE,
    reminder_frequency VARCHAR(50),
    
    -- Resource impact tracking
    estimated_cost NUMERIC(10,2),
    estimated_hours INTEGER,
    
    -- Source document reference
    document_id UUID REFERENCES unified_documents(id),
    document_version VARCHAR(50),
    
    -- Multi-tenant support
    tenant_id UUID NOT NULL,
    
    -- Audit trail
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id),
    
    -- AI extraction metadata
    extraction_confidence NUMERIC(3,2) CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
    extraction_model VARCHAR(100) DEFAULT 'gpt-4o',
    extraction_timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_regulatory_commitments_tenant ON regulatory_commitments(tenant_id);
CREATE INDEX idx_regulatory_commitments_status ON regulatory_commitments(status);
CREATE INDEX idx_regulatory_commitments_assigned_user ON regulatory_commitments(assigned_to_user_id);
CREATE INDEX idx_regulatory_commitments_due_date ON regulatory_commitments(due_date);
CREATE INDEX idx_regulatory_commitments_priority ON regulatory_commitments(priority);
CREATE INDEX idx_regulatory_commitments_document ON regulatory_commitments(document_id);
CREATE INDEX idx_regulatory_commitments_created ON regulatory_commitments(created_at);

-- Create composite indexes for common query patterns
CREATE INDEX idx_regulatory_commitments_tenant_status ON regulatory_commitments(tenant_id, status);
CREATE INDEX idx_regulatory_commitments_tenant_assignee ON regulatory_commitments(tenant_id, assigned_to_user_id);
CREATE INDEX idx_regulatory_commitments_tenant_due_priority ON regulatory_commitments(tenant_id, due_date, priority);

-- Add GIN index for JSONB linked_entities for efficient querying
CREATE INDEX idx_regulatory_commitments_linked_entities ON regulatory_commitments USING GIN(linked_entities);

-- Add full-text search indexes for description and internal notes
CREATE INDEX idx_regulatory_commitments_description_fts ON regulatory_commitments USING GIN(to_tsvector('english', description));
CREATE INDEX idx_regulatory_commitments_notes_fts ON regulatory_commitments USING GIN(to_tsvector('english', internal_notes));

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_regulatory_commitments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_regulatory_commitments_updated_at
    BEFORE UPDATE ON regulatory_commitments
    FOR EACH ROW
    EXECUTE FUNCTION update_regulatory_commitments_updated_at();

-- Add comments for documentation
COMMENT ON TABLE regulatory_commitments IS 'Stores regulatory commitments extracted from documents with full lifecycle management capabilities';
COMMENT ON COLUMN regulatory_commitments.linked_entities IS 'JSON array of linked platform entities: [{type: "task", id: "uuid"}, {type: "project", id: "uuid"}]';
COMMENT ON COLUMN regulatory_commitments.extraction_confidence IS 'AI confidence score for the extracted commitment (0.0 to 1.0)';