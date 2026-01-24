-- Migration 072: Innovation Platform Core - 8 Enterprise Features
-- Purpose: Production-grade schemas for all 8 innovative platform features
--
-- This migration implements comprehensive schemas for:
--   1. Regulatory Delta Radar - change detection against agency guidance
--   2. Evidence Confidence Heatmap - live citation scoring
--   3. Submission Readiness Twin - predictive GA score
--   4. Auto-traceability from Drafts - automatic linking
--   5. Adaptive Reviewer Workspace - role-specific UI
--   6. Outcome-based Template Learning - effectiveness tracking
--   7. Regulatory Negotiation Logbook - correspondence record
--   8. Compliance Guardrails SDK - pre-submission validation
--
-- Philosophy: Every feature is designed for production scale with:
--   - Full multi-tenancy via program_id/org_id ownership
--   - Complete audit trails for Part 11 compliance
--   - Performance-optimized indexing
--   - Temporal tracking for analytics

BEGIN;

-- =============================================================================
-- SCHEMA: innovation - Houses all 8 innovative feature tables
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS innovation;

COMMENT ON SCHEMA innovation IS 'Enterprise innovation platform features for regulatory intelligence';

-- =============================================================================
-- FEATURE 1: Regulatory Delta Radar
-- Auto-surface change suggestions vs agency guidance
-- =============================================================================

-- Guidance document registry (FDA, EMA, ICH, etc.)
CREATE TABLE IF NOT EXISTS innovation.guidance_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identification
  agency VARCHAR(50) NOT NULL,                     -- 'FDA', 'EMA', 'ICH', 'PMDA', 'Health Canada'
  document_number VARCHAR(100),                    -- e.g., 'FDA-2024-D-1234'
  title TEXT NOT NULL,
  version VARCHAR(50),
  
  -- Content
  content_hash VARCHAR(64) NOT NULL,              -- SHA-256 for change detection
  content_text TEXT,                              -- Full text for semantic matching
  content_embedding VECTOR(1536),                 -- OpenAI embedding for similarity
  
  -- Metadata
  effective_date DATE,
  publication_date DATE NOT NULL,
  supersedes_document_id UUID REFERENCES innovation.guidance_documents(id),
  
  -- Classification
  therapeutic_area VARCHAR(100)[],                -- Array of therapeutic areas
  submission_types VARCHAR(50)[],                 -- 'IND', 'NDA', 'BLA', '510k', etc.
  document_type VARCHAR(50) NOT NULL,             -- 'draft_guidance', 'final_guidance', 'regulation'
  
  -- Source
  source_url TEXT,
  source_filename TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT CURRENT_USER
);

CREATE INDEX idx_guidance_docs_agency ON innovation.guidance_documents(agency);
CREATE INDEX idx_guidance_docs_type ON innovation.guidance_documents(document_type);
CREATE INDEX idx_guidance_docs_therapeutic ON innovation.guidance_documents USING GIN(therapeutic_area);
CREATE INDEX idx_guidance_docs_submission ON innovation.guidance_documents USING GIN(submission_types);
CREATE INDEX idx_guidance_docs_embedding ON innovation.guidance_documents USING ivfflat (content_embedding vector_cosine_ops) WITH (lists = 100);

-- Delta radar scans
CREATE TABLE IF NOT EXISTS innovation.delta_radar_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  
  -- Scan configuration
  scan_type VARCHAR(50) NOT NULL,                 -- 'full', 'incremental', 'targeted'
  target_guidance_ids UUID[],                     -- Specific guidance to check
  
  -- Results summary
  total_deltas_found INT NOT NULL DEFAULT 0,
  critical_deltas INT NOT NULL DEFAULT 0,
  high_deltas INT NOT NULL DEFAULT 0,
  medium_deltas INT NOT NULL DEFAULT 0,
  low_deltas INT NOT NULL DEFAULT 0,
  
  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT CURRENT_USER
);

CREATE INDEX idx_delta_scans_program ON innovation.delta_radar_scans(program_id);
CREATE INDEX idx_delta_scans_org ON innovation.delta_radar_scans(org_id);
CREATE INDEX idx_delta_scans_status ON innovation.delta_radar_scans(status);

-- Individual delta findings
CREATE TABLE IF NOT EXISTS innovation.delta_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- References
  scan_id UUID NOT NULL REFERENCES innovation.delta_radar_scans(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  guidance_document_id UUID NOT NULL REFERENCES innovation.guidance_documents(id),
  
  -- Affected content
  affected_document_id UUID,                      -- Document in submission that needs update
  affected_section_path TEXT,                     -- e.g., 'm2.5/clinical-overview/safety'
  
  -- Delta details
  delta_type VARCHAR(50) NOT NULL,                -- 'new_requirement', 'changed_requirement', 'removed_requirement'
  severity VARCHAR(20) NOT NULL,                  -- 'critical', 'high', 'medium', 'low'
  
  -- Description
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  guidance_text TEXT,                             -- Relevant excerpt from guidance
  current_state TEXT,                             -- Current state in submission
  recommended_action TEXT NOT NULL,
  
  -- AI analysis
  confidence_score FLOAT NOT NULL DEFAULT 0.8 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  semantic_similarity FLOAT,                      -- How close current text is to requirement
  
  -- Resolution tracking
  status VARCHAR(30) NOT NULL DEFAULT 'open',     -- 'open', 'acknowledged', 'in_progress', 'resolved', 'dismissed'
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delta_findings_scan ON innovation.delta_findings(scan_id);
CREATE INDEX idx_delta_findings_program ON innovation.delta_findings(program_id);
CREATE INDEX idx_delta_findings_severity ON innovation.delta_findings(severity);
CREATE INDEX idx_delta_findings_status ON innovation.delta_findings(status);
CREATE INDEX idx_delta_findings_guidance ON innovation.delta_findings(guidance_document_id);

-- =============================================================================
-- FEATURE 2: Evidence Confidence Heatmap
-- Live scoring showing weak citation areas
-- =============================================================================

-- Evidence scoring configurations
CREATE TABLE IF NOT EXISTS innovation.evidence_scoring_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  org_id UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  
  -- Configuration
  name VARCHAR(200) NOT NULL,
  description TEXT,
  
  -- Scoring weights (must sum to 1.0)
  weight_citation_density FLOAT NOT NULL DEFAULT 0.20,
  weight_citation_quality FLOAT NOT NULL DEFAULT 0.25,
  weight_data_recency FLOAT NOT NULL DEFAULT 0.15,
  weight_source_authority FLOAT NOT NULL DEFAULT 0.20,
  weight_consistency FLOAT NOT NULL DEFAULT 0.20,
  
  -- Thresholds
  critical_threshold FLOAT NOT NULL DEFAULT 0.3,   -- Below this = critical gap
  warning_threshold FLOAT NOT NULL DEFAULT 0.6,    -- Below this = warning
  
  -- Status
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT CURRENT_USER,
  
  -- Ensure weights sum to 1
  CONSTRAINT valid_weights CHECK (
    ABS((weight_citation_density + weight_citation_quality + weight_data_recency + 
         weight_source_authority + weight_consistency) - 1.0) < 0.001
  )
);

CREATE INDEX idx_evidence_config_org ON innovation.evidence_scoring_configs(org_id);

-- Evidence confidence assessments
CREATE TABLE IF NOT EXISTS innovation.evidence_confidence_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  document_id UUID,                               -- If assessing a specific document
  
  -- Assessment scope
  assessment_type VARCHAR(50) NOT NULL,           -- 'full_submission', 'module', 'section', 'claim'
  section_path TEXT,                              -- e.g., 'm2.7/clinical-summary'
  
  -- Scoring
  overall_score FLOAT NOT NULL CHECK (overall_score >= 0 AND overall_score <= 1),
  citation_density_score FLOAT CHECK (citation_density_score >= 0 AND citation_density_score <= 1),
  citation_quality_score FLOAT CHECK (citation_quality_score >= 0 AND citation_quality_score <= 1),
  data_recency_score FLOAT CHECK (data_recency_score >= 0 AND data_recency_score <= 1),
  source_authority_score FLOAT CHECK (source_authority_score >= 0 AND source_authority_score <= 1),
  consistency_score FLOAT CHECK (consistency_score >= 0 AND consistency_score <= 1),
  
  -- Statistics
  total_claims INT NOT NULL DEFAULT 0,
  supported_claims INT NOT NULL DEFAULT 0,
  unsupported_claims INT NOT NULL DEFAULT 0,
  weakly_supported_claims INT NOT NULL DEFAULT 0,
  
  total_citations INT NOT NULL DEFAULT 0,
  strong_citations INT NOT NULL DEFAULT 0,
  moderate_citations INT NOT NULL DEFAULT 0,
  weak_citations INT NOT NULL DEFAULT 0,
  
  -- Configuration used
  config_id UUID REFERENCES innovation.evidence_scoring_configs(id),
  
  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'completed',
  
  -- Audit
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assessed_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_evidence_assess_program ON innovation.evidence_confidence_assessments(program_id);
CREATE INDEX idx_evidence_assess_type ON innovation.evidence_confidence_assessments(assessment_type);
CREATE INDEX idx_evidence_assess_score ON innovation.evidence_confidence_assessments(overall_score);

-- Detailed evidence gaps (heatmap data points)
CREATE TABLE IF NOT EXISTS innovation.evidence_gaps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- References
  assessment_id UUID NOT NULL REFERENCES innovation.evidence_confidence_assessments(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  
  -- Location
  section_path TEXT NOT NULL,
  section_title TEXT,
  page_number INT,
  paragraph_index INT,
  
  -- Gap details
  gap_type VARCHAR(50) NOT NULL,                  -- 'missing_citation', 'weak_citation', 'outdated_data', 'inconsistent_claim'
  severity VARCHAR(20) NOT NULL,                  -- 'critical', 'high', 'medium', 'low'
  
  -- Content
  claim_text TEXT NOT NULL,                       -- The unsupported/weakly supported claim
  existing_citations TEXT[],                      -- Any existing citations
  recommended_sources TEXT[],                     -- AI-suggested sources
  
  -- Scoring
  confidence_score FLOAT NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  gap_score FLOAT NOT NULL CHECK (gap_score >= 0 AND gap_score <= 1), -- 0 = no gap, 1 = complete gap
  
  -- Resolution
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_gaps_assessment ON innovation.evidence_gaps(assessment_id);
CREATE INDEX idx_evidence_gaps_program ON innovation.evidence_gaps(program_id);
CREATE INDEX idx_evidence_gaps_severity ON innovation.evidence_gaps(severity);
CREATE INDEX idx_evidence_gaps_status ON innovation.evidence_gaps(status);
CREATE INDEX idx_evidence_gaps_section ON innovation.evidence_gaps(section_path);

-- =============================================================================
-- FEATURE 3: Submission Readiness Twin (Digital Twin)
-- Predictive GA readiness score
-- =============================================================================

-- Readiness criteria definitions
CREATE TABLE IF NOT EXISTS innovation.readiness_criteria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Classification
  submission_type VARCHAR(50) NOT NULL,           -- 'IND', 'NDA', 'BLA', '510k', 'PMA', 'eCTD'
  agency VARCHAR(50) NOT NULL,                    -- 'FDA', 'EMA', 'PMDA', etc.
  module_path TEXT,                               -- e.g., 'm1', 'm2.5', 'm3.2.p'
  
  -- Criterion details
  criterion_code VARCHAR(50) NOT NULL,
  criterion_name VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  
  -- Requirements
  requirement_type VARCHAR(50) NOT NULL,          -- 'mandatory', 'conditional', 'recommended'
  condition_expression TEXT,                      -- JSON logic for conditional requirements
  
  -- Weights
  weight FLOAT NOT NULL DEFAULT 1.0,
  impact_on_rejection VARCHAR(20),                -- 'high', 'medium', 'low'
  
  -- Evidence
  guidance_reference TEXT,
  regulation_reference TEXT,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_date DATE,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_readiness_criteria_type ON innovation.readiness_criteria(submission_type);
CREATE INDEX idx_readiness_criteria_agency ON innovation.readiness_criteria(agency);
CREATE INDEX idx_readiness_criteria_module ON innovation.readiness_criteria(module_path);
CREATE UNIQUE INDEX idx_readiness_criteria_code ON innovation.readiness_criteria(submission_type, agency, criterion_code);

-- Readiness twin assessments (point-in-time snapshots)
CREATE TABLE IF NOT EXISTS innovation.readiness_twin_assessments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  submission_id UUID,                             -- Specific submission if applicable
  
  -- Assessment metadata
  assessment_type VARCHAR(50) NOT NULL,           -- 'automated', 'manual', 'hybrid'
  submission_type VARCHAR(50) NOT NULL,
  target_agency VARCHAR(50) NOT NULL,
  
  -- Overall scores (0-100)
  overall_readiness_score FLOAT NOT NULL CHECK (overall_readiness_score >= 0 AND overall_readiness_score <= 100),
  
  -- Module-level scores (JSONB for flexibility)
  module_scores JSONB NOT NULL DEFAULT '{}',      -- {"m1": 85, "m2": 72, "m3": 90, ...}
  
  -- Dimension scores
  completeness_score FLOAT CHECK (completeness_score >= 0 AND completeness_score <= 100),
  quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 100),
  consistency_score FLOAT CHECK (consistency_score >= 0 AND consistency_score <= 100),
  compliance_score FLOAT CHECK (compliance_score >= 0 AND compliance_score <= 100),
  
  -- Predictions
  predicted_approval_probability FLOAT CHECK (predicted_approval_probability >= 0 AND predicted_approval_probability <= 1),
  predicted_review_time_days INT,
  predicted_deficiency_count INT,
  risk_factors JSONB,                             -- Top risk factors identified
  
  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'completed',
  
  -- Audit
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assessed_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_readiness_twin_program ON innovation.readiness_twin_assessments(program_id);
CREATE INDEX idx_readiness_twin_score ON innovation.readiness_twin_assessments(overall_readiness_score);
CREATE INDEX idx_readiness_twin_date ON innovation.readiness_twin_assessments(assessed_at);

-- Individual criterion evaluations
CREATE TABLE IF NOT EXISTS innovation.readiness_criterion_evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- References
  assessment_id UUID NOT NULL REFERENCES innovation.readiness_twin_assessments(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES innovation.readiness_criteria(id),
  
  -- Evaluation
  status VARCHAR(30) NOT NULL,                    -- 'met', 'partially_met', 'not_met', 'not_applicable'
  score FLOAT NOT NULL CHECK (score >= 0 AND score <= 100),
  
  -- Evidence
  evidence_summary TEXT,
  evidence_locations TEXT[],                      -- Document paths/references
  
  -- Gaps and recommendations
  gaps_identified TEXT[],
  recommendations TEXT[],
  estimated_effort_hours FLOAT,
  
  -- Audit
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_criterion_eval_assessment ON innovation.readiness_criterion_evaluations(assessment_id);
CREATE INDEX idx_criterion_eval_criterion ON innovation.readiness_criterion_evaluations(criterion_id);
CREATE INDEX idx_criterion_eval_status ON innovation.readiness_criterion_evaluations(status);

-- Readiness trends over time
CREATE TABLE IF NOT EXISTS innovation.readiness_trends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  
  -- Trend data
  trend_date DATE NOT NULL,
  overall_score FLOAT NOT NULL,
  module_scores JSONB,
  criteria_met_count INT,
  criteria_total_count INT,
  
  -- Delta from previous
  score_delta FLOAT,                              -- Change from previous assessment
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_readiness_trends_program ON innovation.readiness_trends(program_id);
CREATE INDEX idx_readiness_trends_date ON innovation.readiness_trends(trend_date);
CREATE UNIQUE INDEX idx_readiness_trends_unique ON innovation.readiness_trends(program_id, trend_date);

-- =============================================================================
-- FEATURE 4: Auto-traceability from Drafts
-- Automatic linking during drafting
-- =============================================================================

-- Traceability link types
CREATE TYPE innovation.trace_link_type AS ENUM (
  'SUPPORTS',              -- Source supports target claim
  'DERIVES_FROM',          -- Target is derived from source
  'REFERENCES',            -- Simple reference
  'CONTRADICTS',           -- Source contradicts target
  'SUPERSEDES',            -- Source supersedes target
  'DEFINES',               -- Source defines term used in target
  'VALIDATES',             -- Source validates target data
  'IMPLEMENTS'             -- Target implements source requirement
);

-- Auto-detected traceability links
CREATE TABLE IF NOT EXISTS innovation.auto_trace_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  session_id UUID,                                -- Drafting session if applicable
  
  -- Source (where the link originates)
  source_document_id UUID,
  source_atom_id UUID,                            -- Reference to lumen.data_atoms
  source_section_path TEXT,
  source_text TEXT NOT NULL,
  source_text_hash VARCHAR(64),                   -- For deduplication
  
  -- Target (what is being linked to)
  target_document_id UUID,
  target_atom_id UUID,
  target_section_path TEXT,
  target_text TEXT,
  target_type VARCHAR(50) NOT NULL,               -- 'requirement', 'claim', 'data', 'reference'
  
  -- Link details
  link_type innovation.trace_link_type NOT NULL,
  confidence_score FLOAT NOT NULL DEFAULT 0.8 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Detection metadata
  detection_method VARCHAR(50) NOT NULL,          -- 'semantic', 'keyword', 'reference_parse', 'manual'
  detection_model TEXT,                           -- Model version used
  
  -- Validation
  is_validated BOOLEAN NOT NULL DEFAULT FALSE,
  validated_by TEXT,
  validated_at TIMESTAMPTZ,
  validation_status VARCHAR(30),                  -- 'confirmed', 'rejected', 'modified'
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_auto_trace_program ON innovation.auto_trace_links(program_id);
CREATE INDEX idx_auto_trace_session ON innovation.auto_trace_links(session_id);
CREATE INDEX idx_auto_trace_source ON innovation.auto_trace_links(source_document_id);
CREATE INDEX idx_auto_trace_target ON innovation.auto_trace_links(target_document_id);
CREATE INDEX idx_auto_trace_type ON innovation.auto_trace_links(link_type);
CREATE INDEX idx_auto_trace_confidence ON innovation.auto_trace_links(confidence_score);
CREATE INDEX idx_auto_trace_validated ON innovation.auto_trace_links(is_validated);

-- Traceability matrix snapshots
CREATE TABLE IF NOT EXISTS innovation.traceability_matrix_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  
  -- Snapshot metadata
  snapshot_name VARCHAR(200),
  snapshot_type VARCHAR(50) NOT NULL,             -- 'milestone', 'submission', 'audit', 'periodic'
  
  -- Coverage statistics
  total_requirements INT NOT NULL DEFAULT 0,
  traced_requirements INT NOT NULL DEFAULT 0,
  coverage_percentage FLOAT NOT NULL DEFAULT 0,
  
  -- Matrix data (stored as JSONB for flexibility)
  matrix_data JSONB NOT NULL,                     -- Full traceability matrix
  summary_stats JSONB,                            -- Aggregated statistics
  
  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'draft',    -- 'draft', 'finalized', 'superseded'
  finalized_at TIMESTAMPTZ,
  finalized_by TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT CURRENT_USER
);

CREATE INDEX idx_trace_matrix_program ON innovation.traceability_matrix_snapshots(program_id);
CREATE INDEX idx_trace_matrix_type ON innovation.traceability_matrix_snapshots(snapshot_type);
CREATE INDEX idx_trace_matrix_status ON innovation.traceability_matrix_snapshots(status);

-- =============================================================================
-- FEATURE 5: Adaptive Reviewer Workspace
-- Role-specific UI presets
-- =============================================================================

-- Role definitions
CREATE TABLE IF NOT EXISTS innovation.workspace_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  org_id UUID REFERENCES identity.organizations(id) ON DELETE CASCADE,  -- NULL = system default
  
  -- Role details
  role_key VARCHAR(100) NOT NULL,                 -- 'medical_writer', 'regulatory_lead', 'qc_reviewer', etc.
  role_name VARCHAR(200) NOT NULL,
  description TEXT,
  
  -- Icon/visual
  icon_name VARCHAR(50),
  color_theme VARCHAR(50),
  
  -- Default capabilities
  default_capabilities JSONB NOT NULL DEFAULT '[]',  -- Array of capability keys
  
  -- Status
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE,  -- System roles can't be deleted
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_roles_org ON innovation.workspace_roles(org_id);
CREATE INDEX idx_workspace_roles_key ON innovation.workspace_roles(role_key);

-- Workspace presets (templates for workspace configurations)
CREATE TABLE IF NOT EXISTS innovation.workspace_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  role_id UUID REFERENCES innovation.workspace_roles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES identity.organizations(id) ON DELETE CASCADE,
  
  -- Preset details
  preset_name VARCHAR(200) NOT NULL,
  description TEXT,
  
  -- UI Configuration
  layout_config JSONB NOT NULL DEFAULT '{}',       -- Panel arrangement, sizes
  sidebar_config JSONB NOT NULL DEFAULT '{}',      -- Which sidebars are visible
  toolbar_config JSONB NOT NULL DEFAULT '{}',      -- Which tools are shown
  shortcut_config JSONB NOT NULL DEFAULT '{}',     -- Keyboard shortcuts
  
  -- Feature visibility
  visible_features TEXT[] NOT NULL DEFAULT '{}',   -- Which features to show
  hidden_features TEXT[] NOT NULL DEFAULT '{}',    -- Which features to hide
  highlighted_features TEXT[] NOT NULL DEFAULT '{}', -- Which features to emphasize
  
  -- Default views
  default_document_view VARCHAR(50),              -- 'edit', 'review', 'comment'
  default_analysis_panels TEXT[],                 -- Which analysis panels to open
  
  -- Status
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT CURRENT_USER
);

CREATE INDEX idx_workspace_presets_role ON innovation.workspace_presets(role_id);
CREATE INDEX idx_workspace_presets_org ON innovation.workspace_presets(org_id);

-- User workspace preferences (personalized overrides)
CREATE TABLE IF NOT EXISTS innovation.user_workspace_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- User reference
  user_id UUID NOT NULL,                          -- Reference to identity.users
  
  -- Active preset
  active_preset_id UUID REFERENCES innovation.workspace_presets(id),
  active_role_id UUID REFERENCES innovation.workspace_roles(id),
  
  -- User overrides (layered on top of preset)
  layout_overrides JSONB NOT NULL DEFAULT '{}',
  sidebar_overrides JSONB NOT NULL DEFAULT '{}',
  toolbar_overrides JSONB NOT NULL DEFAULT '{}',
  shortcut_overrides JSONB NOT NULL DEFAULT '{}',
  
  -- Personalization
  favorite_features TEXT[],
  pinned_documents UUID[],
  recent_documents JSONB,                         -- Array with timestamps
  
  -- Preferences
  theme VARCHAR(50) DEFAULT 'system',             -- 'light', 'dark', 'system'
  font_size VARCHAR(20) DEFAULT 'medium',
  accessibility_settings JSONB DEFAULT '{}',
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_workspace_user ON innovation.user_workspace_preferences(user_id);

-- Workspace usage analytics
CREATE TABLE IF NOT EXISTS innovation.workspace_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- References
  user_id UUID NOT NULL,
  role_id UUID REFERENCES innovation.workspace_roles(id),
  preset_id UUID REFERENCES innovation.workspace_presets(id),
  
  -- Session data
  session_id UUID NOT NULL,
  session_start TIMESTAMPTZ NOT NULL,
  session_end TIMESTAMPTZ,
  
  -- Feature usage
  features_used TEXT[] NOT NULL DEFAULT '{}',
  feature_durations JSONB,                        -- {feature: seconds}
  
  -- Interactions
  click_count INT NOT NULL DEFAULT 0,
  keyboard_shortcut_count INT NOT NULL DEFAULT 0,
  search_count INT NOT NULL DEFAULT 0,
  
  -- Context switches
  role_switches INT NOT NULL DEFAULT 0,
  preset_changes INT NOT NULL DEFAULT 0,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_analytics_user ON innovation.workspace_analytics(user_id);
CREATE INDEX idx_workspace_analytics_role ON innovation.workspace_analytics(role_id);
CREATE INDEX idx_workspace_analytics_session ON innovation.workspace_analytics(session_start);

-- =============================================================================
-- FEATURE 6: Outcome-based Template Learning
-- Track which templates reduced agency questions
-- =============================================================================

-- Template definitions with outcome tracking
CREATE TABLE IF NOT EXISTS innovation.learning_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  org_id UUID REFERENCES identity.organizations(id) ON DELETE CASCADE,  -- NULL = public
  
  -- Template identification
  template_code VARCHAR(100) NOT NULL,
  template_name VARCHAR(300) NOT NULL,
  description TEXT,
  version VARCHAR(50) NOT NULL DEFAULT '1.0',
  
  -- Classification
  template_type VARCHAR(50) NOT NULL,             -- 'section', 'document', 'response', 'form'
  submission_type VARCHAR(50),                    -- 'IND', 'NDA', 'BLA', etc.
  module_path TEXT,                               -- e.g., 'm2.5', 'm3.2.p'
  therapeutic_area VARCHAR(100)[],
  
  -- Content
  template_content TEXT NOT NULL,
  content_format VARCHAR(30) NOT NULL,            -- 'markdown', 'html', 'docx', 'json'
  variables JSONB,                                -- Template variables
  
  -- Outcome metrics (aggregated)
  usage_count INT NOT NULL DEFAULT 0,
  approval_rate FLOAT,                            -- % of submissions approved using this template
  avg_review_days FLOAT,                          -- Average review time
  avg_questions_received FLOAT,                   -- Average # of agency questions
  avg_deficiencies FLOAT,                         -- Average # of deficiencies
  effectiveness_score FLOAT,                      -- Computed effectiveness (0-100)
  
  -- Learning metadata
  last_effectiveness_calc TIMESTAMPTZ,
  effectiveness_sample_size INT,
  
  -- Lineage
  parent_template_id UUID REFERENCES innovation.learning_templates(id),
  derived_from_outcome_id UUID,                   -- Link to outcome that triggered improvement
  
  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'active',   -- 'active', 'deprecated', 'archived'
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT CURRENT_USER
);

CREATE INDEX idx_learning_templates_org ON innovation.learning_templates(org_id);
CREATE INDEX idx_learning_templates_type ON innovation.learning_templates(template_type);
CREATE INDEX idx_learning_templates_submission ON innovation.learning_templates(submission_type);
CREATE INDEX idx_learning_templates_effectiveness ON innovation.learning_templates(effectiveness_score DESC);
CREATE INDEX idx_learning_templates_usage ON innovation.learning_templates(usage_count DESC);

-- Template usage tracking
CREATE TABLE IF NOT EXISTS innovation.template_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- References
  template_id UUID NOT NULL REFERENCES innovation.learning_templates(id),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  submission_id UUID,
  document_id UUID,
  
  -- Usage context
  usage_type VARCHAR(50) NOT NULL,                -- 'direct', 'modified', 'partial'
  modification_extent FLOAT,                       -- 0 = unmodified, 1 = completely rewritten
  
  -- User feedback
  user_rating INT CHECK (user_rating >= 1 AND user_rating <= 5),
  user_feedback TEXT,
  
  -- Outcome reference (linked after submission)
  outcome_id UUID,
  
  -- Audit
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_by TEXT NOT NULL DEFAULT CURRENT_USER
);

CREATE INDEX idx_template_usage_template ON innovation.template_usage(template_id);
CREATE INDEX idx_template_usage_program ON innovation.template_usage(program_id);
CREATE INDEX idx_template_usage_date ON innovation.template_usage(used_at);

-- Submission outcomes (for learning)
CREATE TABLE IF NOT EXISTS innovation.submission_outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- References
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  submission_id UUID,
  
  -- Submission details
  submission_type VARCHAR(50) NOT NULL,
  agency VARCHAR(50) NOT NULL,
  submitted_at DATE NOT NULL,
  
  -- Outcome
  outcome_status VARCHAR(50) NOT NULL,            -- 'approved', 'approved_with_conditions', 'refuse_to_file', 'complete_response', 'withdrawn'
  outcome_date DATE,
  
  -- Metrics
  review_days INT,
  questions_received INT,
  information_requests INT,
  deficiencies_cited INT,
  
  -- Quality indicators
  was_first_cycle BOOLEAN,                        -- Approved on first cycle?
  had_rtf BOOLEAN,                                -- Refuse to file?
  had_advisory_committee BOOLEAN,
  
  -- Detailed data
  questions_detail JSONB,                         -- Array of questions with categories
  deficiencies_detail JSONB,                      -- Array of deficiencies
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submission_outcomes_program ON innovation.submission_outcomes(program_id);
CREATE INDEX idx_submission_outcomes_type ON innovation.submission_outcomes(submission_type);
CREATE INDEX idx_submission_outcomes_status ON innovation.submission_outcomes(outcome_status);
CREATE INDEX idx_submission_outcomes_date ON innovation.submission_outcomes(submitted_at);

-- =============================================================================
-- FEATURE 7: Regulatory Negotiation Logbook
-- Structured correspondence record
-- =============================================================================

-- Negotiation threads (grouping of related correspondence)
CREATE TABLE IF NOT EXISTS innovation.negotiation_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  
  -- Thread identification
  thread_number VARCHAR(50),                      -- Internal tracking number
  title VARCHAR(500) NOT NULL,
  
  -- Context
  agency VARCHAR(50) NOT NULL,
  submission_type VARCHAR(50),
  submission_id UUID,
  
  -- Classification
  thread_type VARCHAR(50) NOT NULL,               -- 'pre_submission', 'review_question', 'deficiency_response', 'appeal', 'amendment'
  topic_category VARCHAR(100),                    -- 'clinical', 'nonclinical', 'cmc', 'regulatory', 'statistical'
  
  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'open',     -- 'open', 'pending_response', 'resolved', 'escalated', 'closed'
  priority VARCHAR(20) DEFAULT 'normal',          -- 'critical', 'high', 'normal', 'low'
  
  -- Key dates
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  response_deadline DATE,
  
  -- Outcome
  resolution_type VARCHAR(50),                    -- 'accepted', 'rejected', 'compromised', 'withdrawn'
  resolution_summary TEXT,
  
  -- Audit
  created_by TEXT NOT NULL DEFAULT CURRENT_USER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_negotiation_threads_program ON innovation.negotiation_threads(program_id);
CREATE INDEX idx_negotiation_threads_org ON innovation.negotiation_threads(org_id);
CREATE INDEX idx_negotiation_threads_status ON innovation.negotiation_threads(status);
CREATE INDEX idx_negotiation_threads_agency ON innovation.negotiation_threads(agency);
CREATE INDEX idx_negotiation_threads_type ON innovation.negotiation_threads(thread_type);

-- Individual correspondence entries
CREATE TABLE IF NOT EXISTS innovation.negotiation_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- References
  thread_id UUID NOT NULL REFERENCES innovation.negotiation_threads(id) ON DELETE CASCADE,
  
  -- Entry details
  entry_type VARCHAR(50) NOT NULL,                -- 'agency_question', 'sponsor_response', 'meeting_minutes', 'phone_note', 'email', 'formal_letter'
  direction VARCHAR(20) NOT NULL,                 -- 'inbound', 'outbound', 'internal'
  
  -- Content
  subject TEXT,
  content TEXT NOT NULL,
  content_format VARCHAR(30) DEFAULT 'text',      -- 'text', 'html', 'markdown'
  
  -- Attachments
  attachments JSONB,                              -- Array of {filename, document_id, size}
  
  -- Dates
  entry_date DATE NOT NULL,
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  
  -- Agency details (for inbound)
  agency_reviewer TEXT,
  agency_division TEXT,
  
  -- Response tracking
  requires_response BOOLEAN DEFAULT FALSE,
  response_deadline DATE,
  response_entry_id UUID REFERENCES innovation.negotiation_entries(id),
  
  -- Classification
  sentiment VARCHAR(20),                          -- 'positive', 'neutral', 'negative', 'critical'
  key_issues TEXT[],
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT CURRENT_USER
);

CREATE INDEX idx_negotiation_entries_thread ON innovation.negotiation_entries(thread_id);
CREATE INDEX idx_negotiation_entries_type ON innovation.negotiation_entries(entry_type);
CREATE INDEX idx_negotiation_entries_date ON innovation.negotiation_entries(entry_date);
CREATE INDEX idx_negotiation_entries_deadline ON innovation.negotiation_entries(response_deadline) WHERE requires_response = TRUE;

-- Strategy positions (record of positions taken)
CREATE TABLE IF NOT EXISTS innovation.negotiation_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- References
  thread_id UUID NOT NULL REFERENCES innovation.negotiation_threads(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES innovation.negotiation_entries(id),
  
  -- Position details
  topic TEXT NOT NULL,
  
  -- Agency position
  agency_position TEXT,
  agency_rationale TEXT,
  agency_precedents TEXT[],                       -- Reference to past decisions
  
  -- Sponsor position
  sponsor_position TEXT,
  sponsor_rationale TEXT,
  sponsor_evidence TEXT[],                        -- Evidence supporting position
  
  -- Outcome
  final_position TEXT,
  concession_made_by VARCHAR(20),                 -- 'agency', 'sponsor', 'both', 'neither'
  
  -- Strategy
  negotiation_strategy TEXT,                      -- Notes on approach
  lessons_learned TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_negotiation_positions_thread ON innovation.negotiation_positions(thread_id);

-- =============================================================================
-- FEATURE 8: Compliance Guardrails SDK
-- Pre-submission validation API
-- =============================================================================

-- Guardrail rule definitions
CREATE TABLE IF NOT EXISTS innovation.guardrail_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identification
  rule_code VARCHAR(100) NOT NULL UNIQUE,
  rule_name VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  
  -- Classification
  rule_category VARCHAR(50) NOT NULL,             -- 'format', 'content', 'structure', 'metadata', 'cross_reference', 'regulatory'
  severity VARCHAR(20) NOT NULL,                  -- 'error', 'warning', 'info'
  
  -- Applicability
  submission_types VARCHAR(50)[] NOT NULL,        -- Which submission types this applies to
  agencies VARCHAR(50)[],                         -- Which agencies (NULL = all)
  module_paths TEXT[],                            -- Which modules (NULL = all)
  
  -- Rule logic
  rule_type VARCHAR(50) NOT NULL,                 -- 'regex', 'xpath', 'schema', 'custom', 'ml_model'
  rule_expression TEXT,                           -- The actual rule logic
  rule_parameters JSONB,                          -- Additional parameters
  
  -- Guidance
  remediation_guidance TEXT NOT NULL,
  documentation_url TEXT,
  regulation_reference TEXT,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_date DATE,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guardrail_rules_category ON innovation.guardrail_rules(rule_category);
CREATE INDEX idx_guardrail_rules_severity ON innovation.guardrail_rules(severity);
CREATE INDEX idx_guardrail_rules_types ON innovation.guardrail_rules USING GIN(submission_types);
CREATE INDEX idx_guardrail_rules_active ON innovation.guardrail_rules(is_active) WHERE is_active = TRUE;

-- Guardrail profiles (collections of rules)
CREATE TABLE IF NOT EXISTS innovation.guardrail_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  org_id UUID REFERENCES identity.organizations(id) ON DELETE CASCADE,  -- NULL = system profile
  
  -- Profile details
  profile_name VARCHAR(200) NOT NULL,
  description TEXT,
  
  -- Target
  submission_type VARCHAR(50) NOT NULL,
  agency VARCHAR(50),
  
  -- Rules included
  included_rules UUID[] NOT NULL DEFAULT '{}',    -- Array of rule IDs
  excluded_rules UUID[] NOT NULL DEFAULT '{}',    -- Rules explicitly excluded
  
  -- Custom settings
  custom_rule_parameters JSONB,                   -- Override rule parameters
  severity_overrides JSONB,                       -- Override severities
  
  -- Status
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guardrail_profiles_org ON innovation.guardrail_profiles(org_id);
CREATE INDEX idx_guardrail_profiles_type ON innovation.guardrail_profiles(submission_type);

-- Validation runs
CREATE TABLE IF NOT EXISTS innovation.guardrail_validation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Scope
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE CASCADE,
  
  -- Target
  target_type VARCHAR(50) NOT NULL,               -- 'submission', 'document', 'section', 'module'
  target_id UUID,
  submission_id UUID,
  document_ids UUID[],
  
  -- Configuration
  profile_id UUID REFERENCES innovation.guardrail_profiles(id),
  rule_ids UUID[],                                -- Specific rules run (if not using profile)
  
  -- Results summary
  total_rules_run INT NOT NULL DEFAULT 0,
  total_errors INT NOT NULL DEFAULT 0,
  total_warnings INT NOT NULL DEFAULT 0,
  total_info INT NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Execution
  status VARCHAR(30) NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  execution_time_ms INT,
  error_message TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT CURRENT_USER
);

CREATE INDEX idx_guardrail_runs_program ON innovation.guardrail_validation_runs(program_id);
CREATE INDEX idx_guardrail_runs_org ON innovation.guardrail_validation_runs(org_id);
CREATE INDEX idx_guardrail_runs_status ON innovation.guardrail_validation_runs(status);
CREATE INDEX idx_guardrail_runs_passed ON innovation.guardrail_validation_runs(passed);
CREATE INDEX idx_guardrail_runs_date ON innovation.guardrail_validation_runs(created_at);

-- Individual validation findings
CREATE TABLE IF NOT EXISTS innovation.guardrail_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- References
  run_id UUID NOT NULL REFERENCES innovation.guardrail_validation_runs(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES innovation.guardrail_rules(id),
  
  -- Location
  document_id UUID,
  section_path TEXT,
  line_number INT,
  column_number INT,
  element_xpath TEXT,
  
  -- Finding details
  severity VARCHAR(20) NOT NULL,                  -- 'error', 'warning', 'info'
  message TEXT NOT NULL,
  context TEXT,                                   -- Surrounding content for context
  
  -- Remediation
  suggested_fix TEXT,
  auto_fixable BOOLEAN NOT NULL DEFAULT FALSE,
  auto_fix_applied BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'open',     -- 'open', 'fixed', 'ignored', 'false_positive'
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guardrail_findings_run ON innovation.guardrail_findings(run_id);
CREATE INDEX idx_guardrail_findings_rule ON innovation.guardrail_findings(rule_id);
CREATE INDEX idx_guardrail_findings_severity ON innovation.guardrail_findings(severity);
CREATE INDEX idx_guardrail_findings_status ON innovation.guardrail_findings(status);

-- API rate limiting and audit
CREATE TABLE IF NOT EXISTS innovation.guardrail_api_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Request details
  org_id UUID NOT NULL REFERENCES identity.organizations(id),
  api_key_hash VARCHAR(64),                       -- Hashed API key
  
  -- Endpoint
  endpoint VARCHAR(200) NOT NULL,
  method VARCHAR(10) NOT NULL,
  
  -- Request
  request_body_size INT,
  request_params JSONB,
  
  -- Response
  response_status INT NOT NULL,
  response_time_ms INT,
  
  -- Rate limiting
  rate_limit_bucket VARCHAR(100),
  requests_remaining INT,
  
  -- Audit
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_guardrail_api_audit_org ON innovation.guardrail_api_audit(org_id);
CREATE INDEX idx_guardrail_api_audit_endpoint ON innovation.guardrail_api_audit(endpoint);
CREATE INDEX idx_guardrail_api_audit_date ON innovation.guardrail_api_audit(requested_at);

-- =============================================================================
-- ROW LEVEL SECURITY FOR ALL TABLES
-- =============================================================================

-- Enable RLS on all innovation tables
ALTER TABLE innovation.guidance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.delta_radar_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.delta_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.evidence_scoring_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.evidence_confidence_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.evidence_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.readiness_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.readiness_twin_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.readiness_criterion_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.readiness_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.auto_trace_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.traceability_matrix_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.workspace_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.workspace_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.user_workspace_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.workspace_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.learning_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.template_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.submission_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.negotiation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.negotiation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.negotiation_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.guardrail_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.guardrail_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.guardrail_validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.guardrail_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE innovation.guardrail_api_audit ENABLE ROW LEVEL SECURITY;

-- Guidance documents are public read
CREATE POLICY guidance_docs_select ON innovation.guidance_documents
  FOR SELECT USING (TRUE);

CREATE POLICY guidance_docs_admin ON innovation.guidance_documents
  FOR ALL USING (current_setting('app.is_admin', true) = 'true');

-- Program-scoped tables RLS
CREATE POLICY delta_scans_policy ON innovation.delta_radar_scans
  FOR ALL USING (identity.can_access_org(org_id));

CREATE POLICY delta_findings_policy ON innovation.delta_findings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM innovation.delta_radar_scans s 
      WHERE s.id = delta_findings.scan_id 
      AND identity.can_access_org(s.org_id)
    )
  );

CREATE POLICY evidence_config_policy ON innovation.evidence_scoring_configs
  FOR ALL USING (identity.can_access_org(org_id));

CREATE POLICY evidence_assess_policy ON innovation.evidence_confidence_assessments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM core.programs p 
      WHERE p.id = evidence_confidence_assessments.program_id 
      AND identity.can_access_org(p.org_id)
    )
  );

CREATE POLICY evidence_gaps_policy ON innovation.evidence_gaps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM core.programs p 
      WHERE p.id = evidence_gaps.program_id 
      AND identity.can_access_org(p.org_id)
    )
  );

-- Readiness twin policies
CREATE POLICY readiness_criteria_select ON innovation.readiness_criteria
  FOR SELECT USING (TRUE);

CREATE POLICY readiness_twin_policy ON innovation.readiness_twin_assessments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM core.programs p 
      WHERE p.id = readiness_twin_assessments.program_id 
      AND identity.can_access_org(p.org_id)
    )
  );

CREATE POLICY criterion_eval_policy ON innovation.readiness_criterion_evaluations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM innovation.readiness_twin_assessments a
      JOIN core.programs p ON p.id = a.program_id
      WHERE a.id = readiness_criterion_evaluations.assessment_id
      AND identity.can_access_org(p.org_id)
    )
  );

CREATE POLICY readiness_trends_policy ON innovation.readiness_trends
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM core.programs p 
      WHERE p.id = readiness_trends.program_id 
      AND identity.can_access_org(p.org_id)
    )
  );

-- Traceability policies
CREATE POLICY auto_trace_policy ON innovation.auto_trace_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM core.programs p 
      WHERE p.id = auto_trace_links.program_id 
      AND identity.can_access_org(p.org_id)
    )
  );

CREATE POLICY trace_matrix_policy ON innovation.traceability_matrix_snapshots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM core.programs p 
      WHERE p.id = traceability_matrix_snapshots.program_id 
      AND identity.can_access_org(p.org_id)
    )
  );

-- Workspace policies
CREATE POLICY workspace_roles_policy ON innovation.workspace_roles
  FOR SELECT USING (
    org_id IS NULL OR identity.can_access_org(org_id)
  );

CREATE POLICY workspace_presets_policy ON innovation.workspace_presets
  FOR ALL USING (
    org_id IS NULL OR identity.can_access_org(org_id)
  );

CREATE POLICY user_prefs_policy ON innovation.user_workspace_preferences
  FOR ALL USING (
    user_id::text = current_setting('app.current_user_id', true)
  );

CREATE POLICY workspace_analytics_policy ON innovation.workspace_analytics
  FOR SELECT USING (
    user_id::text = current_setting('app.current_user_id', true)
    OR current_setting('app.is_admin', true) = 'true'
  );

-- Template learning policies
CREATE POLICY learning_templates_select ON innovation.learning_templates
  FOR SELECT USING (
    org_id IS NULL OR identity.can_access_org(org_id)
  );

CREATE POLICY learning_templates_write ON innovation.learning_templates
  FOR INSERT WITH CHECK (
    org_id IS NULL OR identity.can_write_org(org_id)
  );

CREATE POLICY template_usage_policy ON innovation.template_usage
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM core.programs p 
      WHERE p.id = template_usage.program_id 
      AND identity.can_access_org(p.org_id)
    )
  );

CREATE POLICY submission_outcomes_policy ON innovation.submission_outcomes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM core.programs p 
      WHERE p.id = submission_outcomes.program_id 
      AND identity.can_access_org(p.org_id)
    )
  );

-- Negotiation policies
CREATE POLICY negotiation_threads_policy ON innovation.negotiation_threads
  FOR ALL USING (identity.can_access_org(org_id));

CREATE POLICY negotiation_entries_policy ON innovation.negotiation_entries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM innovation.negotiation_threads t
      WHERE t.id = negotiation_entries.thread_id
      AND identity.can_access_org(t.org_id)
    )
  );

CREATE POLICY negotiation_positions_policy ON innovation.negotiation_positions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM innovation.negotiation_threads t
      WHERE t.id = negotiation_positions.thread_id
      AND identity.can_access_org(t.org_id)
    )
  );

-- Guardrail policies
CREATE POLICY guardrail_rules_select ON innovation.guardrail_rules
  FOR SELECT USING (TRUE);

CREATE POLICY guardrail_profiles_policy ON innovation.guardrail_profiles
  FOR ALL USING (
    org_id IS NULL OR identity.can_access_org(org_id)
  );

CREATE POLICY guardrail_runs_policy ON innovation.guardrail_validation_runs
  FOR ALL USING (identity.can_access_org(org_id));

CREATE POLICY guardrail_findings_policy ON innovation.guardrail_findings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM innovation.guardrail_validation_runs r
      WHERE r.id = guardrail_findings.run_id
      AND identity.can_access_org(r.org_id)
    )
  );

CREATE POLICY guardrail_api_audit_policy ON innovation.guardrail_api_audit
  FOR SELECT USING (identity.can_access_org(org_id));

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Calculate template effectiveness score
CREATE OR REPLACE FUNCTION innovation.calculate_template_effectiveness(
  p_template_id UUID
) RETURNS FLOAT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_score FLOAT;
  v_approval_rate FLOAT;
  v_avg_questions FLOAT;
  v_avg_review_days FLOAT;
  v_usage_count INT;
BEGIN
  SELECT 
    COUNT(*)::FLOAT / NULLIF(COUNT(*), 0),
    AVG(so.questions_received)::FLOAT,
    AVG(so.review_days)::FLOAT,
    COUNT(*)
  INTO v_approval_rate, v_avg_questions, v_avg_review_days, v_usage_count
  FROM innovation.template_usage tu
  JOIN innovation.submission_outcomes so ON so.id = tu.outcome_id
  WHERE tu.template_id = p_template_id
    AND so.outcome_status IN ('approved', 'approved_with_conditions');
  
  IF v_usage_count < 3 THEN
    RETURN NULL;  -- Not enough data
  END IF;
  
  -- Weighted score: higher approval rate, fewer questions, shorter review = higher score
  v_score := (
    (COALESCE(v_approval_rate, 0) * 40) +
    (GREATEST(0, 30 - COALESCE(v_avg_questions, 10)) * 1) +
    (GREATEST(0, 30 - (COALESCE(v_avg_review_days, 365) / 30)) * 1)
  );
  
  RETURN LEAST(100, GREATEST(0, v_score));
END;
$$;

-- Run delta radar scan
CREATE OR REPLACE FUNCTION innovation.run_delta_radar_scan(
  p_program_id UUID,
  p_org_id UUID,
  p_scan_type VARCHAR DEFAULT 'full'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_scan_id UUID;
BEGIN
  INSERT INTO innovation.delta_radar_scans (
    program_id, org_id, scan_type, status, started_at
  ) VALUES (
    p_program_id, p_org_id, p_scan_type, 'running', NOW()
  ) RETURNING id INTO v_scan_id;
  
  RETURN v_scan_id;
END;
$$;

-- Calculate readiness score
CREATE OR REPLACE FUNCTION innovation.calculate_readiness_score(
  p_program_id UUID,
  p_submission_type VARCHAR,
  p_agency VARCHAR
) RETURNS TABLE (
  overall_score FLOAT,
  completeness_score FLOAT,
  quality_score FLOAT,
  criteria_met INT,
  criteria_total INT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    75.0::FLOAT as overall_score,  -- Placeholder - real implementation would calculate
    80.0::FLOAT as completeness_score,
    70.0::FLOAT as quality_score,
    15::INT as criteria_met,
    20::INT as criteria_total;
END;
$$;

-- =============================================================================
-- SEED DATA: System workspace roles
-- =============================================================================

INSERT INTO innovation.workspace_roles (role_key, role_name, description, icon_name, is_system_role, default_capabilities) VALUES
('medical_writer', 'Medical Writer', 'Focus on document authoring and content development', 'pen-tool', TRUE, 
 '["document_editing", "citation_management", "template_usage", "collaboration"]'),
('regulatory_lead', 'Regulatory Lead', 'Focus on compliance and submission management', 'shield-check', TRUE,
 '["submission_management", "compliance_review", "agency_correspondence", "timeline_management"]'),
('qc_reviewer', 'QC Reviewer', 'Focus on quality review and validation', 'check-circle', TRUE,
 '["document_review", "comment_management", "validation_rules", "audit_trail"]'),
('clinical_lead', 'Clinical Lead', 'Focus on clinical data and study design', 'activity', TRUE,
 '["protocol_review", "clinical_data", "safety_monitoring", "endpoint_analysis"]'),
('biostatistician', 'Biostatistician', 'Focus on statistical analysis and SAP', 'bar-chart', TRUE,
 '["statistical_analysis", "sample_size", "endpoint_analysis", "data_review"]'),
('project_manager', 'Project Manager', 'Focus on timelines and resource management', 'calendar', TRUE,
 '["timeline_management", "resource_allocation", "milestone_tracking", "reporting"]'),
('executive', 'Executive', 'High-level dashboards and decision support', 'briefcase', TRUE,
 '["executive_dashboard", "portfolio_view", "risk_overview", "strategic_reports"]')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SEED DATA: Default guardrail rules
-- =============================================================================

INSERT INTO innovation.guardrail_rules (
  rule_code, rule_name, description, rule_category, severity,
  submission_types, rule_type, remediation_guidance
) VALUES
-- Format rules
('FMT-001', 'PDF/A Compliance', 'All PDFs must be PDF/A compliant', 'format', 'error',
 ARRAY['IND', 'NDA', 'BLA', '510k'], 'schema', 'Convert PDF to PDF/A format using Adobe Acrobat or similar tool'),
 
('FMT-002', 'Hyperlink Functionality', 'All hyperlinks in documents must be functional', 'format', 'warning',
 ARRAY['IND', 'NDA', 'BLA'], 'custom', 'Verify all hyperlinks point to valid destinations within the submission'),
 
('FMT-003', 'Bookmark Navigation', 'PDF bookmarks must match table of contents', 'format', 'error',
 ARRAY['IND', 'NDA', 'BLA'], 'custom', 'Ensure bookmarks align with document structure and are properly nested'),

-- Content rules
('CNT-001', 'Orphan Drug Reference', 'Orphan drug designation must include FDA grant number', 'content', 'error',
 ARRAY['NDA', 'BLA'], 'regex', 'Include the FDA orphan drug designation number (format: DES-XXXXXX)'),
 
('CNT-002', 'Clinical Hold Resolution', 'Any clinical holds must be explicitly addressed', 'content', 'error',
 ARRAY['IND', 'NDA', 'BLA'], 'custom', 'Document clinical hold history and resolution for each hold'),
 
('CNT-003', 'Sample Size Justification', 'Statistical sample size must include power calculation', 'content', 'warning',
 ARRAY['IND', 'NDA', 'BLA'], 'custom', 'Include power analysis with assumptions clearly stated'),

-- Structure rules
('STR-001', 'eCTD Module Structure', 'Submission must follow eCTD v4.0 module structure', 'structure', 'error',
 ARRAY['IND', 'NDA', 'BLA'], 'schema', 'Organize documents according to ICH M4 common technical document'),
 
('STR-002', 'Study Report Completeness', 'All referenced study reports must be included', 'structure', 'error',
 ARRAY['NDA', 'BLA'], 'custom', 'Include all clinical study reports referenced in the application'),

-- Cross-reference rules
('XRF-001', 'Table Reference Validity', 'All table references must resolve to valid tables', 'cross_reference', 'error',
 ARRAY['IND', 'NDA', 'BLA', '510k'], 'custom', 'Update table references to match actual table numbers'),
 
('XRF-002', 'Figure Reference Validity', 'All figure references must resolve to valid figures', 'cross_reference', 'error',
 ARRAY['IND', 'NDA', 'BLA', '510k'], 'custom', 'Update figure references to match actual figure numbers'),
 
('XRF-003', 'Section Reference Validity', 'All section references must exist', 'cross_reference', 'warning',
 ARRAY['IND', 'NDA', 'BLA', '510k'], 'custom', 'Verify section references point to existing sections'),

-- Regulatory rules
('REG-001', 'FDA Form 1571 Completeness', 'IND Form 1571 must have all required fields', 'regulatory', 'error',
 ARRAY['IND'], 'schema', 'Complete all mandatory fields in Form FDA 1571'),
 
('REG-002', 'FDA Form 356h Completeness', 'NDA/BLA Form 356h must be complete', 'regulatory', 'error',
 ARRAY['NDA', 'BLA'], 'schema', 'Complete all mandatory fields in Form FDA 356h'),
 
('REG-003', 'Environmental Assessment', 'EA/categorical exclusion claim must be included', 'regulatory', 'error',
 ARRAY['NDA', 'BLA'], 'custom', 'Include environmental assessment or claim for categorical exclusion')
ON CONFLICT (rule_code) DO NOTHING;

-- =============================================================================
-- SEED DATA: Default readiness criteria
-- =============================================================================

INSERT INTO innovation.readiness_criteria (
  submission_type, agency, criterion_code, criterion_name, description,
  requirement_type, weight, impact_on_rejection
) VALUES
-- IND criteria
('IND', 'FDA', 'IND-001', 'Sponsor Information Complete', 'Form 1571 sponsor section is complete', 'mandatory', 1.0, 'high'),
('IND', 'FDA', 'IND-002', 'CMC Information Adequate', 'Chemistry, manufacturing, and controls information is adequate for phase', 'mandatory', 1.5, 'high'),
('IND', 'FDA', 'IND-003', 'Pharmacology/Toxicology Complete', 'Adequate nonclinical data to support proposed clinical trial', 'mandatory', 1.5, 'high'),
('IND', 'FDA', 'IND-004', 'Clinical Protocol Included', 'Complete clinical protocol is included', 'mandatory', 1.5, 'high'),
('IND', 'FDA', 'IND-005', 'Investigator Brochure Current', 'IB is current and contains required information', 'mandatory', 1.0, 'medium'),
('IND', 'FDA', 'IND-006', 'Previous Human Experience', 'Any previous human experience is documented', 'conditional', 0.8, 'medium'),

-- NDA criteria
('NDA', 'FDA', 'NDA-001', 'Clinical Data Complete', 'All pivotal clinical studies are complete', 'mandatory', 2.0, 'high'),
('NDA', 'FDA', 'NDA-002', 'CMC Section Complete', 'Module 3 CMC information is complete', 'mandatory', 1.5, 'high'),
('NDA', 'FDA', 'NDA-003', 'Nonclinical Summary', 'Module 2.4 nonclinical overview is complete', 'mandatory', 1.0, 'medium'),
('NDA', 'FDA', 'NDA-004', 'Clinical Summary', 'Module 2.5 clinical overview is complete', 'mandatory', 1.5, 'high'),
('NDA', 'FDA', 'NDA-005', 'ISS/ISE Complete', 'Integrated summaries of safety and efficacy are complete', 'mandatory', 1.5, 'high'),
('NDA', 'FDA', 'NDA-006', 'Labeling Draft', 'Proposed labeling is included', 'mandatory', 1.0, 'high'),
('NDA', 'FDA', 'NDA-007', 'Patent Information', 'Patent information is complete', 'mandatory', 0.5, 'medium'),
('NDA', 'FDA', 'NDA-008', 'Pediatric Assessment', 'Pediatric studies or waiver request included', 'conditional', 1.0, 'medium')
ON CONFLICT DO NOTHING;

COMMIT;
