-- =============================================================================
-- Regulatory Precedent Engine — Schema Additions
--
-- Links CSR intelligence data to predicate/clearance records,
-- enabling automatic precedent surfacing during document authoring.
--
-- Tables:
--   precedent.regulatory_precedents  — Unified precedent records (approvals,
--                                      rejections, strategies, FDA comments)
--   precedent.csr_precedent_links    — Bridge: CSR report ↔ precedent record
--
-- Depends on: predicate schema, adversarial schema, pgvector extension
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- Ensure schema exists (created by prior migration)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS precedent;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: precedent.regulatory_precedents
-- Unified precedent knowledge: approvals, rejections, strategies, objections
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS precedent.regulatory_precedents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Classification
    submission_type     TEXT NOT NULL,           -- 510(k), PMA, De_Novo, NDA, BLA, IND, ANDA, CER
    product_type        TEXT,                    -- Device, Drug, Biologic, Combination, IVD
    device_class        TEXT,                    -- 1, 2, 3 (for devices)
    therapeutic_area    TEXT,                    -- Oncology, CNS, Cardiovascular, etc.
    indication          TEXT,                    -- Target indication / intended use

    -- Regulatory identity
    clearance_number    TEXT,                    -- K-number, NDA number, BLA number
    device_name         TEXT,                    -- Product/device name
    applicant           TEXT,                    -- Sponsor / manufacturer
    decision_date       DATE,                   -- When FDA decided
    decision_outcome    TEXT NOT NULL,           -- APPROVED, CLEARED, REJECTED, CRL, REFUSE_TO_FILE
    clearance_type      TEXT,                    -- Traditional, Special, Abbreviated, De_Novo, Priority

    -- Regulatory strategy
    predicate_device    TEXT,                    -- Referenced predicate (for 510k)
    predicate_k_number  TEXT,                    -- Predicate K-number
    strategy_summary    TEXT,                    -- How the applicant argued equivalence/safety/efficacy
    testing_approach    TEXT,                    -- Bench, clinical, biocompatibility, etc.

    -- Trial design (for drug/biologic)
    trial_design        TEXT,                    -- RCT, single-arm, crossover, etc.
    sample_size         INTEGER,                -- Number of subjects
    primary_endpoint    TEXT,                    -- Primary efficacy measure
    endpoint_met        BOOLEAN,                -- Whether primary endpoint was met

    -- FDA feedback
    fda_comments        TEXT,                    -- Key FDA reviewer comments / deficiency notes
    fda_questions       JSONB DEFAULT '[]',      -- Array of specific FDA questions / IRs
    risk_factors        JSONB DEFAULT '[]',      -- Identified risk factors / objections

    -- Embedding for similarity search
    embedding           vector(1536),            -- Semantic embedding of the full precedent record

    -- Provenance
    source_documents    TEXT[] DEFAULT '{}',      -- Document IDs that sourced this precedent
    source_type         TEXT,                    -- CSR, FDA_Summary, FDA_Review, Literature, Manual
    confidence_score    FLOAT DEFAULT 1.0,       -- 0-1 extraction confidence
    created_by          TEXT DEFAULT 'system',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for filtered similarity search
CREATE INDEX IF NOT EXISTS idx_precedent_submission_type
    ON precedent.regulatory_precedents(submission_type);
CREATE INDEX IF NOT EXISTS idx_precedent_product_type
    ON precedent.regulatory_precedents(product_type);
CREATE INDEX IF NOT EXISTS idx_precedent_device_class
    ON precedent.regulatory_precedents(device_class);
CREATE INDEX IF NOT EXISTS idx_precedent_therapeutic_area
    ON precedent.regulatory_precedents(therapeutic_area);
CREATE INDEX IF NOT EXISTS idx_precedent_decision
    ON precedent.regulatory_precedents(decision_outcome);
CREATE INDEX IF NOT EXISTS idx_precedent_clearance_number
    ON precedent.regulatory_precedents(clearance_number);
CREATE INDEX IF NOT EXISTS idx_precedent_decision_date
    ON precedent.regulatory_precedents(decision_date DESC);

-- Vector index for semantic similarity search
CREATE INDEX IF NOT EXISTS idx_precedent_embedding_hnsw
    ON precedent.regulatory_precedents
    USING hnsw (embedding vector_cosine_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: precedent.csr_precedent_links
-- Bridge table: links CSR reports to precedent records
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS precedent.csr_precedent_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    csr_report_id       INTEGER NOT NULL,       -- FK to csr_reports.id
    precedent_id        UUID NOT NULL REFERENCES precedent.regulatory_precedents(id) ON DELETE CASCADE,
    link_type           TEXT NOT NULL,           -- extracted_from, similar_trial, predicate_match
    similarity_score    FLOAT,                  -- Cosine similarity when auto-matched
    notes               TEXT,                   -- Human or AI annotations
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_csr_precedent_csr
    ON precedent.csr_precedent_links(csr_report_id);
CREATE INDEX IF NOT EXISTS idx_csr_precedent_precedent
    ON precedent.csr_precedent_links(precedent_id);

COMMIT;
