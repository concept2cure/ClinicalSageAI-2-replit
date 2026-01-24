-- Migration 001: Analytical Methods Core Schema
-- Created: 2025-08-21
-- Purpose: Complete analytical methods management with audit trails and performance optimization

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Organizations table (if not exists)
CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    domain VARCHAR(255),
    logo VARCHAR(500),
    tier VARCHAR(50) DEFAULT 'standard',
    max_users INTEGER DEFAULT 5,
    max_projects INTEGER DEFAULT 5,
    max_storage INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytical methods table
CREATE TABLE analytical_methods (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    technique VARCHAR(100) NOT NULL,
    matrix VARCHAR(100) NOT NULL,
    analyte VARCHAR(200) NOT NULL,
    range_specification VARCHAR(200),
    precision_target VARCHAR(50),
    accuracy_target VARCHAR(50),
    status VARCHAR(50) DEFAULT 'UNDER_DEV' CHECK (status IN ('UNDER_DEV', 'IN_VALIDATION', 'APPROVED', 'RETIRED')),
    owner VARCHAR(200),
    due_date DATE,
    readiness_score INTEGER DEFAULT 0 CHECK (readiness_score >= 0 AND readiness_score <= 100),
    method_type VARCHAR(50) DEFAULT 'ANALYTICAL',
    validation_protocol TEXT,
    regulatory_requirements JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(200),
    updated_by VARCHAR(200),
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    
    -- Constraints
    UNIQUE(organization_id, code),
    INDEX idx_analytical_methods_org_status (organization_id, status),
    INDEX idx_analytical_methods_owner (owner),
    INDEX idx_analytical_methods_technique (technique),
    INDEX idx_analytical_methods_readiness (readiness_score),
    INDEX idx_analytical_methods_search (code, title, analyte) USING gin
);

-- Validation gaps table (ICH Q2/Q14 compliance tracking)
CREATE TABLE analytical_validation_gaps (
    id SERIAL PRIMARY KEY,
    method_id INTEGER NOT NULL REFERENCES analytical_methods(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    rule_id VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('ERROR', 'WARNING', 'INFO')),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    why TEXT NOT NULL,
    section VARCHAR(200) NOT NULL,
    regulatory_reference VARCHAR(200),
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'WAIVED')),
    assigned_to VARCHAR(200),
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_validation_gaps_method (method_id),
    INDEX idx_validation_gaps_severity (severity),
    INDEX idx_validation_gaps_status (status),
    INDEX idx_validation_gaps_rule (rule_id)
);

-- System suitability runs table (trending data)
CREATE TABLE analytical_method_runs (
    id SERIAL PRIMARY KEY,
    method_id INTEGER NOT NULL REFERENCES analytical_methods(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    run_time TIME,
    operator VARCHAR(200),
    instrument_id VARCHAR(100),
    sst_metric DECIMAL(10,4),
    peak_resolution DECIMAL(8,4),
    theoretical_plates INTEGER,
    retention_time DECIMAL(8,4),
    peak_area BIGINT,
    peak_height INTEGER,
    baseline_noise DECIMAL(8,4),
    signal_to_noise DECIMAL(8,4),
    run_status VARCHAR(20) DEFAULT 'COMPLETED' CHECK (run_status IN ('RUNNING', 'COMPLETED', 'FAILED', 'ABORTED')),
    notes TEXT,
    raw_data_path VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_method_runs_date (method_id, run_date DESC),
    INDEX idx_method_runs_status (run_status),
    INDEX idx_method_runs_operator (operator),
    INDEX idx_method_runs_instrument (instrument_id)
);

-- Method validation parameters table
CREATE TABLE analytical_validation_parameters (
    id SERIAL PRIMARY KEY,
    method_id INTEGER NOT NULL REFERENCES analytical_methods(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    parameter_type VARCHAR(100) NOT NULL,
    parameter_name VARCHAR(200) NOT NULL,
    target_value VARCHAR(200),
    actual_value VARCHAR(200),
    acceptance_criteria VARCHAR(500),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PASSED', 'FAILED', 'NOT_APPLICABLE')),
    study_date DATE,
    analyst VARCHAR(200),
    comments TEXT,
    supporting_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_validation_params_method (method_id),
    INDEX idx_validation_params_type (parameter_type),
    INDEX idx_validation_params_status (status)
);

-- Method change control table
CREATE TABLE analytical_method_changes (
    id SERIAL PRIMARY KEY,
    method_id INTEGER NOT NULL REFERENCES analytical_methods(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    change_number VARCHAR(100) UNIQUE NOT NULL,
    change_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    justification TEXT NOT NULL,
    risk_assessment TEXT,
    impact_assessment TEXT,
    approval_status VARCHAR(20) DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    requested_by VARCHAR(200) NOT NULL,
    approved_by VARCHAR(200),
    implemented_by VARCHAR(200),
    requested_date DATE DEFAULT CURRENT_DATE,
    approved_date DATE,
    implemented_date DATE,
    effective_date DATE,
    review_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_method_changes_number (change_number),
    INDEX idx_method_changes_method (method_id),
    INDEX idx_method_changes_status (approval_status),
    INDEX idx_method_changes_dates (requested_date, approved_date)
);

-- Audit trail table
CREATE TABLE analytical_audit_trail (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    user_id VARCHAR(200) NOT NULL,
    user_name VARCHAR(200),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(200),
    reason TEXT,
    
    INDEX idx_audit_trail_table_record (table_name, record_id),
    INDEX idx_audit_trail_user (user_id),
    INDEX idx_audit_trail_timestamp (timestamp DESC),
    INDEX idx_audit_trail_action (action)
);

-- Analytical instruments table
CREATE TABLE analytical_instruments (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    instrument_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(100) NOT NULL,
    manufacturer VARCHAR(200),
    model VARCHAR(200),
    serial_number VARCHAR(100),
    location VARCHAR(200),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'RETIRED', 'CALIBRATION')),
    last_calibration DATE,
    next_calibration DATE,
    qualification_status VARCHAR(50),
    software_version VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    INDEX idx_instruments_org (organization_id),
    INDEX idx_instruments_status (status),
    INDEX idx_instruments_type (type)
);

-- Performance optimization: Partitioning for audit trail (by month)
-- This will be implemented as data grows
-- CREATE TABLE analytical_audit_trail_y2025m08 PARTITION OF analytical_audit_trail
-- FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

-- Insert demo data for immediate functionality
INSERT INTO organizations (id, name, slug, tier, status) 
VALUES (1, 'Demo Pharmaceutical', 'demo-pharma', 'enterprise', 'active')
ON CONFLICT (id) DO NOTHING;

-- Insert analytical methods demo data
INSERT INTO analytical_methods (
    organization_id, code, title, technique, matrix, analyte, 
    range_specification, precision_target, accuracy_target, 
    status, owner, due_date, readiness_score
) VALUES 
(1, 'AM-001', 'HPLC-UV • API Assay', 'HPLC-UV', 'Drug Product', 'Active Pharmaceutical Ingredient', 
 '0.05–150 μg/mL', '≤2.0% RSD', '98–102%', 'IN_VALIDATION', 'Dr. Sarah Chen', '2025-09-15', 85),
(1, 'AM-002', 'UPLC-MS/MS • Impurity Profile', 'UPLC-MS/MS', 'Drug Substance', 'Related Substances', 
 '0.01–1.0% w/w', '≤3.0% RSD', '95–105%', 'UNDER_DEV', 'Dr. Michael Rodriguez', '2025-10-01', 65),
(1, 'AM-003', 'GC-FID • Residual Solvents', 'GC-FID', 'Drug Product', 'Volatile Organic Compounds', 
 '10–1000 ppm', '≤5.0% RSD', '90–110%', 'APPROVED', 'Dr. Emily Johnson', NULL, 100),
(1, 'AM-004', 'ICP-MS • Heavy Metals', 'ICP-MS', 'Drug Substance', 'Elemental Impurities', 
 '0.1–100 μg/g', '≤10% RSD', '85–115%', 'UNDER_DEV', 'Dr. James Park', '2025-08-30', 40)
ON CONFLICT (organization_id, code) DO NOTHING;

-- Insert validation gaps
INSERT INTO analytical_validation_gaps (
    method_id, organization_id, rule_id, severity, title, why, section, regulatory_reference
) VALUES 
(1, 1, 'Q2_LINEARITY', 'ERROR', 'Linearity validation incomplete', 
 'Correlation coefficient r ≥ 0.99 required per ICH Q2(R1)', 'Analytical Validation', 'ICH Q2(R1) Section 4.1.5'),
(2, 1, 'Q14_LIFECYCLE', 'ERROR', 'Lifecycle plan missing', 
 'Analytical lifecycle management plan required per ICH Q14', 'Documentation', 'ICH Q14 Section 5.2'),
(4, 1, 'Q2_SPECIFICITY', 'ERROR', 'Specificity not demonstrated', 
 'Matrix interference studies incomplete', 'Method Development', 'ICH Q2(R1) Section 4.1.1')
ON CONFLICT DO NOTHING;

-- Insert system suitability runs
INSERT INTO analytical_method_runs (
    method_id, organization_id, run_date, sst_metric, operator
) VALUES 
(1, 1, '2025-08-15', 2850.5, 'Analyst A'),
(1, 1, '2025-08-16', 2920.3, 'Analyst A'),
(1, 1, '2025-08-17', 2780.1, 'Analyst B'),
(1, 1, '2025-08-18', 2895.7, 'Analyst A'),
(1, 1, '2025-08-19', 2950.2, 'Analyst C'),
(1, 1, '2025-08-20', 2830.8, 'Analyst B'),
(1, 1, '2025-08-21', 2910.4, 'Analyst A'),
(2, 1, '2025-08-15', 1950.2, 'Analyst B'),
(2, 1, '2025-08-17', 1890.5, 'Analyst B'),
(2, 1, '2025-08-19', 1920.8, 'Analyst C'),
(2, 1, '2025-08-21', 1980.1, 'Analyst B'),
(3, 1, '2025-08-14', 3200.5, 'Analyst C'),
(3, 1, '2025-08-16', 3180.2, 'Analyst A'),
(3, 1, '2025-08-18', 3220.8, 'Analyst C'),
(3, 1, '2025-08-20', 3195.4, 'Analyst B')
ON CONFLICT DO NOTHING;

-- Create triggers for audit trail
CREATE OR REPLACE FUNCTION create_audit_trail() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO analytical_audit_trail (
            organization_id, table_name, record_id, action, new_values, 
            user_id, user_name, timestamp
        ) VALUES (
            COALESCE(NEW.organization_id, 1),
            TG_TABLE_NAME,
            NEW.id,
            TG_OP,
            row_to_json(NEW),
            COALESCE(current_setting('myapp.user_id', true), 'system'),
            COALESCE(current_setting('myapp.user_name', true), 'System User'),
            NOW()
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO analytical_audit_trail (
            organization_id, table_name, record_id, action, old_values, new_values,
            user_id, user_name, timestamp
        ) VALUES (
            COALESCE(NEW.organization_id, 1),
            TG_TABLE_NAME,
            NEW.id,
            TG_OP,
            row_to_json(OLD),
            row_to_json(NEW),
            COALESCE(current_setting('myapp.user_id', true), 'system'),
            COALESCE(current_setting('myapp.user_name', true), 'System User'),
            NOW()
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO analytical_audit_trail (
            organization_id, table_name, record_id, action, old_values,
            user_id, user_name, timestamp
        ) VALUES (
            COALESCE(OLD.organization_id, 1),
            TG_TABLE_NAME,
            OLD.id,
            TG_OP,
            row_to_json(OLD),
            COALESCE(current_setting('myapp.user_id', true), 'system'),
            COALESCE(current_setting('myapp.user_name', true), 'System User'),
            NOW()
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to key tables
CREATE TRIGGER audit_analytical_methods
    AFTER INSERT OR UPDATE OR DELETE ON analytical_methods
    FOR EACH ROW EXECUTE FUNCTION create_audit_trail();

CREATE TRIGGER audit_validation_gaps
    AFTER INSERT OR UPDATE OR DELETE ON analytical_validation_gaps
    FOR EACH ROW EXECUTE FUNCTION create_audit_trail();

CREATE TRIGGER audit_method_changes
    AFTER INSERT OR UPDATE OR DELETE ON analytical_method_changes
    FOR EACH ROW EXECUTE FUNCTION create_audit_trail();

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_analytical_methods_updated_at
    BEFORE UPDATE ON analytical_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_validation_gaps_updated_at
    BEFORE UPDATE ON analytical_validation_gaps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_method_changes_updated_at
    BEFORE UPDATE ON analytical_method_changes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Performance optimization views
CREATE VIEW analytical_methods_summary AS
SELECT 
    am.id,
    am.code,
    am.title,
    am.technique,
    am.matrix,
    am.analyte,
    am.status,
    am.owner,
    am.readiness_score,
    am.due_date,
    COUNT(DISTINCT vg.id) FILTER (WHERE vg.severity = 'ERROR' AND vg.status = 'OPEN') as error_count,
    COUNT(DISTINCT vg.id) FILTER (WHERE vg.severity = 'WARNING' AND vg.status = 'OPEN') as warning_count,
    COUNT(DISTINCT mr.id) as total_runs,
    MAX(mr.run_date) as last_run_date,
    AVG(mr.sst_metric) as avg_sst_metric
FROM analytical_methods am
LEFT JOIN analytical_validation_gaps vg ON am.id = vg.method_id
LEFT JOIN analytical_method_runs mr ON am.id = mr.method_id
WHERE am.is_active = true
GROUP BY am.id, am.code, am.title, am.technique, am.matrix, am.analyte, 
         am.status, am.owner, am.readiness_score, am.due_date;

-- Create comprehensive indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytical_methods_composite 
ON analytical_methods (organization_id, status, readiness_score DESC, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_validation_gaps_composite 
ON analytical_validation_gaps (method_id, severity, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_method_runs_trending 
ON analytical_method_runs (method_id, run_date DESC) 
INCLUDE (sst_metric, operator);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_trail_recent 
ON analytical_audit_trail (organization_id, timestamp DESC) 
WHERE timestamp > NOW() - INTERVAL '30 days';

-- Text search optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytical_methods_fulltext 
ON analytical_methods USING gin (
    to_tsvector('english', coalesce(code, '') || ' ' || 
                          coalesce(title, '') || ' ' || 
                          coalesce(analyte, '') || ' ' || 
                          coalesce(owner, ''))
);

COMMENT ON TABLE analytical_methods IS 'Core analytical methods with full lifecycle tracking';
COMMENT ON TABLE analytical_validation_gaps IS 'ICH Q2/Q14 compliance gap tracking';
COMMENT ON TABLE analytical_method_runs IS 'System suitability and trending data';
COMMENT ON TABLE analytical_audit_trail IS 'Complete audit trail for regulatory compliance';