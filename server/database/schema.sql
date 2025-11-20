-- CSR Intelligence Database Schema
-- Production-grade schema for comprehensive CSR analysis and business intelligence

-- Core CSR Reports Table
CREATE TABLE IF NOT EXISTS csr_reports (
    id SERIAL PRIMARY KEY,
    study_id VARCHAR(100) UNIQUE NOT NULL,
    protocol_number VARCHAR(50) NOT NULL,
    study_title TEXT NOT NULL,
    sponsor VARCHAR(200) NOT NULL,
    therapeutic_area VARCHAR(100) NOT NULL,
    indication VARCHAR(200) NOT NULL,
    study_phase VARCHAR(20) NOT NULL,
    study_type VARCHAR(50) NOT NULL,
    primary_endpoint TEXT NOT NULL,
    secondary_endpoints TEXT[],
    patient_population TEXT NOT NULL,
    sample_size INTEGER NOT NULL,
    study_duration_months INTEGER NOT NULL,
    geographical_scope VARCHAR(100) NOT NULL,
    regulatory_pathway VARCHAR(100) NOT NULL,
    primary_efficacy_met BOOLEAN NOT NULL,
    safety_profile VARCHAR(50) NOT NULL,
    regulatory_outcome VARCHAR(50) NOT NULL,
    approval_date DATE,
    market_access_timeline INTEGER,
    development_cost_millions DECIMAL(10,2),
    peak_sales_millions DECIMAL(12,2),
    biomarker_strategy TEXT,
    companion_diagnostic BOOLEAN DEFAULT FALSE,
    adaptive_design BOOLEAN DEFAULT FALSE,
    real_world_evidence BOOLEAN DEFAULT FALSE,
    patient_reported_outcomes BOOLEAN DEFAULT FALSE,
    digital_endpoints BOOLEAN DEFAULT FALSE,
    ai_enhanced_analysis BOOLEAN DEFAULT FALSE,
    risk_factors TEXT[],
    success_drivers TEXT[],
    failure_factors TEXT[],
    competitive_landscape TEXT,
    market_dynamics TEXT,
    regulatory_interactions TEXT,
    quality_score INTEGER DEFAULT 0,
    completeness_score INTEGER DEFAULT 0,
    consistency_score INTEGER DEFAULT 0,
    timeliness_score INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    document_path TEXT,
    file_size_mb DECIMAL(8,2),
    processing_status VARCHAR(50) DEFAULT 'pending',
    extraction_metadata JSONB,
    analysis_results JSONB,
    business_insights JSONB,
    predictive_analytics JSONB
);

-- CSR Business Insights Table
CREATE TABLE IF NOT EXISTS csr_business_insights (
    id SERIAL PRIMARY KEY,
    csr_report_id INTEGER REFERENCES csr_reports(id) ON DELETE CASCADE,
    insight_type VARCHAR(100) NOT NULL,
    insight_category VARCHAR(100) NOT NULL,
    business_impact_millions DECIMAL(10,2),
    timeline_savings_months DECIMAL(4,1),
    confidence_score INTEGER NOT NULL,
    evidence_strength VARCHAR(20) NOT NULL,
    recommendation_priority VARCHAR(20) NOT NULL,
    actionable_insights TEXT[],
    risk_mitigation_strategies TEXT[],
    competitive_advantages TEXT[],
    regulatory_implications TEXT,
    market_opportunity_analysis TEXT,
    implementation_timeline TEXT,
    resource_requirements TEXT,
    success_probability DECIMAL(5,2),
    roi_projection DECIMAL(8,2),
    client_segment VARCHAR(50),
    therapeutic_area_specificity TEXT,
    regulatory_pathway_optimization TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    insight_metadata JSONB,
    validation_status VARCHAR(50) DEFAULT 'pending',
    client_feedback JSONB
);

-- Predictive Analytics Models Table
CREATE TABLE IF NOT EXISTS predictive_models (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    therapeutic_area VARCHAR(100) NOT NULL,
    model_version VARCHAR(20) NOT NULL,
    training_data_size INTEGER NOT NULL,
    validation_accuracy DECIMAL(5,2),
    feature_importance JSONB,
    model_parameters JSONB,
    performance_metrics JSONB,
    deployment_status VARCHAR(50) DEFAULT 'development',
    last_trained_at TIMESTAMP,
    model_file_path TEXT,
    prediction_categories TEXT[],
    business_value_metrics JSONB,
    regulatory_compliance_score INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CSR Success Predictions Table
CREATE TABLE IF NOT EXISTS csr_success_predictions (
    id SERIAL PRIMARY KEY,
    csr_report_id INTEGER REFERENCES csr_reports(id) ON DELETE CASCADE,
    model_id INTEGER REFERENCES predictive_models(id),
    prediction_type VARCHAR(50) NOT NULL,
    success_probability DECIMAL(5,2) NOT NULL,
    confidence_interval_lower DECIMAL(5,2),
    confidence_interval_upper DECIMAL(5,2),
    key_success_factors TEXT[],
    risk_factors TEXT[],
    mitigation_strategies TEXT[],
    predicted_timeline_months INTEGER,
    predicted_cost_millions DECIMAL(10,2),
    regulatory_approval_probability DECIMAL(5,2),
    market_success_probability DECIMAL(5,2),
    competitive_positioning_score INTEGER,
    patient_access_score INTEGER,
    commercial_viability_score INTEGER,
    strategic_recommendations TEXT[],
    business_impact_analysis JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    model_confidence_score INTEGER,
    validation_results JSONB,
    real_world_validation BOOLEAN DEFAULT FALSE
);

-- Competitive Intelligence Table
CREATE TABLE IF NOT EXISTS competitive_intelligence (
    id SERIAL PRIMARY KEY,
    competitor_name VARCHAR(200) NOT NULL,
    competitor_study_id VARCHAR(100),
    therapeutic_area VARCHAR(100) NOT NULL,
    indication VARCHAR(200) NOT NULL,
    development_stage VARCHAR(50) NOT NULL,
    mechanism_of_action TEXT,
    target_patient_population TEXT,
    competitive_advantages TEXT[],
    competitive_disadvantages TEXT[],
    market_positioning VARCHAR(100),
    pricing_strategy TEXT,
    regulatory_strategy TEXT,
    timeline_to_market INTEGER,
    peak_sales_projection DECIMAL(12,2),
    market_share_projection DECIMAL(5,2),
    strategic_threats TEXT[],
    strategic_opportunities TEXT[],
    intellectual_property_status TEXT,
    partnership_strategy TEXT,
    clinical_differentiation TEXT,
    commercial_strategy TEXT,
    competitive_response_recommendations TEXT[],
    monitoring_priority VARCHAR(20),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_sources TEXT[],
    intelligence_confidence_score INTEGER,
    strategic_impact_score INTEGER,
    business_intelligence_metadata JSONB
);

-- Regulatory Strategy Intelligence Table
CREATE TABLE IF NOT EXISTS regulatory_strategy_intelligence (
    id SERIAL PRIMARY KEY,
    csr_report_id INTEGER REFERENCES csr_reports(id) ON DELETE CASCADE,
    regulatory_authority VARCHAR(50) NOT NULL,
    submission_type VARCHAR(50) NOT NULL,
    regulatory_pathway VARCHAR(100) NOT NULL,
    submission_strategy TEXT,
    key_regulatory_considerations TEXT[],
    regulatory_risk_factors TEXT[],
    regulatory_opportunities TEXT[],
    fda_meeting_history TEXT,
    regulatory_precedents TEXT,
    guidance_document_alignment TEXT,
    regulatory_timeline_optimization TEXT,
    submission_quality_score INTEGER,
    regulatory_success_probability DECIMAL(5,2),
    approval_timeline_months INTEGER,
    regulatory_cost_millions DECIMAL(8,2),
    regulatory_advantages TEXT[],
    regulatory_challenges TEXT[],
    mitigation_strategies TEXT[],
    regulatory_intelligence_insights TEXT[],
    breakthrough_designation_potential BOOLEAN DEFAULT FALSE,
    fast_track_designation_potential BOOLEAN DEFAULT FALSE,
    orphan_drug_designation_potential BOOLEAN DEFAULT FALSE,
    priority_review_potential BOOLEAN DEFAULT FALSE,
    accelerated_approval_potential BOOLEAN DEFAULT FALSE,
    regulatory_consultation_recommendations TEXT[],
    regulatory_compliance_score INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    regulatory_metadata JSONB,
    validation_status VARCHAR(50) DEFAULT 'pending'
);

-- Client Success Metrics Table
CREATE TABLE IF NOT EXISTS client_success_metrics (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(100) NOT NULL,
    client_name VARCHAR(200) NOT NULL,
    client_type VARCHAR(50) NOT NULL,
    industry_segment VARCHAR(100) NOT NULL,
    therapeutic_areas TEXT[],
    engagement_start_date DATE NOT NULL,
    total_studies_analyzed INTEGER DEFAULT 0,
    total_cost_savings_millions DECIMAL(12,2) DEFAULT 0,
    total_timeline_savings_months DECIMAL(8,1) DEFAULT 0,
    average_roi_multiplier DECIMAL(8,2) DEFAULT 0,
    success_rate_improvement DECIMAL(5,2) DEFAULT 0,
    regulatory_approval_rate DECIMAL(5,2) DEFAULT 0,
    market_success_rate DECIMAL(5,2) DEFAULT 0,
    client_satisfaction_score INTEGER DEFAULT 0,
    key_achievements TEXT[],
    success_stories TEXT[],
    testimonials TEXT[],
    case_studies TEXT[],
    business_impact_summary TEXT,
    strategic_value_delivered TEXT,
    ongoing_initiatives TEXT[],
    future_opportunities TEXT[],
    client_feedback_history JSONB,
    account_health_score INTEGER DEFAULT 0,
    renewal_probability DECIMAL(5,2) DEFAULT 0,
    expansion_opportunities TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    client_metadata JSONB,
    engagement_metrics JSONB,
    business_outcomes JSONB
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_csr_reports_therapeutic_area ON csr_reports(therapeutic_area);
CREATE INDEX IF NOT EXISTS idx_csr_reports_study_phase ON csr_reports(study_phase);
CREATE INDEX IF NOT EXISTS idx_csr_reports_regulatory_outcome ON csr_reports(regulatory_outcome);
CREATE INDEX IF NOT EXISTS idx_csr_reports_created_at ON csr_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_csr_business_insights_type ON csr_business_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_csr_business_insights_category ON csr_business_insights(insight_category);
CREATE INDEX IF NOT EXISTS idx_predictive_models_therapeutic_area ON predictive_models(therapeutic_area);
CREATE INDEX IF NOT EXISTS idx_competitive_intelligence_therapeutic_area ON competitive_intelligence(therapeutic_area);
CREATE INDEX IF NOT EXISTS idx_regulatory_strategy_authority ON regulatory_strategy_intelligence(regulatory_authority);
CREATE INDEX IF NOT EXISTS idx_client_success_metrics_client_type ON client_success_metrics(client_type);

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_csr_reports_study_title_fulltext ON csr_reports USING gin(to_tsvector('english', study_title));
CREATE INDEX IF NOT EXISTS idx_csr_reports_indication_fulltext ON csr_reports USING gin(to_tsvector('english', indication));
CREATE INDEX IF NOT EXISTS idx_competitive_intelligence_competitor_fulltext ON competitive_intelligence USING gin(to_tsvector('english', competitor_name));