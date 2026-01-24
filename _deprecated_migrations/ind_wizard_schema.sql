-- migrations/ind_wizard_schema.sql
-- Database schema for IND Wizard

-- Main IND Drafts Table
CREATE TABLE IF NOT EXISTS ind_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id),
    draft_title VARCHAR(255) NOT NULL,
    current_step VARCHAR(50), -- Track the user's current step in the wizard
    status VARCHAR(50) DEFAULT 'draft', -- e.g., draft, submitted, approved
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes on user_id, status
CREATE INDEX IF NOT EXISTS ind_drafts_user_id_idx ON ind_drafts(user_id);
CREATE INDEX IF NOT EXISTS ind_drafts_status_idx ON ind_drafts(status);

-- Pre-IND Step Data
CREATE TABLE IF NOT EXISTS ind_pre_ind_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id UUID NOT NULL UNIQUE REFERENCES ind_drafts(id) ON DELETE CASCADE, -- One-to-one with draft
    -- Project Initiation Fields
    project_name VARCHAR(255),
    therapeutic_area VARCHAR(255),
    project_objective TEXT,
    -- Pre-IND Planning Fields
    target_pre_ind_meeting_date DATE,
    pre_ind_meeting_objective TEXT,
    pre_ind_agenda_topics JSONB, -- Store array of strings as JSONB
    pre_ind_attendees JSONB, -- Store array of strings as JSONB
    fda_interaction_notes TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index on draft_id
CREATE INDEX IF NOT EXISTS ind_pre_ind_data_draft_id_idx ON ind_pre_ind_data(draft_id);

-- Milestones for Pre-IND step
CREATE TABLE IF NOT EXISTS ind_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pre_ind_data_id UUID NOT NULL REFERENCES ind_pre_ind_data(id) ON DELETE CASCADE, -- Link to Pre-IND
    title VARCHAR(255) NOT NULL,
    due_date DATE,
    status VARCHAR(50) CHECK (status IN ('Pending', 'InProgress', 'Completed', 'Blocked')) DEFAULT 'Pending',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index on pre_ind_data_id
CREATE INDEX IF NOT EXISTS ind_milestones_pre_ind_data_id_idx ON ind_milestones(pre_ind_data_id);

-- Nonclinical Step Data
CREATE TABLE IF NOT EXISTS ind_nonclinical_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id UUID NOT NULL UNIQUE REFERENCES ind_drafts(id) ON DELETE CASCADE, -- One-to-one with draft
    -- Overall summary
    overall_nonclinical_summary TEXT,
    -- Status tracking
    pharmacology_status VARCHAR(50) CHECK (pharmacology_status IN ('NotStarted', 'InProgress', 'Completed')) DEFAULT 'NotStarted',
    pk_status VARCHAR(50) CHECK (pk_status IN ('NotStarted', 'InProgress', 'Completed')) DEFAULT 'NotStarted',
    toxicology_status VARCHAR(50) CHECK (toxicology_status IN ('NotStarted', 'InProgress', 'Completed')) DEFAULT 'NotStarted',
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index on draft_id
CREATE INDEX IF NOT EXISTS ind_nonclinical_data_draft_id_idx ON ind_nonclinical_data(draft_id);

-- Nonclinical Studies Table
CREATE TABLE IF NOT EXISTS ind_nonclinical_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nonclinical_data_id UUID NOT NULL REFERENCES ind_nonclinical_data(id) ON DELETE CASCADE,
    study_identifier VARCHAR(100) NOT NULL,
    study_title VARCHAR(255) NOT NULL,
    study_type VARCHAR(100), -- e.g., "Toxicity", "Pharmacokinetics", "Safety Pharmacology"
    species VARCHAR(100),
    model VARCHAR(100),
    route_of_administration VARCHAR(100),
    duration VARCHAR(100),
    main_findings TEXT,
    glp_compliance BOOLEAN DEFAULT FALSE,
    validation_status VARCHAR(50) DEFAULT 'pending', -- e.g., "pending", "validated", "rejected"
    validation_issues TEXT,
    -- Optional study metadata
    study_location VARCHAR(255),
    study_director VARCHAR(255),
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index on nonclinical_data_id
CREATE INDEX IF NOT EXISTS ind_nonclinical_studies_nonclinical_data_id_idx ON ind_nonclinical_studies(nonclinical_data_id);
-- Add index on study_identifier for faster lookups
CREATE INDEX IF NOT EXISTS ind_nonclinical_studies_identifier_idx ON ind_nonclinical_studies(study_identifier);

-- Add unique constraint for study_identifier within each nonclinical_data_id
CREATE UNIQUE INDEX IF NOT EXISTS ind_nonclinical_studies_unique_identifier_idx 
ON ind_nonclinical_studies(nonclinical_data_id, study_identifier);

-- Comments for documentation
COMMENT ON TABLE ind_drafts IS 'Main table for IND applications being drafted';
COMMENT ON TABLE ind_pre_ind_data IS 'Data specific to the Pre-IND step of an IND draft';
COMMENT ON TABLE ind_milestones IS 'Milestones associated with the Pre-IND planning process';
COMMENT ON TABLE ind_nonclinical_data IS 'Data specific to the Nonclinical step of an IND draft';
COMMENT ON TABLE ind_nonclinical_studies IS 'Individual nonclinical studies associated with an IND draft';