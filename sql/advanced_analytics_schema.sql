/*
 * TrialSage Enterprise Analytics - Hypercube Dimensional Model
 * 
 * This schema implements an advanced analytics framework with:
 * - Multi-dimensional hypercube for regulatory analytics
 * - Temporal tables for historical analysis
 * - Real-time event processing
 * - Machine learning integration
 * - Compliance tracking and validation
 */

-- Create schema for analytics components
CREATE SCHEMA IF NOT EXISTS analytics;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgvector";  -- For ML feature vectors

----------------------------------------------------------------------
-- DIMENSION TABLES (STAR SCHEMA CORE)
----------------------------------------------------------------------

-- Time dimension with hierarchical support
CREATE TABLE analytics.dim_time (
    time_id SERIAL PRIMARY KEY,
    date_value DATE NOT NULL,
    day_of_week SMALLINT NOT NULL,
    day_of_month SMALLINT NOT NULL,
    day_of_year SMALLINT NOT NULL,
    week_of_year SMALLINT NOT NULL,
    month_value SMALLINT NOT NULL,
    month_name VARCHAR(10) NOT NULL,
    quarter_value SMALLINT NOT NULL,
    year_value INTEGER NOT NULL,
    is_weekend BOOLEAN NOT NULL,
    is_holiday BOOLEAN NOT NULL,
    holiday_name VARCHAR(50),
    fiscal_year_value INTEGER,
    fiscal_quarter_value SMALLINT,
    date_key INTEGER NOT NULL, -- YYYYMMDD format for easy joins
    UNIQUE (date_value)
);

-- Function to populate time dimension
CREATE OR REPLACE FUNCTION analytics.populate_dim_time(start_date DATE, end_date DATE)
RETURNS VOID AS $$
DECLARE
    curr_date DATE := start_date;
BEGIN
    WHILE curr_date <= end_date LOOP
        INSERT INTO analytics.dim_time (
            date_value, day_of_week, day_of_month, day_of_year,
            week_of_year, month_value, month_name, quarter_value,
            year_value, is_weekend, is_holiday, date_key
        )
        VALUES (
            curr_date,
            EXTRACT(DOW FROM curr_date),
            EXTRACT(DAY FROM curr_date),
            EXTRACT(DOY FROM curr_date),
            EXTRACT(WEEK FROM curr_date),
            EXTRACT(MONTH FROM curr_date),
            TO_CHAR(curr_date, 'Month'),
            EXTRACT(QUARTER FROM curr_date),
            EXTRACT(YEAR FROM curr_date),
            CASE WHEN EXTRACT(DOW FROM curr_date) IN (0, 6) THEN TRUE ELSE FALSE END,
            FALSE, -- Will be updated separately for holidays
            TO_CHAR(curr_date, 'YYYYMMDD')::INTEGER
        )
        ON CONFLICT (date_value) DO NOTHING;
        
        curr_date := curr_date + INTERVAL '1 day';
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create 10 years of dates (5 past, 5 future)
SELECT analytics.populate_dim_time(CURRENT_DATE - INTERVAL '5 years', CURRENT_DATE + INTERVAL '5 years');

-- Regulatory authority dimension
CREATE TABLE analytics.dim_regulatory_authority (
    authority_id SERIAL PRIMARY KEY,
    authority_code VARCHAR(10) NOT NULL,
    authority_name VARCHAR(100) NOT NULL,
    country_code VARCHAR(3) NOT NULL,
    region VARCHAR(50) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP,
    is_current BOOLEAN DEFAULT TRUE,
    UNIQUE (authority_code, valid_from)
);

-- Submission type dimension with hierarchy
CREATE TABLE analytics.dim_submission_type (
    submission_type_id SERIAL PRIMARY KEY,
    submission_class VARCHAR(50) NOT NULL, -- IND, NDA, BLA, etc.
    submission_subclass VARCHAR(50), -- Original, Amendment, etc.
    submission_category VARCHAR(50), -- Commercial, Research, etc.
    sequence_category VARCHAR(50), -- Original, Response, etc.
    active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP,
    is_current BOOLEAN DEFAULT TRUE
);

-- Therapeutic area dimension with hierarchy
CREATE TABLE analytics.dim_therapeutic_area (
    therapeutic_area_id SERIAL PRIMARY KEY,
    meddra_soc_code VARCHAR(20),
    soc_name VARCHAR(100),
    meddra_hlgt_code VARCHAR(20),
    hlgt_name VARCHAR(100),
    meddra_hlt_code VARCHAR(20),
    hlt_name VARCHAR(100),
    active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP,
    is_current BOOLEAN DEFAULT TRUE
);

-- Product dimension with hierarchy
CREATE TABLE analytics.dim_product (
    product_id SERIAL PRIMARY KEY,
    product_code VARCHAR(50) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    active_ingredient VARCHAR(200),
    dosage_form VARCHAR(100),
    strength VARCHAR(100),
    therapeutic_area_id INTEGER REFERENCES analytics.dim_therapeutic_area(therapeutic_area_id),
    is_combination_product BOOLEAN DEFAULT FALSE,
    development_phase VARCHAR(20), -- Ph1, Ph2, Ph3, Marketed
    active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP,
    is_current BOOLEAN DEFAULT TRUE,
    UNIQUE (product_code, valid_from)
);

-- Sponsor/company dimension
CREATE TABLE analytics.dim_sponsor (
    sponsor_id SERIAL PRIMARY KEY,
    sponsor_code VARCHAR(50) NOT NULL,
    sponsor_name VARCHAR(200) NOT NULL,
    parent_company VARCHAR(200),
    industry_sector VARCHAR(100),
    region VARCHAR(50),
    country_code VARCHAR(3),
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP,
    is_current BOOLEAN DEFAULT TRUE,
    UNIQUE (sponsor_code, valid_from)
);

-- User dimension with role hierarchy
CREATE TABLE analytics.dim_user (
    user_id UUID PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    full_name VARCHAR(200),
    department VARCHAR(100),
    role_primary VARCHAR(50),
    role_secondary VARCHAR(50),
    is_external BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP,
    is_current BOOLEAN DEFAULT TRUE,
    UNIQUE (username, valid_from)
);

-- Document section dimension with CTD hierarchy
CREATE TABLE analytics.dim_document_section (
    section_id SERIAL PRIMARY KEY,
    section_code VARCHAR(20) NOT NULL,
    section_title VARCHAR(255) NOT NULL,
    parent_section_code VARCHAR(20),
    module_number SMALLINT NOT NULL,
    level_number SMALLINT NOT NULL,
    is_leaf BOOLEAN DEFAULT FALSE,
    is_required BOOLEAN DEFAULT FALSE,
    section_order INTEGER NOT NULL,
    template_available BOOLEAN DEFAULT FALSE,
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP,
    is_current BOOLEAN DEFAULT TRUE,
    UNIQUE (section_code, valid_from)
);

-- Status dimension for submissions and sections
CREATE TABLE analytics.dim_status (
    status_id SERIAL PRIMARY KEY,
    status_code VARCHAR(20) NOT NULL,
    status_name VARCHAR(100) NOT NULL,
    status_category VARCHAR(50) NOT NULL, -- Draft, Review, Final, etc.
    is_terminal BOOLEAN DEFAULT FALSE,
    status_order INTEGER NOT NULL,
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP,
    is_current BOOLEAN DEFAULT TRUE,
    UNIQUE (status_code, valid_from)
);

-- Document type dimension
CREATE TABLE analytics.dim_document_type (
    document_type_id SERIAL PRIMARY KEY,
    document_type_code VARCHAR(20) NOT NULL,
    document_type_name VARCHAR(100) NOT NULL,
    document_category VARCHAR(50) NOT NULL, -- Protocol, CSR, CMC, etc.
    is_regulatory BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP,
    is_current BOOLEAN DEFAULT TRUE,
    UNIQUE (document_type_code, valid_from)
);

-- Event type dimension
CREATE TABLE analytics.dim_event_type (
    event_type_id SERIAL PRIMARY KEY,
    event_type_code VARCHAR(20) NOT NULL,
    event_type_name VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL, -- System, User, Regulatory, etc.
    severity_level SMALLINT DEFAULT 3, -- 1=Info, 2=Warning, 3=Error, etc.
    requires_action BOOLEAN DEFAULT FALSE,
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP,
    is_current BOOLEAN DEFAULT TRUE,
    UNIQUE (event_type_code, valid_from)
);

----------------------------------------------------------------------
-- FACT TABLES FOR ANALYTICS
----------------------------------------------------------------------

-- Submission master fact table
CREATE TABLE analytics.fact_submission (
    submission_id UUID PRIMARY KEY,
    submission_name VARCHAR(255) NOT NULL,
    submission_type_id INTEGER REFERENCES analytics.dim_submission_type(submission_type_id),
    sponsor_id INTEGER REFERENCES analytics.dim_sponsor(sponsor_id),
    product_id INTEGER REFERENCES analytics.dim_product(product_id),
    authority_id INTEGER REFERENCES analytics.dim_regulatory_authority(authority_id),
    status_id INTEGER REFERENCES analytics.dim_status(status_id),
    therapeutic_area_id INTEGER REFERENCES analytics.dim_therapeutic_area(therapeutic_area_id),
    created_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    submitted_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    approved_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    last_updated_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    created_by_user_id UUID REFERENCES analytics.dim_user(user_id),
    submitted_by_user_id UUID REFERENCES analytics.dim_user(user_id),
    is_amendment BOOLEAN DEFAULT FALSE,
    original_submission_id UUID,
    expected_approval_date DATE,
    total_pages INTEGER,
    total_sections INTEGER,
    complete_sections INTEGER,
    target_submission_date DATE,
    actual_submission_date DATE,
    sequence_number VARCHAR(50),
    submission_tracking_number VARCHAR(100), -- FDA/EMA tracking ID
    is_expedited BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    completeness_score NUMERIC(5,2) DEFAULT 0,
    quality_score NUMERIC(5,2) DEFAULT 0,
    risk_score NUMERIC(5,2) DEFAULT 0
);

-- Section status fact table (temporal)
CREATE TABLE analytics.fact_section_status (
    section_status_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES analytics.fact_submission(submission_id),
    section_id INTEGER REFERENCES analytics.dim_document_section(section_id),
    status_id INTEGER REFERENCES analytics.dim_status(status_id),
    author_id UUID REFERENCES analytics.dim_user(user_id),
    reviewer_id UUID REFERENCES analytics.dim_user(user_id),
    approver_id UUID REFERENCES analytics.dim_user(user_id),
    status_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    last_edited_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    word_count INTEGER DEFAULT 0,
    page_count INTEGER DEFAULT 0,
    table_count INTEGER DEFAULT 0,
    figure_count INTEGER DEFAULT 0,
    citation_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    open_comment_count INTEGER DEFAULT 0,
    qa_issues_count INTEGER DEFAULT 0,
    completeness_score NUMERIC(5,2) DEFAULT 0,
    quality_score NUMERIC(5,2) DEFAULT 0,
    is_current BOOLEAN DEFAULT TRUE,
    valid_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP,
    UNIQUE (submission_id, section_id, valid_from)
);

-- Submission event fact table
CREATE TABLE analytics.fact_submission_event (
    event_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES analytics.fact_submission(submission_id),
    event_type_id INTEGER REFERENCES analytics.dim_event_type(event_type_id),
    event_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    event_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    section_id INTEGER REFERENCES analytics.dim_document_section(section_id),
    user_id UUID REFERENCES analytics.dim_user(user_id),
    event_details JSONB,
    duration_seconds INTEGER,
    affected_item_count INTEGER DEFAULT 1,
    is_automated BOOLEAN DEFAULT FALSE,
    status_before INTEGER REFERENCES analytics.dim_status(status_id),
    status_after INTEGER REFERENCES analytics.dim_status(status_id)
);

-- User activity fact table
CREATE TABLE analytics.fact_user_activity (
    activity_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES analytics.dim_user(user_id),
    submission_id UUID REFERENCES analytics.fact_submission(submission_id),
    section_id INTEGER REFERENCES analytics.dim_document_section(section_id),
    activity_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    activity_type VARCHAR(50) NOT NULL,
    activity_details JSONB,
    session_id UUID,
    ip_address VARCHAR(45),
    browser_info VARCHAR(255),
    duration_seconds INTEGER,
    items_affected INTEGER DEFAULT 1,
    is_mobile BOOLEAN DEFAULT FALSE
);

-- Document quality metrics fact table
CREATE TABLE analytics.fact_document_quality (
    quality_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES analytics.fact_submission(submission_id),
    section_id INTEGER REFERENCES analytics.dim_document_section(section_id),
    measure_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    spelling_error_count INTEGER DEFAULT 0,
    grammar_error_count INTEGER DEFAULT 0,
    style_issue_count INTEGER DEFAULT 0,
    broken_reference_count INTEGER DEFAULT 0,
    missing_citation_count INTEGER DEFAULT 0,
    missing_table_count INTEGER DEFAULT 0,
    missing_figure_count INTEGER DEFAULT 0,
    boilerplate_percentage NUMERIC(5,2) DEFAULT 0,
    duplicate_content_percentage NUMERIC(5,2) DEFAULT 0,
    readability_score NUMERIC(5,2), -- Flesch-Kincaid
    complexity_score NUMERIC(5,2),
    technical_language_score NUMERIC(5,2),
    regulatory_compliance_score NUMERIC(5,2),
    overall_quality_score NUMERIC(5,2)
);

-- Regulatory intelligence fact table
CREATE TABLE analytics.fact_regulatory_intelligence (
    intelligence_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    authority_id INTEGER REFERENCES analytics.dim_regulatory_authority(authority_id),
    therapeutic_area_id INTEGER REFERENCES analytics.dim_therapeutic_area(therapeutic_area_id),
    document_type_id INTEGER REFERENCES analytics.dim_document_type(document_type_id),
    publication_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    title VARCHAR(500) NOT NULL,
    summary TEXT,
    source_url VARCHAR(1000),
    source_type VARCHAR(100),
    impact_level SMALLINT, -- 1-5 scale
    relevance_score NUMERIC(5,2),
    affected_sections JSONB, -- Array of section codes
    guidance_text TEXT,
    is_major_change BOOLEAN DEFAULT FALSE,
    region_affected VARCHAR(100),
    embedding vector(1536) -- For semantic search using OpenAI embeddings
);

-- Submission approval fact table
CREATE TABLE analytics.fact_submission_approval (
    approval_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES analytics.fact_submission(submission_id),
    approval_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    authority_id INTEGER REFERENCES analytics.dim_regulatory_authority(authority_id),
    approval_type VARCHAR(100), -- Full, Conditional, etc.
    reviewer_name VARCHAR(255),
    review_duration_days INTEGER,
    approval_letter_ref VARCHAR(100),
    approval_conditions TEXT,
    post_marketing_requirements TEXT,
    questions_count INTEGER DEFAULT 0,
    deficiency_count INTEGER DEFAULT 0,
    major_amendment_count INTEGER DEFAULT 0,
    first_cycle_approval BOOLEAN DEFAULT TRUE
);

-- FDA ESG Gateway transaction fact table
CREATE TABLE analytics.fact_esg_transaction (
    transaction_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    submission_id UUID REFERENCES analytics.fact_submission(submission_id),
    esg_tracking_number VARCHAR(100),
    submission_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    ack1_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    ack2_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    ack3_date_id INTEGER REFERENCES analytics.dim_time(time_id),
    status VARCHAR(50),
    submission_format VARCHAR(50), -- eCTD, NeeS, etc.
    submission_size_mb NUMERIC(10,2),
    is_test_submission BOOLEAN DEFAULT FALSE,
    validation_errors_count INTEGER DEFAULT 0,
    validation_warnings_count INTEGER DEFAULT 0,
    time_to_ack1_minutes INTEGER,
    time_to_ack2_minutes INTEGER,
    time_to_ack3_minutes INTEGER,
    transaction_status VARCHAR(50),
    environment VARCHAR(20) -- Test, Production
);

----------------------------------------------------------------------
-- ANALYTICAL VIEWS
----------------------------------------------------------------------

-- Submission status view
CREATE OR REPLACE VIEW analytics.vw_submission_status AS
SELECT 
    f.submission_id,
    f.submission_name,
    st.submission_class,
    st.submission_subclass,
    s.status_name,
    p.product_name,
    sp.sponsor_name,
    ra.authority_name,
    ta.soc_name AS therapeutic_area,
    tc.date_value AS created_date,
    ts.date_value AS submitted_date,
    f.completeness_score,
    f.quality_score,
    f.risk_score,
    f.total_sections,
    f.complete_sections,
    CASE WHEN f.total_sections > 0 THEN 
        ROUND((f.complete_sections::NUMERIC / f.total_sections) * 100, 2)
    ELSE 0 END AS percent_complete,
    uc.full_name AS created_by,
    us.full_name AS submitted_by
FROM 
    analytics.fact_submission f
LEFT JOIN analytics.dim_submission_type st ON f.submission_type_id = st.submission_type_id
LEFT JOIN analytics.dim_status s ON f.status_id = s.status_id
LEFT JOIN analytics.dim_product p ON f.product_id = p.product_id
LEFT JOIN analytics.dim_sponsor sp ON f.sponsor_id = sp.sponsor_id
LEFT JOIN analytics.dim_regulatory_authority ra ON f.authority_id = ra.authority_id
LEFT JOIN analytics.dim_therapeutic_area ta ON f.therapeutic_area_id = ta.therapeutic_area_id
LEFT JOIN analytics.dim_time tc ON f.created_date_id = tc.time_id
LEFT JOIN analytics.dim_time ts ON f.submitted_date_id = ts.time_id
LEFT JOIN analytics.dim_user uc ON f.created_by_user_id = uc.user_id
LEFT JOIN analytics.dim_user us ON f.submitted_by_user_id = us.user_id
WHERE f.is_active = TRUE;

-- Section completeness view
CREATE OR REPLACE VIEW analytics.vw_section_completeness AS
SELECT 
    fs.submission_id,
    f.submission_name,
    ds.section_code,
    ds.section_title,
    ds.module_number,
    st.status_name,
    ua.full_name AS author_name,
    ur.full_name AS reviewer_name,
    uap.full_name AS approver_name,
    t.date_value AS status_date,
    fs.word_count,
    fs.page_count,
    fs.table_count,
    fs.figure_count,
    fs.citation_count,
    fs.comment_count,
    fs.open_comment_count,
    fs.qa_issues_count,
    fs.completeness_score,
    fs.quality_score
FROM 
    analytics.fact_section_status fs
JOIN analytics.fact_submission f ON fs.submission_id = f.submission_id
JOIN analytics.dim_document_section ds ON fs.section_id = ds.section_id
JOIN analytics.dim_status st ON fs.status_id = st.status_id
JOIN analytics.dim_time t ON fs.status_date_id = t.time_id
LEFT JOIN analytics.dim_user ua ON fs.author_id = ua.user_id
LEFT JOIN analytics.dim_user ur ON fs.reviewer_id = ur.user_id
LEFT JOIN analytics.dim_user uap ON fs.approver_id = uap.user_id
WHERE fs.is_current = TRUE;

-- User productivity view
CREATE OR REPLACE VIEW analytics.vw_user_productivity AS
SELECT 
    u.user_id,
    u.full_name,
    u.role_primary,
    t.date_value,
    t.month_name,
    t.year_value,
    COUNT(DISTINCT fa.submission_id) AS submissions_worked,
    COUNT(DISTINCT fa.section_id) AS sections_edited,
    SUM(CASE WHEN fa.activity_type = 'EDIT' THEN 1 ELSE 0 END) AS edit_count,
    SUM(CASE WHEN fa.activity_type = 'REVIEW' THEN 1 ELSE 0 END) AS review_count,
    SUM(CASE WHEN fa.activity_type = 'APPROVE' THEN 1 ELSE 0 END) AS approval_count,
    SUM(CASE WHEN fa.activity_type = 'COMMENT' THEN 1 ELSE 0 END) AS comment_count,
    SUM(fa.items_affected) AS items_affected,
    SUM(fa.duration_seconds) / 60.0 AS total_hours,
    SUM(fa.duration_seconds) / 3600.0 / 
        NULLIF(COUNT(DISTINCT fa.section_id), 0) AS hours_per_section
FROM 
    analytics.fact_user_activity fa
JOIN analytics.dim_user u ON fa.user_id = u.user_id
JOIN analytics.dim_time t ON fa.activity_date_id = t.time_id
GROUP BY 
    u.user_id, u.full_name, u.role_primary,
    t.date_value, t.month_name, t.year_value;

-- Regulatory performance view
CREATE OR REPLACE VIEW analytics.vw_regulatory_performance AS
SELECT 
    ra.authority_name,
    st.submission_class,
    ta.soc_name AS therapeutic_area,
    t.year_value,
    t.quarter_value,
    COUNT(DISTINCT fsa.submission_id) AS approval_count,
    AVG(fsa.review_duration_days) AS avg_review_days,
    MIN(fsa.review_duration_days) AS min_review_days,
    MAX(fsa.review_duration_days) AS max_review_days,
    SUM(CASE WHEN fsa.first_cycle_approval THEN 1 ELSE 0 END) AS first_cycle_count,
    CASE WHEN COUNT(DISTINCT fsa.submission_id) > 0 THEN
        ROUND((SUM(CASE WHEN fsa.first_cycle_approval THEN 1 ELSE 0 END)::NUMERIC / 
               COUNT(DISTINCT fsa.submission_id)) * 100, 2)
    ELSE 0 END AS first_cycle_percent,
    AVG(fsa.questions_count) AS avg_questions,
    AVG(fsa.deficiency_count) AS avg_deficiencies
FROM 
    analytics.fact_submission_approval fsa
JOIN analytics.fact_submission fs ON fsa.submission_id = fs.submission_id
JOIN analytics.dim_regulatory_authority ra ON fsa.authority_id = ra.authority_id
JOIN analytics.dim_submission_type st ON fs.submission_type_id = st.submission_type_id
JOIN analytics.dim_therapeutic_area ta ON fs.therapeutic_area_id = ta.therapeutic_area_id
JOIN analytics.dim_time t ON fsa.approval_date_id = t.time_id
GROUP BY 
    ra.authority_name, st.submission_class, ta.soc_name, t.year_value, t.quarter_value;

-- ESG submission performance view
CREATE OR REPLACE VIEW analytics.vw_esg_performance AS
SELECT 
    t.year_value,
    t.month_name,
    COUNT(DISTINCT fet.submission_id) AS submission_count,
    AVG(fet.time_to_ack1_minutes) / 60.0 AS avg_hours_to_ack1,
    AVG(fet.time_to_ack2_minutes) / 60.0 AS avg_hours_to_ack2,
    AVG(fet.time_to_ack3_minutes) / (60.0 * 24.0) AS avg_days_to_ack3,
    SUM(fet.validation_errors_count) AS total_validation_errors,
    SUM(fet.validation_warnings_count) AS total_validation_warnings,
    AVG(fet.validation_errors_count) AS avg_validation_errors,
    AVG(fet.validation_warnings_count) AS avg_validation_warnings,
    SUM(CASE WHEN fet.transaction_status = 'COMPLETE' THEN 1 ELSE 0 END) AS successful_count,
    CASE WHEN COUNT(DISTINCT fet.submission_id) > 0 THEN
        ROUND((SUM(CASE WHEN fet.transaction_status = 'COMPLETE' THEN 1 ELSE 0 END)::NUMERIC / 
               COUNT(DISTINCT fet.submission_id)) * 100, 2)
    ELSE 0 END AS success_rate
FROM 
    analytics.fact_esg_transaction fet
JOIN analytics.dim_time t ON fet.submission_date_id = t.time_id
GROUP BY 
    t.year_value, t.month_name
ORDER BY 
    t.year_value, t.month_name;

----------------------------------------------------------------------
-- ANALYTICAL PROCEDURES FOR ML DATA PREPARATION
----------------------------------------------------------------------

-- Function to prepare data for submission success prediction model
CREATE OR REPLACE FUNCTION analytics.prepare_submission_success_features(
    p_submission_id UUID
) RETURNS TABLE (
    submission_id UUID,
    submission_type VARCHAR,
    therapeutic_area VARCHAR,
    authority_name VARCHAR,
    total_sections INTEGER,
    completeness_score NUMERIC,
    quality_score NUMERIC,
    citation_count INTEGER,
    table_count INTEGER,
    figure_count INTEGER,
    comment_count INTEGER,
    qa_issue_count INTEGER,
    spelling_error_count INTEGER,
    grammar_error_count INTEGER,
    days_to_deadline INTEGER,
    success_probability NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH section_stats AS (
        SELECT 
            fs.submission_id,
            SUM(fs.citation_count) AS total_citations,
            SUM(fs.table_count) AS total_tables,
            SUM(fs.figure_count) AS total_figures,
            SUM(fs.comment_count) AS total_comments,
            SUM(fs.qa_issues_count) AS total_qa_issues
        FROM 
            analytics.fact_section_status fs
        WHERE 
            fs.is_current = TRUE
        GROUP BY 
            fs.submission_id
    ),
    quality_stats AS (
        SELECT 
            fq.submission_id,
            SUM(fq.spelling_error_count) AS total_spelling_errors,
            SUM(fq.grammar_error_count) AS total_grammar_errors
        FROM 
            analytics.fact_document_quality fq
        GROUP BY 
            fq.submission_id
    )
    SELECT 
        f.submission_id,
        st.submission_class || '-' || COALESCE(st.submission_subclass, '') AS submission_type,
        ta.soc_name AS therapeutic_area,
        ra.authority_name,
        f.total_sections,
        f.completeness_score,
        f.quality_score,
        COALESCE(ss.total_citations, 0) AS citation_count,
        COALESCE(ss.total_tables, 0) AS table_count,
        COALESCE(ss.total_figures, 0) AS figure_count,
        COALESCE(ss.total_comments, 0) AS comment_count,
        COALESCE(ss.total_qa_issues, 0) AS qa_issue_count,
        COALESCE(qs.total_spelling_errors, 0) AS spelling_error_count,
        COALESCE(qs.total_grammar_errors, 0) AS grammar_error_count,
        CASE 
            WHEN f.target_submission_date IS NOT NULL THEN 
                (f.target_submission_date - CURRENT_DATE)::INTEGER
            ELSE NULL
        END AS days_to_deadline,
        -- This would be replaced with actual ML model prediction in production
        -- For now using a simple heuristic based on completeness and quality
        CASE 
            WHEN f.completeness_score >= 90 AND f.quality_score >= 85 AND COALESCE(ss.total_qa_issues, 0) < 10 THEN
                0.9 -- High probability of success
            WHEN f.completeness_score >= 80 AND f.quality_score >= 75 THEN
                0.7 -- Good probability of success
            WHEN f.completeness_score >= 70 AND f.quality_score >= 65 THEN
                0.5 -- Moderate probability of success
            WHEN f.completeness_score >= 60 THEN
                0.3 -- Low probability of success
            ELSE
                0.1 -- Very low probability of success
        END AS success_probability
    FROM 
        analytics.fact_submission f
    JOIN analytics.dim_submission_type st ON f.submission_type_id = st.submission_type_id
    JOIN analytics.dim_therapeutic_area ta ON f.therapeutic_area_id = ta.therapeutic_area_id
    JOIN analytics.dim_regulatory_authority ra ON f.authority_id = ra.authority_id
    LEFT JOIN section_stats ss ON f.submission_id = ss.submission_id
    LEFT JOIN quality_stats qs ON f.submission_id = qs.submission_id
    WHERE 
        f.submission_id = p_submission_id;
END;
$$ LANGUAGE plpgsql;

----------------------------------------------------------------------
-- REAL-TIME EVENT STREAM PROCESSING
----------------------------------------------------------------------

-- Event log for streaming analytics
CREATE TABLE analytics.event_stream (
    event_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    event_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id UUID,
    submission_id UUID,
    section_id INTEGER,
    status_id INTEGER,
    event_data JSONB,
    processed BOOLEAN DEFAULT FALSE,
    processing_timestamp TIMESTAMP WITH TIME ZONE,
    processing_status VARCHAR(50)
);

-- Function to process an analytics event stream
CREATE OR REPLACE FUNCTION analytics.process_event_stream() 
RETURNS INTEGER AS $$
DECLARE
    v_processed_count INTEGER := 0;
    v_event RECORD;
    v_date_id INTEGER;
    v_submission_id UUID;
    v_section_id INTEGER;
    v_user_id UUID;
    v_event_type_id INTEGER;
    v_status_id INTEGER;
BEGIN
    -- Get unprocessed events
    FOR v_event IN 
        SELECT * FROM analytics.event_stream 
        WHERE processed = FALSE 
        ORDER BY event_timestamp 
        LIMIT 100
    LOOP
        BEGIN
            -- Get dimension keys
            SELECT time_id INTO v_date_id 
            FROM analytics.dim_time 
            WHERE date_value = DATE(v_event.event_timestamp);
            
            v_submission_id := v_event.submission_id;
            v_section_id := v_event.section_id;
            v_user_id := v_event.user_id;
            v_status_id := v_event.status_id;
            
            -- Get event type id
            SELECT event_type_id INTO v_event_type_id 
            FROM analytics.dim_event_type 
            WHERE event_type_code = v_event.event_type 
            AND is_current = TRUE;
            
            -- Insert into appropriate fact table based on event type
            IF v_event.event_type LIKE 'USER_%' THEN
                -- User activity events
                INSERT INTO analytics.fact_user_activity (
                    user_id, submission_id, section_id, activity_date_id,
                    activity_type, activity_details, session_id
                )
                VALUES (
                    v_user_id, v_submission_id, v_section_id, v_date_id,
                    REPLACE(v_event.event_type, 'USER_', ''),
                    v_event.event_data,
                    (v_event.event_data->>'session_id')::UUID
                );
                
            ELSIF v_event.event_type LIKE 'SECTION_%' THEN
                -- Section status events - update or insert
                IF EXISTS (
                    SELECT 1 FROM analytics.fact_section_status 
                    WHERE submission_id = v_submission_id 
                    AND section_id = v_section_id 
                    AND is_current = TRUE
                ) THEN
                    -- Close current record
                    UPDATE analytics.fact_section_status
                    SET is_current = FALSE,
                        valid_to = v_event.event_timestamp
                    WHERE submission_id = v_submission_id 
                    AND section_id = v_section_id 
                    AND is_current = TRUE;
                END IF;
                
                -- Insert new record
                INSERT INTO analytics.fact_section_status (
                    submission_id, section_id, status_id, author_id,
                    reviewer_id, status_date_id, word_count, page_count,
                    table_count, figure_count, citation_count, comment_count,
                    valid_from, is_current
                )
                VALUES (
                    v_submission_id, v_section_id, v_status_id,
                    (v_event.event_data->>'author_id')::UUID,
                    (v_event.event_data->>'reviewer_id')::UUID,
                    v_date_id,
                    (v_event.event_data->>'word_count')::INTEGER,
                    (v_event.event_data->>'page_count')::INTEGER,
                    (v_event.event_data->>'table_count')::INTEGER,
                    (v_event.event_data->>'figure_count')::INTEGER,
                    (v_event.event_data->>'citation_count')::INTEGER,
                    (v_event.event_data->>'comment_count')::INTEGER,
                    v_event.event_timestamp,
                    TRUE
                );
                
            ELSIF v_event.event_type LIKE 'SUBMISSION_%' THEN
                -- Submission events
                INSERT INTO analytics.fact_submission_event (
                    submission_id, event_type_id, event_date_id,
                    event_timestamp, section_id, user_id, event_details,
                    status_before, status_after
                )
                VALUES (
                    v_submission_id, v_event_type_id, v_date_id,
                    v_event.event_timestamp, v_section_id, v_user_id,
                    v_event.event_data,
                    (v_event.event_data->>'status_before')::INTEGER,
                    (v_event.event_data->>'status_after')::INTEGER
                );
                
                -- Update submission fact if needed
                IF v_event.event_type = 'SUBMISSION_STATUS_CHANGE' THEN
                    UPDATE analytics.fact_submission
                    SET status_id = (v_event.event_data->>'status_after')::INTEGER,
                        last_updated_date_id = v_date_id
                    WHERE submission_id = v_submission_id;
                ELSIF v_event.event_type = 'SUBMISSION_SUBMITTED' THEN
                    UPDATE analytics.fact_submission
                    SET submitted_date_id = v_date_id,
                        submitted_by_user_id = v_user_id,
                        actual_submission_date = DATE(v_event.event_timestamp)
                    WHERE submission_id = v_submission_id;
                END IF;
            END IF;
            
            -- Mark event as processed
            UPDATE analytics.event_stream
            SET processed = TRUE,
                processing_timestamp = CURRENT_TIMESTAMP,
                processing_status = 'SUCCESS'
            WHERE event_id = v_event.event_id;
            
            v_processed_count := v_processed_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Mark event as failed
            UPDATE analytics.event_stream
            SET processing_timestamp = CURRENT_TIMESTAMP,
                processing_status = 'ERROR: ' || SQLERRM
            WHERE event_id = v_event.event_id;
        END;
    END LOOP;
    
    RETURN v_processed_count;
END;
$$ LANGUAGE plpgsql;

----------------------------------------------------------------------
-- RBAC SECURITY MODEL FOR ANALYTICS
----------------------------------------------------------------------

-- Role-based access control for analytics
CREATE TABLE analytics.security_role (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(100) NOT NULL,
    role_description TEXT,
    is_admin BOOLEAN DEFAULT FALSE,
    view_dashboard BOOLEAN DEFAULT TRUE,
    edit_dashboard BOOLEAN DEFAULT FALSE,
    export_data BOOLEAN DEFAULT FALSE,
    view_user_activity BOOLEAN DEFAULT FALSE,
    view_regulatory_data BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE (role_name)
);

-- User-role assignments
CREATE TABLE analytics.security_user_role (
    user_id UUID REFERENCES analytics.dim_user(user_id),
    role_id INTEGER REFERENCES analytics.security_role(role_id),
    assigned_by UUID,
    assigned_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (user_id, role_id)
);

-- Submission-level security
CREATE TABLE analytics.security_submission_access (
    user_id UUID REFERENCES analytics.dim_user(user_id),
    submission_id UUID,
    access_level VARCHAR(20) NOT NULL, -- 'READ', 'EDIT', 'ADMIN'
    granted_by UUID,
    granted_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (user_id, submission_id)
);

-- Row-level security functions
CREATE OR REPLACE FUNCTION analytics.user_can_access_submission(
    p_user_id UUID,
    p_submission_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_can_access BOOLEAN;
    v_is_admin BOOLEAN;
BEGIN
    -- Check if user is admin
    SELECT EXISTS (
        SELECT 1 FROM analytics.security_user_role sur
        JOIN analytics.security_role sr ON sur.role_id = sr.role_id
        WHERE sur.user_id = p_user_id AND sr.is_admin = TRUE AND sur.is_active = TRUE
    ) INTO v_is_admin;
    
    IF v_is_admin THEN
        RETURN TRUE;
    END IF;
    
    -- Check submission-specific access
    SELECT EXISTS (
        SELECT 1 FROM analytics.security_submission_access
        WHERE user_id = p_user_id 
        AND submission_id = p_submission_id
        AND is_active = TRUE
        AND (expiry_date IS NULL OR expiry_date > CURRENT_TIMESTAMP)
    ) INTO v_can_access;
    
    RETURN v_can_access;
END;
$$ LANGUAGE plpgsql;

-- Enable row-level security
ALTER TABLE analytics.fact_submission ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.fact_section_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.fact_submission_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.fact_user_activity ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY submission_access_policy ON analytics.fact_submission
    USING (analytics.user_can_access_submission(current_user::UUID, submission_id));

CREATE POLICY section_access_policy ON analytics.fact_section_status
    USING (analytics.user_can_access_submission(current_user::UUID, submission_id));

CREATE POLICY event_access_policy ON analytics.fact_submission_event
    USING (analytics.user_can_access_submission(current_user::UUID, submission_id));

CREATE POLICY activity_access_policy ON analytics.fact_user_activity
    USING (
        current_user::UUID = user_id OR 
        analytics.user_can_access_submission(current_user::UUID, submission_id)
    );

----------------------------------------------------------------------
-- INITIAL DATA POPULATION
----------------------------------------------------------------------

-- Insert sample regulatory authorities
INSERT INTO analytics.dim_regulatory_authority (authority_code, authority_name, country_code, region)
VALUES 
    ('FDA', 'Food and Drug Administration', 'USA', 'North America'),
    ('EMA', 'European Medicines Agency', 'EU', 'Europe'),
    ('PMDA', 'Pharmaceuticals and Medical Devices Agency', 'JPN', 'Asia'),
    ('HC', 'Health Canada', 'CAN', 'North America'),
    ('MHRA', 'Medicines and Healthcare Products Regulatory Agency', 'GBR', 'Europe'),
    ('TGA', 'Therapeutic Goods Administration', 'AUS', 'Oceania'),
    ('NMPA', 'National Medical Products Administration', 'CHN', 'Asia');

-- Insert sample submission types
INSERT INTO analytics.dim_submission_type (submission_class, submission_subclass, submission_category, sequence_category)
VALUES 
    ('IND', 'Original', 'Commercial', 'Original'),
    ('IND', 'Amendment', 'Commercial', 'Amendment'),
    ('NDA', 'Original', 'Commercial', 'Original'),
    ('NDA', 'Supplement', 'Commercial', 'Supplement'),
    ('BLA', 'Original', 'Commercial', 'Original'),
    ('BLA', 'Supplement', 'Commercial', 'Supplement'),
    ('MAA', 'Original', 'Commercial', 'Original'),
    ('MAA', 'Variation', 'Commercial', 'Variation');

-- Insert sample therapeutic areas
INSERT INTO analytics.dim_therapeutic_area (meddra_soc_code, soc_name, meddra_hlgt_code, hlgt_name, meddra_hlt_code, hlt_name)
VALUES 
    ('10029104', 'Nervous system disorders', '10029205', 'Neurological disorders NEC', '10029322', 'Neurological signs and symptoms NEC'),
    ('10018065', 'Infections and infestations', '10021881', 'Infections - pathogen class unspecified', '10021918', 'Infections - site unspecified NEC'),
    ('10038738', 'Respiratory, thoracic and mediastinal disorders', '10046945', 'Respiratory disorders NEC', '10038741', 'Respiratory tract infections NEC'),
    ('10007541', 'Cardiac disorders', '10007548', 'Cardiac arrhythmias', '10007559', 'Rate and rhythm disorders NEC'),
    ('10005329', 'Blood and lymphatic system disorders', '10005342', 'Bone marrow disorders', '10005356', 'Anaemias nonhaemolytic and marrow depression');

-- Insert sample document sections (CTD structure)
INSERT INTO analytics.dim_document_section (section_code, section_title, parent_section_code, module_number, level_number, is_leaf, is_required, section_order, template_available)
VALUES 
    ('1', 'Administrative Information', NULL, 1, 1, FALSE, TRUE, 1, FALSE),
    ('1.1', 'Table of Contents', '1', 1, 2, TRUE, TRUE, 2, TRUE),
    ('1.2', 'Cover Letter', '1', 1, 2, TRUE, TRUE, 3, TRUE),
    ('1.3', 'Administrative Information', '1', 1, 2, FALSE, TRUE, 4, FALSE),
    ('1.3.1', 'Application Form', '1.3', 1, 3, TRUE, TRUE, 5, TRUE),
    ('1.3.2', 'Fee Payment Form', '1.3', 1, 3, TRUE, TRUE, 6, TRUE),
    
    ('2', 'Common Technical Document Summaries', NULL, 2, 1, FALSE, TRUE, 10, FALSE),
    ('2.1', 'CTD Table of Contents', '2', 2, 2, TRUE, TRUE, 11, TRUE),
    ('2.2', 'CTD Introduction', '2', 2, 2, TRUE, TRUE, 12, TRUE),
    ('2.3', 'Quality Overall Summary', '2', 2, 2, TRUE, TRUE, 13, TRUE),
    ('2.4', 'Nonclinical Overview', '2', 2, 2, TRUE, TRUE, 14, TRUE),
    ('2.5', 'Clinical Overview', '2', 2, 2, TRUE, TRUE, 15, TRUE),
    ('2.6', 'Nonclinical Written and Tabulated Summaries', '2', 2, 2, FALSE, TRUE, 16, FALSE),
    ('2.6.1', 'Introduction', '2.6', 2, 3, TRUE, TRUE, 17, TRUE),
    ('2.6.2', 'Pharmacology Written Summary', '2.6', 2, 3, TRUE, TRUE, 18, TRUE),
    ('2.6.3', 'Pharmacology Tabulated Summary', '2.6', 2, 3, TRUE, TRUE, 19, TRUE),
    ('2.6.4', 'Pharmacokinetics Written Summary', '2.6', 2, 3, TRUE, TRUE, 20, TRUE),
    ('2.6.5', 'Pharmacokinetics Tabulated Summary', '2.6', 2, 3, TRUE, TRUE, 21, TRUE),
    ('2.6.6', 'Toxicology Written Summary', '2.6', 2, 3, TRUE, TRUE, 22, TRUE),
    ('2.6.7', 'Toxicology Tabulated Summary', '2.6', 2, 3, TRUE, TRUE, 23, TRUE),
    ('2.7', 'Clinical Summary', '2', 2, 2, FALSE, TRUE, 24, FALSE),
    ('2.7.1', 'Summary of Biopharmaceutic Studies', '2.7', 2, 3, TRUE, TRUE, 25, TRUE),
    ('2.7.2', 'Summary of Clinical Pharmacology Studies', '2.7', 2, 3, TRUE, TRUE, 26, TRUE),
    ('2.7.3', 'Summary of Clinical Efficacy', '2.7', 2, 3, TRUE, TRUE, 27, TRUE),
    ('2.7.4', 'Summary of Clinical Safety', '2.7', 2, 3, TRUE, TRUE, 28, TRUE),
    ('2.7.5', 'Literature References', '2.7', 2, 3, TRUE, FALSE, 29, TRUE),
    ('2.7.6', 'Synopses of Individual Studies', '2.7', 2, 3, TRUE, TRUE, 30, TRUE),
    
    ('3', 'Quality', NULL, 3, 1, FALSE, TRUE, 100, FALSE),
    ('3.1', 'Table of Contents', '3', 3, 2, TRUE, TRUE, 101, TRUE),
    ('3.2', 'Body of Data', '3', 3, 2, FALSE, TRUE, 102, FALSE),
    ('3.2.S', 'Drug Substance', '3.2', 3, 3, FALSE, TRUE, 103, FALSE),
    ('3.2.S.1', 'General Information', '3.2.S', 3, 4, TRUE, TRUE, 104, TRUE),
    ('3.2.S.2', 'Manufacture', '3.2.S', 3, 4, TRUE, TRUE, 105, TRUE),
    
    ('4', 'Nonclinical Study Reports', NULL, 4, 1, FALSE, TRUE, 200, FALSE),
    ('4.1', 'Table of Contents', '4', 4, 2, TRUE, TRUE, 201, TRUE),
    ('4.2', 'Study Reports', '4', 4, 2, FALSE, TRUE, 202, FALSE),
    ('4.2.1', 'Pharmacology', '4.2', 4, 3, FALSE, TRUE, 203, FALSE),
    ('4.2.1.1', 'Primary Pharmacodynamics', '4.2.1', 4, 4, TRUE, TRUE, 204, TRUE),
    
    ('5', 'Clinical Study Reports', NULL, 5, 1, FALSE, TRUE, 300, FALSE),
    ('5.1', 'Table of Contents', '5', 5, 2, TRUE, TRUE, 301, TRUE),
    ('5.2', 'Tabular Listing of All Clinical Studies', '5', 5, 2, TRUE, TRUE, 302, TRUE),
    ('5.3', 'Clinical Study Reports', '5', 5, 2, FALSE, TRUE, 303, FALSE),
    ('5.3.1', 'Reports of Biopharmaceutic Studies', '5.3', 5, 3, FALSE, TRUE, 304, FALSE),
    ('5.3.1.1', 'Bioavailability (BA) Study Reports', '5.3.1', 5, 4, TRUE, FALSE, 305, TRUE);

-- Insert sample status values
INSERT INTO analytics.dim_status (status_code, status_name, status_category, is_terminal, status_order)
VALUES 
    ('NOT_STARTED', 'Not Started', 'Draft', FALSE, 1),
    ('IN_PROGRESS', 'In Progress', 'Draft', FALSE, 2),
    ('DRAFT_COMPLETE', 'Draft Complete', 'Draft', FALSE, 3),
    ('IN_REVIEW', 'In Review', 'Review', FALSE, 4),
    ('REVIEWED', 'Reviewed', 'Review', FALSE, 5),
    ('NEEDS_REVISION', 'Needs Revision', 'Review', FALSE, 6),
    ('REVISION_COMPLETE', 'Revision Complete', 'Review', FALSE, 7),
    ('APPROVED', 'Approved', 'Final', FALSE, 8),
    ('SIGNED', 'Signed', 'Final', TRUE, 9),
    ('SUBMITTED', 'Submitted', 'Submission', TRUE, 10);

-- Insert sample event types
INSERT INTO analytics.dim_event_type (event_type_code, event_type_name, event_category, severity_level, requires_action)
VALUES 
    ('USER_LOGIN', 'User Login', 'User', 1, FALSE),
    ('USER_LOGOUT', 'User Logout', 'User', 1, FALSE),
    ('USER_EDIT', 'User Edit Content', 'User', 1, FALSE),
    ('USER_REVIEW', 'User Review Content', 'User', 1, FALSE),
    ('USER_APPROVE', 'User Approve Content', 'User', 1, FALSE),
    ('USER_SIGN', 'User Sign Content', 'User', 1, FALSE),
    ('USER_COMMENT', 'User Add Comment', 'User', 1, FALSE),
    ('SECTION_STATUS_CHANGE', 'Section Status Change', 'System', 1, FALSE),
    ('SECTION_CONTENT_UPDATE', 'Section Content Update', 'System', 1, FALSE),
    ('SUBMISSION_CREATED', 'Submission Created', 'System', 1, FALSE),
    ('SUBMISSION_STATUS_CHANGE', 'Submission Status Change', 'System', 1, FALSE),
    ('SUBMISSION_SUBMITTED', 'Submission Submitted', 'System', 1, FALSE),
    ('ESG_SUBMISSION', 'ESG Submission', 'Regulatory', 1, FALSE),
    ('ESG_ACK1', 'ESG ACK1 Received', 'Regulatory', 1, FALSE),
    ('ESG_ACK2', 'ESG ACK2 Received', 'Regulatory', 1, FALSE),
    ('ESG_ACK3', 'ESG ACK3 Received', 'Regulatory', 1, FALSE),
    ('VALIDATION_ERROR', 'Validation Error', 'System', 3, TRUE),
    ('VALIDATION_WARNING', 'Validation Warning', 'System', 2, FALSE),
    ('SECURITY_VIOLATION', 'Security Violation', 'Security', 4, TRUE),
    ('DOCUMENT_EXPORT', 'Document Export', 'System', 1, FALSE);

-- Sample security roles
INSERT INTO analytics.security_role (role_name, role_description, is_admin, view_dashboard, edit_dashboard, export_data, view_user_activity, view_regulatory_data)
VALUES 
    ('Analytics Admin', 'Full access to all analytics features', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('Analytics Viewer', 'Read-only access to analytics dashboards', FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Analytics Power User', 'Can view and create dashboards, export data', FALSE, TRUE, TRUE, TRUE, FALSE, FALSE),
    ('Regulatory Analyst', 'Access to regulatory performance data', FALSE, TRUE, FALSE, TRUE, FALSE, TRUE),
    ('Management', 'Executive dashboard access', FALSE, TRUE, FALSE, TRUE, TRUE, TRUE);

----------------------------------------------------------------------
-- INDEXES AND OPTIMIZATIONS
----------------------------------------------------------------------

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_fact_submission_dates ON analytics.fact_submission(created_date_id, submitted_date_id, approved_date_id);
CREATE INDEX IF NOT EXISTS idx_fact_section_status_current ON analytics.fact_section_status(submission_id, section_id, is_current);
CREATE INDEX IF NOT EXISTS idx_fact_user_activity_dates ON analytics.fact_user_activity(user_id, activity_date_id);
CREATE INDEX IF NOT EXISTS idx_fact_submission_event_dates ON analytics.fact_submission_event(submission_id, event_date_id);
CREATE INDEX IF NOT EXISTS idx_fact_document_quality_dates ON analytics.fact_document_quality(submission_id, measure_date_id);
CREATE INDEX IF NOT EXISTS idx_fact_regulatory_intelligence_dates ON analytics.fact_regulatory_intelligence(publication_date_id);
CREATE INDEX IF NOT EXISTS idx_fact_esg_transaction_dates ON analytics.fact_esg_transaction(submission_date_id, ack1_date_id, ack2_date_id, ack3_date_id);

-- Add GIN index for JSON columns
CREATE INDEX IF NOT EXISTS idx_fact_submission_event_details ON analytics.fact_submission_event USING GIN (event_details);
CREATE INDEX IF NOT EXISTS idx_fact_user_activity_details ON analytics.fact_user_activity USING GIN (activity_details);
CREATE INDEX IF NOT EXISTS idx_event_stream_data ON analytics.event_stream USING GIN (event_data);

-- Add vector index for embeddings
CREATE INDEX IF NOT EXISTS idx_fact_regulatory_intelligence_embedding ON analytics.fact_regulatory_intelligence USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Hypercube optimizations - materialized aggregate views for common queries
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_submission_completeness_by_therapeutic_area AS
SELECT 
    ta.therapeutic_area_id,
    ta.soc_name AS therapeutic_area,
    ra.authority_id,
    ra.authority_name,
    st.submission_type_id,
    st.submission_class,
    st.submission_subclass,
    COUNT(DISTINCT fs.submission_id) AS submission_count,
    AVG(fs.completeness_score) AS avg_completeness_score,
    AVG(fs.quality_score) AS avg_quality_score,
    SUM(fs.complete_sections) AS complete_sections,
    SUM(fs.total_sections) AS total_sections,
    CASE WHEN SUM(fs.total_sections) > 0 THEN
        ROUND((SUM(fs.complete_sections)::NUMERIC / SUM(fs.total_sections)) * 100, 2)
    ELSE 0 END AS overall_completion_percentage
FROM 
    analytics.fact_submission fs
JOIN analytics.dim_therapeutic_area ta ON fs.therapeutic_area_id = ta.therapeutic_area_id
JOIN analytics.dim_regulatory_authority ra ON fs.authority_id = ra.authority_id
JOIN analytics.dim_submission_type st ON fs.submission_type_id = st.submission_type_id
WHERE 
    fs.is_active = TRUE
GROUP BY 
    ta.therapeutic_area_id, ta.soc_name, ra.authority_id, ra.authority_name,
    st.submission_type_id, st.submission_class, st.submission_subclass;

-- Refresh schedule for materialized views
CREATE OR REPLACE FUNCTION analytics.refresh_materialized_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_submission_completeness_by_therapeutic_area;
    -- Add more materialized views as needed
END;
$$ LANGUAGE plpgsql;

-- Index for materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_submission_completeness 
ON analytics.mv_submission_completeness_by_therapeutic_area (therapeutic_area_id, authority_id, submission_type_id);

COMMENT ON SCHEMA analytics IS 'Advanced analytics schema for TrialSage IND Wizard platform';