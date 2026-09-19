-- TrialSage Vault 2.0 - CRO Multi-client PostgreSQL Schema
-- This schema implements the following hierarchy:
-- CRO Organizations -> Client Organizations -> Programs -> Studies

-- Enable pgvector extension for AI embeddings
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Organizations Table (CROs and Clients)
CREATE TABLE organizations (
    org_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    org_type VARCHAR(50) NOT NULL CHECK (org_type IN ('CRO', 'CLIENT')),
    parent_org_id UUID REFERENCES organizations(org_id), -- For clients, points to CRO
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    settings JSONB,
    branding JSONB, -- Logo, colors, etc.
    domain VARCHAR(255), -- Custom domain for portal
    primary_contact_name VARCHAR(255),
    primary_contact_email VARCHAR(255),
    CONSTRAINT chk_parent_org CHECK (
        (org_type = 'CLIENT' AND parent_org_id IS NOT NULL) OR
        (org_type = 'CRO' AND parent_org_id IS NULL)
    )
);

-- Users Table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auth_provider VARCHAR(50) DEFAULT 'supabase',
    auth_provider_id VARCHAR(255), -- External ID from auth provider
    avatar_url VARCHAR(255),
    title VARCHAR(100),
    department VARCHAR(100),
    phone VARCHAR(50),
    preferences JSONB
);

-- User Organization Assignments
CREATE TABLE user_organizations (
    user_id UUID NOT NULL REFERENCES users(user_id),
    org_id UUID NOT NULL REFERENCES organizations(org_id),
    role VARCHAR(50) NOT NULL CHECK (role IN ('CRO_ADMIN', 'CRO_MANAGER', 'CLIENT_ADMIN', 'PROJECT_MANAGER', 'STUDY_LEAD', 'WRITER', 'VIEWER')),
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    assigned_by UUID REFERENCES users(user_id),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (user_id, org_id)
);

-- Programs Table
CREATE TABLE programs (
    program_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(org_id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    therapeutic_area VARCHAR(100),
    indication VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'ON_HOLD', 'ARCHIVED')),
    start_date DATE,
    target_end_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(user_id),
    program_manager_id UUID REFERENCES users(user_id),
    program_code VARCHAR(50), -- Unique program identifier code
    metadata JSONB,
    UNIQUE (org_id, program_code)
);

-- Studies Table
CREATE TABLE studies (
    study_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id UUID NOT NULL REFERENCES programs(program_id),
    org_id UUID NOT NULL REFERENCES organizations(org_id), -- Denormalized for query performance
    name VARCHAR(255) NOT NULL,
    description TEXT,
    protocol_number VARCHAR(100),
    study_code VARCHAR(50), -- Unique study identifier
    phase VARCHAR(20) CHECK (phase IN ('PRECLINICAL', 'PHASE_1', 'PHASE_2', 'PHASE_3', 'PHASE_4')),
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNING' CHECK (status IN ('PLANNING', 'ENROLLING', 'ACTIVE', 'COMPLETED', 'TERMINATED')),
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(user_id),
    lead_id UUID REFERENCES users(user_id), -- Study lead
    enrollment_target INTEGER,
    enrollment_actual INTEGER,
    metadata JSONB,
    UNIQUE (program_id, study_code)
);

-- Contracts Table
CREATE TABLE contracts (
    contract_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cro_id UUID NOT NULL REFERENCES organizations(org_id),
    client_id UUID NOT NULL REFERENCES organizations(org_id),
    contract_number VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'TERMINATED')),
    effective_date DATE,
    expiration_date DATE,
    value DECIMAL,
    currency VARCHAR(3) DEFAULT 'USD',
    renewal_terms TEXT,
    billing_frequency VARCHAR(50),
    next_billing_date DATE,
    special_terms TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(user_id),
    metadata JSONB,
    CONSTRAINT chk_client_belongs_to_cro CHECK (
        client_id IN (SELECT org_id FROM organizations WHERE parent_org_id = cro_id)
    )
);

-- Documents Table
CREATE TABLE documents (
    doc_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    org_id UUID NOT NULL REFERENCES organizations(org_id),
    program_id UUID REFERENCES programs(program_id),
    study_id UUID REFERENCES studies(study_id),
    doc_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'FINAL', 'ARCHIVED')),
    current_version_id UUID,
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    regulatory_category VARCHAR(100),
    external_ref VARCHAR(255),
    confidentiality VARCHAR(50) DEFAULT 'STANDARD' CHECK (confidentiality IN ('PUBLIC', 'STANDARD', 'CONFIDENTIAL', 'RESTRICTED')),
    retention_period INTEGER, -- Months
    retention_end_date DATE,
    metadata JSONB,
    CONSTRAINT chk_hierarchy CHECK (
        (study_id IS NOT NULL AND program_id IS NOT NULL) OR 
        (study_id IS NULL AND program_id IS NOT NULL) OR 
        (study_id IS NULL AND program_id IS NULL)
    )
);

-- Document Versions Table
CREATE TABLE document_versions (
    version_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    doc_id UUID NOT NULL REFERENCES documents(doc_id),
    version_number INTEGER NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(user_id),
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    change_summary TEXT,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approval_id UUID,
    checksum VARCHAR(255) NOT NULL,
    UNIQUE (doc_id, version_number)
);

-- Update documents table with foreign key to current version
ALTER TABLE documents 
ADD CONSTRAINT fk_current_version 
FOREIGN KEY (current_version_id) REFERENCES document_versions(version_id);

-- Deliverables Table
CREATE TABLE deliverables (
    deliverable_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES organizations(org_id),
    cro_id UUID NOT NULL REFERENCES organizations(org_id),
    program_id UUID REFERENCES programs(program_id),
    study_id UUID REFERENCES studies(study_id),
    contract_id UUID REFERENCES contracts(contract_id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    deliverable_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'DELIVERED', 'ACCEPTED', 'REJECTED')),
    due_date DATE,
    delivered_date DATE,
    assigned_to UUID REFERENCES users(user_id),
    department VARCHAR(100),
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    estimated_effort FLOAT,
    actual_effort FLOAT,
    approval_required BOOLEAN NOT NULL DEFAULT FALSE,
    approval_status VARCHAR(50),
    approved_by UUID REFERENCES users(user_id),
    approved_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(user_id),
    metadata JSONB,
    CONSTRAINT chk_client_belongs_to_cro CHECK (
        client_id IN (SELECT org_id FROM organizations WHERE parent_org_id = cro_id)
    )
);

-- Deliverable Documents Junction Table
CREATE TABLE deliverable_documents (
    deliverable_id UUID NOT NULL REFERENCES deliverables(deliverable_id),
    doc_id UUID NOT NULL REFERENCES documents(doc_id),
    relationship_type VARCHAR(50) NOT NULL DEFAULT 'PRIMARY' CHECK (relationship_type IN ('PRIMARY', 'SUPPORTING', 'REFERENCE')),
    added_at TIMESTAMP NOT NULL DEFAULT NOW(),
    added_by UUID NOT NULL REFERENCES users(user_id),
    PRIMARY KEY (deliverable_id, doc_id)
);

-- Milestones Table
CREATE TABLE milestones (
    milestone_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES organizations(org_id),
    cro_id UUID NOT NULL REFERENCES organizations(org_id),
    program_id UUID REFERENCES programs(program_id),
    study_id UUID REFERENCES studies(study_id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    milestone_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED', 'CANCELLED')),
    target_date DATE NOT NULL,
    actual_date DATE,
    responsible_id UUID REFERENCES users(user_id),
    is_regulatory BOOLEAN NOT NULL DEFAULT FALSE,
    is_billing BOOLEAN NOT NULL DEFAULT FALSE,
    critical_path BOOLEAN NOT NULL DEFAULT FALSE,
    risk_level VARCHAR(20) DEFAULT 'LOW' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    risk_description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(user_id),
    metadata JSONB,
    CONSTRAINT chk_client_belongs_to_cro CHECK (
        client_id IN (SELECT org_id FROM organizations WHERE parent_org_id = cro_id)
    )
);

-- Milestone Dependencies
CREATE TABLE milestone_dependencies (
    milestone_id UUID NOT NULL REFERENCES milestones(milestone_id),
    dependency_id UUID NOT NULL REFERENCES milestones(milestone_id),
    PRIMARY KEY (milestone_id, dependency_id),
    CONSTRAINT chk_not_self_dependency CHECK (milestone_id != dependency_id)
);

-- Regulatory Submissions Table
CREATE TABLE regulatory_submissions (
    submission_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES organizations(org_id),
    cro_id UUID NOT NULL REFERENCES organizations(org_id),
    program_id UUID NOT NULL REFERENCES programs(program_id),
    study_id UUID REFERENCES studies(study_id),
    milestone_id UUID REFERENCES milestones(milestone_id),
    submission_type VARCHAR(100) NOT NULL CHECK (submission_type IN ('IND', 'NDA', 'BLA', 'CTA', 'MAA', 'AMENDMENT', 'OTHER')),
    agency VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    planned_date DATE,
    submitted_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'PLANNING' CHECK (status IN ('PLANNING', 'IN_PREPARATION', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
    tracking_number VARCHAR(100),
    response_due DATE,
    approval_date DATE,
    approval_type VARCHAR(100),
    lead_id UUID REFERENCES users(user_id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(user_id),
    metadata JSONB,
    CONSTRAINT chk_client_belongs_to_cro CHECK (
        client_id IN (SELECT org_id FROM organizations WHERE parent_org_id = cro_id)
    )
);

-- AI Query Logs Table
CREATE TABLE ai_queries (
    query_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(org_id),
    user_id UUID NOT NULL REFERENCES users(user_id),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    question TEXT NOT NULL,
    context JSONB,
    answer TEXT,
    model_used VARCHAR(100),
    tokens_used INTEGER,
    feedback_rating INTEGER,
    feedback_text TEXT,
    citations JSONB
);

-- AI Embeddings Table
CREATE TABLE ai_embeddings (
    embedding_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(org_id),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    chunk_index INTEGER NOT NULL,
    embedding VECTOR(1536),
    content_excerpt TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Audit Logs Table
CREATE TABLE audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(org_id),
    user_id UUID REFERENCES users(user_id),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    details JSONB,
    ip_address VARCHAR(50),
    user_agent VARCHAR(255),
    session_id VARCHAR(255)
);

-- Activity Logs Table
CREATE TABLE activity_logs (
    activity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(org_id),
    user_id UUID NOT NULL REFERENCES users(user_id),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    activity_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    metadata JSONB
);

-- Add Row-Level Security Policies

-- Enable RLS on organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Policy for CRO users (can see their CRO and all clients under it)
CREATE POLICY cro_organizations_policy ON organizations 
    USING (
        org_id = current_setting('app.current_cro_id', true)::UUID 
        OR 
        parent_org_id = current_setting('app.current_cro_id', true)::UUID
    );

-- Policy for client users (can only see their own client organization)
CREATE POLICY client_organizations_policy ON organizations 
    USING (
        org_id = current_setting('app.current_client_id', true)::UUID
    );

-- Enable RLS on programs
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

-- Policy for CRO users (can see all programs under their client organizations)
CREATE POLICY cro_programs_policy ON programs 
    USING (
        org_id IN (
            SELECT o.org_id FROM organizations o 
            WHERE o.parent_org_id = current_setting('app.current_cro_id', true)::UUID
        )
    );

-- Policy for client users (can only see their own programs)
CREATE POLICY client_programs_policy ON programs 
    USING (
        org_id = current_setting('app.current_client_id', true)::UUID
    );

-- Enable RLS on studies
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;

-- Policy for CRO users (can see all studies under their client organizations)
CREATE POLICY cro_studies_policy ON studies 
    USING (
        org_id IN (
            SELECT o.org_id FROM organizations o 
            WHERE o.parent_org_id = current_setting('app.current_cro_id', true)::UUID
        )
    );

-- Policy for client users (can only see their own studies)
CREATE POLICY client_studies_policy ON studies 
    USING (
        org_id = current_setting('app.current_client_id', true)::UUID
    );

-- Enable RLS on documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy for CRO users (can see all documents under their client organizations)
CREATE POLICY cro_documents_policy ON documents 
    USING (
        org_id IN (
            SELECT o.org_id FROM organizations o 
            WHERE o.parent_org_id = current_setting('app.current_cro_id', true)::UUID
        )
    );

-- Policy for client users (can only see their own documents)
CREATE POLICY client_documents_policy ON documents 
    USING (
        org_id = current_setting('app.current_client_id', true)::UUID
    );

-- Create indexes for performance

-- Organizations indexes
CREATE INDEX idx_organizations_parent_org_id ON organizations(parent_org_id);
CREATE INDEX idx_organizations_status ON organizations(status);

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);

-- User Organizations indexes
CREATE INDEX idx_user_organizations_org_id ON user_organizations(org_id);
CREATE INDEX idx_user_organizations_role ON user_organizations(role);

-- Programs indexes
CREATE INDEX idx_programs_org_id ON programs(org_id);
CREATE INDEX idx_programs_status ON programs(status);
CREATE INDEX idx_programs_therapeutic_area ON programs(therapeutic_area);

-- Studies indexes
CREATE INDEX idx_studies_program_id ON studies(program_id);
CREATE INDEX idx_studies_org_id ON studies(org_id);
CREATE INDEX idx_studies_status ON studies(status);
CREATE INDEX idx_studies_phase ON studies(phase);

-- Documents indexes
CREATE INDEX idx_documents_org_id ON documents(org_id);
CREATE INDEX idx_documents_program_id ON documents(program_id);
CREATE INDEX idx_documents_study_id ON documents(study_id);
CREATE INDEX idx_documents_doc_type ON documents(doc_type);
CREATE INDEX idx_documents_status ON documents(status);

-- Document Versions indexes
CREATE INDEX idx_document_versions_doc_id ON document_versions(doc_id);
CREATE INDEX idx_document_versions_uploaded_at ON document_versions(uploaded_at);

-- Deliverables indexes
CREATE INDEX idx_deliverables_client_id ON deliverables(client_id);
CREATE INDEX idx_deliverables_cro_id ON deliverables(cro_id);
CREATE INDEX idx_deliverables_program_id ON deliverables(program_id);
CREATE INDEX idx_deliverables_study_id ON deliverables(study_id);
CREATE INDEX idx_deliverables_status ON deliverables(status);
CREATE INDEX idx_deliverables_due_date ON deliverables(due_date);

-- Milestones indexes
CREATE INDEX idx_milestones_client_id ON milestones(client_id);
CREATE INDEX idx_milestones_cro_id ON milestones(cro_id);
CREATE INDEX idx_milestones_program_id ON milestones(program_id);
CREATE INDEX idx_milestones_study_id ON milestones(study_id);
CREATE INDEX idx_milestones_target_date ON milestones(target_date);
CREATE INDEX idx_milestones_status ON milestones(status);

-- Regulatory Submissions indexes
CREATE INDEX idx_regulatory_submissions_client_id ON regulatory_submissions(client_id);
CREATE INDEX idx_regulatory_submissions_cro_id ON regulatory_submissions(cro_id);
CREATE INDEX idx_regulatory_submissions_program_id ON regulatory_submissions(program_id);
CREATE INDEX idx_regulatory_submissions_study_id ON regulatory_submissions(study_id);
CREATE INDEX idx_regulatory_submissions_submission_type ON regulatory_submissions(submission_type);
CREATE INDEX idx_regulatory_submissions_status ON regulatory_submissions(status);

-- AI Embeddings indexes
CREATE INDEX idx_ai_embeddings_org_id ON ai_embeddings(org_id);
CREATE INDEX idx_ai_embeddings_entity_id_type ON ai_embeddings(entity_id, entity_type);
-- Create vector index for similarity search
CREATE INDEX idx_ai_embeddings_embedding ON ai_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Audit Logs indexes
CREATE INDEX idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_entity_id_type ON audit_logs(entity_id, entity_type);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Activity Logs indexes
CREATE INDEX idx_activity_logs_org_id ON activity_logs(org_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_timestamp ON activity_logs(timestamp);
CREATE INDEX idx_activity_logs_activity_type ON activity_logs(activity_type);