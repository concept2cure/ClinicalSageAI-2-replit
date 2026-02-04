-- ============================================================================
-- Concept2Cure "Global Command Center" Schema - Core Migration
-- Migration: 001_gcc_core.sql
-- Purpose: Creates foundational schemas, tables, and HNSW indexes for
--          Scientific Ground Truth, Regulatory Prose, Adversarial Simulation,
--          and 21 CFR Part 11-supporting audit primitives
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- ============================================================================

BEGIN;

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
-- pgvector: Vector similarity search with HNSW indexing
CREATE EXTENSION IF NOT EXISTS vector;

-- uuid-ossp: UUID generation for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- SCHEMAS
-- ============================================================================
-- truth: Immutable scientific facts from CSR, lab datasets, SAP outputs, SDTM/ADaM
CREATE SCHEMA IF NOT EXISTS truth;

-- prose: eCTD module fragments (M2.7.*, M3.* summaries) with semantic embeddings
CREATE SCHEMA IF NOT EXISTS prose;

-- adversarial: IRs, CRLs, assessment questions - vectorized for IR prediction
CREATE SCHEMA IF NOT EXISTS adversarial;

-- audit: Append-only event logs (21 CFR Part 11 audit trail)
CREATE SCHEMA IF NOT EXISTS audit;

-- ============================================================================
-- TRUTH SCHEMA: Scientific Ground Truth Store
-- ============================================================================
-- Each row represents a single metric/datapoint from clinical data
-- One trial (NCT) can have hundreds of metrics (Cmax, AUC, p-values, AE rates, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS truth.clinical_truth_store (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Trial identification
    nct_id TEXT NOT NULL,                    -- ClinicalTrials.gov ID (e.g., 'NCT01234567')
    substance_id TEXT,                       -- ISO 11238 / UNII substance identifier
    
    -- Metric data
    metric_name TEXT NOT NULL,               -- e.g., 'Cmax', 'AUC', 'p_value', 'AE_Rate', 'ORR'
    metric_value_float DOUBLE PRECISION,     -- Numeric value (when applicable)
    metric_value_text TEXT,                  -- Text value (when applicable, e.g., categorical)
    is_primary_endpoint BOOLEAN DEFAULT FALSE,
    
    -- Provenance / traceability
    source_document_ref TEXT,                -- CSR section, dataset name, table/figure id
    source_document_hash TEXT,               -- SHA-256 hash for provenance validation
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- At least one value must be present
    CONSTRAINT clinical_truth_value_present
        CHECK (metric_value_float IS NOT NULL OR metric_value_text IS NOT NULL)
);

-- Lookup indexes for fast queries
CREATE INDEX IF NOT EXISTS clinical_truth_store_nct_idx 
    ON truth.clinical_truth_store (nct_id);
CREATE INDEX IF NOT EXISTS clinical_truth_store_substance_idx 
    ON truth.clinical_truth_store (substance_id);
CREATE INDEX IF NOT EXISTS clinical_truth_store_metric_idx 
    ON truth.clinical_truth_store (metric_name);
CREATE INDEX IF NOT EXISTS clinical_truth_store_created_idx 
    ON truth.clinical_truth_store (created_at);

-- Prevent duplicate fact rows (composite uniqueness)
-- A fact is unique by: trial + substance + metric + value + endpoint status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'clinical_truth_store_fact_dedup'
    ) THEN
        ALTER TABLE truth.clinical_truth_store
            ADD CONSTRAINT clinical_truth_store_fact_dedup
            UNIQUE (nct_id, substance_id, metric_name, metric_value_float, metric_value_text, is_primary_endpoint);
    END IF;
END $$;

-- ============================================================================
-- PROSE SCHEMA: Smart Fragments (eCTD Module Content)
-- ============================================================================
-- Versioned regulatory narrative fragments with semantic embeddings
-- Each fragment can cite multiple truth datapoints via fragment_truth_links
-- ============================================================================
CREATE TABLE IF NOT EXISTS prose.smart_fragments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- eCTD structure
    ectd_section_path TEXT NOT NULL,         -- e.g., 'm2.7.3-efficacy-summary', 'm3.2.s.2.2'
    jurisdiction TEXT NOT NULL DEFAULT 'Global', -- FDA, EMA, PMDA, NMPA, Health Canada, Global
    
    -- Content
    content_prose TEXT,                      -- Actual narrative text
    embedding VECTOR(1536),                  -- Semantic search (OpenAI ada-002 dimension)
    
    -- Quality metrics
    objectivity_score DOUBLE PRECISION,      -- 1.0 = direct data citation; 0.1 = interpretation
    confidence_rating TEXT,                  -- 'Conclusive' | 'Interpretive' | 'Ambiguous'
    is_verified_against_truth BOOLEAN DEFAULT FALSE,
    
    -- Regulatory linkage
    regulatory_precedent_id UUID,            -- Optional link to adversarial precedent
    burden_of_proof_justification TEXT,      -- Why this claim is defensible
    
    -- Versioning (for Part 11 traceability)
    version_id INT NOT NULL DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT objectivity_score_range 
        CHECK (objectivity_score IS NULL OR (objectivity_score >= 0 AND objectivity_score <= 1)),
    CONSTRAINT confidence_rating_valid
        CHECK (confidence_rating IS NULL OR confidence_rating IN ('Conclusive', 'Interpretive', 'Ambiguous'))
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS smart_fragments_section_idx 
    ON prose.smart_fragments (ectd_section_path);
CREATE INDEX IF NOT EXISTS smart_fragments_jurisdiction_idx 
    ON prose.smart_fragments (jurisdiction);
CREATE INDEX IF NOT EXISTS smart_fragments_verified_idx 
    ON prose.smart_fragments (is_verified_against_truth);
CREATE INDEX IF NOT EXISTS smart_fragments_version_idx 
    ON prose.smart_fragments (version_id);
CREATE INDEX IF NOT EXISTS smart_fragments_created_idx 
    ON prose.smart_fragments (created_at);

-- ============================================================================
-- PROSE SCHEMA: Fragment-Truth Links (Claims Ledger)
-- ============================================================================
-- This is the core traceability table: every prose claim can cite exact truth rows
-- Enables drift detection: compare what prose claims vs. actual truth values
-- ============================================================================
CREATE TABLE IF NOT EXISTS prose.fragment_truth_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Foreign keys
    fragment_id UUID NOT NULL REFERENCES prose.smart_fragments(id) ON DELETE RESTRICT,
    truth_id UUID NOT NULL REFERENCES truth.clinical_truth_store(id) ON DELETE RESTRICT,
    
    -- Claim metadata
    claim_kind TEXT NOT NULL DEFAULT 'supports', 
        -- 'supports' | 'contradicts' | 'context' | 'safety' | 'efficacy' | 'pk' | 'pd' | 'cmc'
    claim_span JSONB,                        -- Where in content_prose this datapoint is referenced
                                             -- e.g., {"start": 150, "end": 200, "sentence": 3}
    extracted_claim_value JSONB,             -- What the prose "claims" (for drift computation)
                                             -- e.g., {"value": 45.2, "unit": "ng/mL", "comparison": ">"}
    
    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate links
    CONSTRAINT fragment_truth_links_dedup 
        UNIQUE (fragment_id, truth_id, claim_kind)
);

-- Foreign key indexes
CREATE INDEX IF NOT EXISTS fragment_truth_links_fragment_idx 
    ON prose.fragment_truth_links (fragment_id);
CREATE INDEX IF NOT EXISTS fragment_truth_links_truth_idx 
    ON prose.fragment_truth_links (truth_id);
CREATE INDEX IF NOT EXISTS fragment_truth_links_kind_idx 
    ON prose.fragment_truth_links (claim_kind);

-- ============================================================================
-- ADVERSARIAL SCHEMA: Regulatory Adversarial Precedents
-- ============================================================================
-- Historical regulator questions, IRs, CRLs, RTQs vectorized for similarity search
-- "Shadow Agent" uses this to predict what regulators will ask
-- ============================================================================
CREATE TABLE IF NOT EXISTS adversarial.regulatory_adversarial_precedents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source agency
    agency_code TEXT NOT NULL,               -- FDA, EMA, PMDA, NMPA, Health Canada, TGA
    
    -- Failure classification
    failure_mode TEXT NOT NULL,              -- 'Clinical Gap', 'CMC Inconsistency', 'Safety Signal',
                                             -- 'Bioequivalence Failure', 'Manufacturing Deficiency'
    
    -- The actual question/issue
    historical_question TEXT NOT NULL,       -- Actual regulator question or IR text
    
    -- Semantic embedding for similarity search
    precedent_vector VECTOR(1536),           -- Same dimension as prose embeddings
    
    -- Provenance
    source_ref TEXT,                         -- Document ID, letter ref, assessment report section
    therapeutic_area TEXT,                   -- Oncology, CNS, Cardiovascular, etc.
    drug_class TEXT,                         -- Small molecule, biologic, gene therapy, etc.
    submission_type TEXT,                    -- NDA, BLA, 510(k), PMA, ANDA, IND
    
    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS adversarial_agency_idx 
    ON adversarial.regulatory_adversarial_precedents (agency_code);
CREATE INDEX IF NOT EXISTS adversarial_failure_mode_idx 
    ON adversarial.regulatory_adversarial_precedents (failure_mode);
CREATE INDEX IF NOT EXISTS adversarial_therapeutic_idx 
    ON adversarial.regulatory_adversarial_precedents (therapeutic_area);
CREATE INDEX IF NOT EXISTS adversarial_submission_idx 
    ON adversarial.regulatory_adversarial_precedents (submission_type);
CREATE INDEX IF NOT EXISTS adversarial_created_idx 
    ON adversarial.regulatory_adversarial_precedents (created_at);

-- ============================================================================
-- AUDIT SCHEMA: Concomitant Audit Logs (Append-Only)
-- ============================================================================
-- 21 CFR Part 11 audit trail: AI/human events, drift detection, IR predictions
-- IMMUTABILITY enforced by trigger in migration 002
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit.concomitant_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Optional link to fragment being audited
    fragment_id UUID REFERENCES prose.smart_fragments(id) ON DELETE SET NULL,
    
    -- Who/what generated this audit entry
    agent_identity TEXT NOT NULL,            -- 'SHADOW_AGENT' | 'LUMEN_CORTEX' | 'DRIFT_MONITOR' | user email
    
    -- Risk assessment
    risk_status TEXT NOT NULL,               -- 'DATA_DRIFT' | 'ALIGNED' | 'IR_PREDICTED' | 'MANUAL_REVIEW'
    
    -- Detailed payload (JSON)
    feedback_payload JSONB NOT NULL,         -- AI suggestion/warning payload
                                             -- Schema varies by agent_identity
    
    -- Quantified drift (when applicable)
    drift_magnitude DOUBLE PRECISION,        -- 0.0 = aligned; higher = more drift
    
    -- Request correlation (for tracing)
    request_id TEXT,                         -- External request ID for correlation
    
    -- Timestamp (immutable)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS audit_logs_fragment_idx 
    ON audit.concomitant_audit_logs (fragment_id);
CREATE INDEX IF NOT EXISTS audit_logs_risk_idx 
    ON audit.concomitant_audit_logs (risk_status);
CREATE INDEX IF NOT EXISTS audit_logs_agent_idx 
    ON audit.concomitant_audit_logs (agent_identity);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx 
    ON audit.concomitant_audit_logs (created_at);
CREATE INDEX IF NOT EXISTS audit_logs_request_idx 
    ON audit.concomitant_audit_logs (request_id);

-- ============================================================================
-- HNSW VECTOR INDEXES (pgvector)
-- ============================================================================
-- HNSW (Hierarchical Navigable Small World) indexes for fast approximate nearest neighbor search
-- Using cosine distance (vector_cosine_ops) which is standard for text embeddings
-- ============================================================================

-- Prose fragments embedding index
CREATE INDEX IF NOT EXISTS smart_fragments_embedding_hnsw
    ON prose.smart_fragments 
    USING hnsw (embedding vector_cosine_ops);

-- Adversarial precedents vector index
CREATE INDEX IF NOT EXISTS adversarial_precedent_vector_hnsw
    ON adversarial.regulatory_adversarial_precedents 
    USING hnsw (precedent_vector vector_cosine_ops);

-- ============================================================================
-- COMMENTS (for documentation)
-- ============================================================================
COMMENT ON SCHEMA truth IS 'Scientific Ground Truth: Immutable facts from CSR, SDTM/ADaM, lab data';
COMMENT ON SCHEMA prose IS 'Regulatory Prose: Versioned eCTD fragments with semantic embeddings';
COMMENT ON SCHEMA adversarial IS 'Adversarial Simulation: Historical regulator questions for IR prediction';
COMMENT ON SCHEMA audit IS 'Audit Trail: Append-only logs for 21 CFR Part 11 compliance';

COMMENT ON TABLE truth.clinical_truth_store IS 'Immutable clinical datapoints - one trial has many metrics';
COMMENT ON TABLE prose.smart_fragments IS 'eCTD module narrative fragments with semantic search';
COMMENT ON TABLE prose.fragment_truth_links IS 'Claims ledger: maps prose citations to exact truth rows';
COMMENT ON TABLE adversarial.regulatory_adversarial_precedents IS 'Vectorized historical regulator questions';
COMMENT ON TABLE audit.concomitant_audit_logs IS 'Append-only audit trail (21 CFR Part 11)';

COMMIT;
