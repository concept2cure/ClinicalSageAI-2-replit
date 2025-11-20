-- Create stability tables if they don't exist
-- This script ensures all necessary tables are created for the stability module

-- Create stab_studies table
CREATE TABLE IF NOT EXISTS stab_studies (
    study_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(255) NOT NULL,
    dosage_form VARCHAR(100),
    strength VARCHAR(100),
    scope VARCHAR(100),
    climatic_zone VARCHAR(50),
    duration INTEGER,
    status VARCHAR(50) DEFAULT 'DRAFT',
    start_date DATE,
    planned_end_date DATE,
    notes TEXT,
    analyst VARCHAR(255),
    study_director VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create stab_conditions table
CREATE TABLE IF NOT EXISTS stab_conditions (
    cond_id SERIAL PRIMARY KEY,
    study_id VARCHAR(255) REFERENCES stab_studies(study_id) ON DELETE CASCADE,
    kind VARCHAR(50) NOT NULL, -- LT, ACC, INT, REF
    temp VARCHAR(50),
    rh VARCHAR(50),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(study_id, kind)
);

-- Create stab_timepoints table
CREATE TABLE IF NOT EXISTS stab_timepoints (
    tp_id SERIAL PRIMARY KEY,
    study_id VARCHAR(255) REFERENCES stab_studies(study_id) ON DELETE CASCADE,
    cond_id INTEGER REFERENCES stab_conditions(cond_id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL, -- 0M, 3M, 6M, etc
    month INTEGER NOT NULL,
    planned_date DATE,
    actual_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create stab_tests table
CREATE TABLE IF NOT EXISTS stab_tests (
    test_id SERIAL PRIMARY KEY,
    study_id VARCHAR(255) REFERENCES stab_studies(study_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50),
    spec_low NUMERIC(10,2),
    spec_high NUMERIC(10,2),
    method_id VARCHAR(255),
    is_cqa BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create stab_results table
CREATE TABLE IF NOT EXISTS stab_results (
    result_id SERIAL PRIMARY KEY,
    study_id VARCHAR(255) REFERENCES stab_studies(study_id) ON DELETE CASCADE,
    cond_id INTEGER REFERENCES stab_conditions(cond_id) ON DELETE CASCADE,
    tp_id INTEGER REFERENCES stab_timepoints(tp_id) ON DELETE CASCADE,
    test_id INTEGER REFERENCES stab_tests(test_id) ON DELETE CASCADE,
    value NUMERIC(10,3),
    unit VARCHAR(50),
    pass BOOLEAN,
    oot BOOLEAN DEFAULT FALSE,
    oos BOOLEAN DEFAULT FALSE,
    raw_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(study_id, cond_id, tp_id, test_id)
);

-- Create stab_audit table
CREATE TABLE IF NOT EXISTS stab_audit (
    audit_id SERIAL PRIMARY KEY,
    study_id VARCHAR(255),
    actor VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    payload_json JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create stab_reminders table
CREATE TABLE IF NOT EXISTS stab_reminders (
    reminder_id SERIAL PRIMARY KEY,
    study_id VARCHAR(255) REFERENCES stab_studies(study_id) ON DELETE CASCADE,
    tp_id INTEGER REFERENCES stab_timepoints(tp_id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    channel VARCHAR(50) DEFAULT 'ICS',
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create stab_assignments table (for user assignments)
CREATE TABLE IF NOT EXISTS stab_assignments (
    assign_id SERIAL PRIMARY KEY,
    study_id VARCHAR(255) REFERENCES stab_studies(study_id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create stab_signoffs table (for electronic signatures)
CREATE TABLE IF NOT EXISTS stab_signoffs (
    signoff_id SERIAL PRIMARY KEY,
    study_id VARCHAR(255) REFERENCES stab_studies(study_id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL, -- LOCKED, REVIEWED, APPROVED
    signer_name VARCHAR(255) NOT NULL,
    signer_email VARCHAR(255) NOT NULL,
    reason TEXT,
    hash VARCHAR(255) NOT NULL,
    signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stab_results_study ON stab_results(study_id);
CREATE INDEX IF NOT EXISTS idx_stab_results_cond ON stab_results(cond_id);
CREATE INDEX IF NOT EXISTS idx_stab_results_tp ON stab_results(tp_id);
CREATE INDEX IF NOT EXISTS idx_stab_results_test ON stab_results(test_id);
CREATE INDEX IF NOT EXISTS idx_stab_audit_study ON stab_audit(study_id);
CREATE INDEX IF NOT EXISTS idx_stab_audit_created ON stab_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_stab_assignments_study ON stab_assignments(study_id);
CREATE INDEX IF NOT EXISTS idx_stab_assignments_user ON stab_assignments(user_id);

-- Grant permissions (adjust as needed based on your database user setup)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO your_app_user;