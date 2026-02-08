-- =============================================================================
-- Phase 6.6.A — FDA 510(k) Predicate Universe: Clearances, Safety Signals,
--               Semantic Embeddings, and Lineage Graph
--
-- System: Lumen Cortex — Predicate Intelligence Layer
-- Compliance: 21 CFR Part 11 (traceability), ALCOA+ principles
--
-- Tables:
--   predicate.fda_product_codes     — Product classification codes (global ref)
--   predicate.fda_510k_clearances   — 510(k) clearance decisions
--   predicate.predicate_safety_signals — Recall/MDR/483 signal overlay
--   predicate.fda_510k_embeddings   — Semantic search vectors (pgvector)
--   predicate.predicate_lineage     — Parent→child predicate graph
--
-- Depends on: predicate schema (20260207_phase6_6_predicate_intelligence.sql),
--             pgvector extension
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: predicate.fda_product_codes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predicate.fda_product_codes (
    code                TEXT PRIMARY KEY,
    device_class        TEXT CHECK (device_class IN ('1', '2', '3')),
    regulation_number   TEXT,
    review_panel        TEXT,
    name                TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_codes_class
    ON predicate.fda_product_codes(device_class);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: predicate.fda_510k_clearances
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predicate.fda_510k_clearances (
    k_number            TEXT PRIMARY KEY,
    applicant           TEXT,
    device_name         TEXT NOT NULL,
    product_code        TEXT REFERENCES predicate.fda_product_codes(code),
    decision_date       DATE,
    decision_code       TEXT CHECK (decision_code IN ('SE', 'NSE', 'SESE', 'PanelTrack')),
    summary_url         TEXT,
    clearance_type      TEXT CHECK (clearance_type IN ('Traditional', 'Special', 'Abbreviated', 'De_Novo')),
    txt_content         TEXT,
    statement_or_summary TEXT CHECK (statement_or_summary IN ('Summary', 'Statement', 'Unknown')),
    third_party_review  BOOLEAN DEFAULT FALSE,
    expedited_review    BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clearances_product_code
    ON predicate.fda_510k_clearances(product_code);
CREATE INDEX IF NOT EXISTS idx_clearances_decision_date
    ON predicate.fda_510k_clearances(decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_clearances_applicant
    ON predicate.fda_510k_clearances(applicant);
CREATE INDEX IF NOT EXISTS idx_clearances_device_name_trgm
    ON predicate.fda_510k_clearances USING gin (device_name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: predicate.predicate_safety_signals
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predicate.predicate_safety_signals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    k_number            TEXT NOT NULL REFERENCES predicate.fda_510k_clearances(k_number),
    signal_type         TEXT NOT NULL CHECK (signal_type IN (
                            'Class1Recall', 'Class2Recall', 'Class3Recall',
                            'MDRReport', 'SafetyCommunication',
                            '483Warning', 'Seizure', 'WarningLetter'
                        )),
    signal_date         DATE,
    description         TEXT,
    severity_score      FLOAT NOT NULL CHECK (severity_score BETWEEN 0.0 AND 1.0),
    source_url          TEXT,
    recall_number       TEXT,
    event_id            TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_k_number
    ON predicate.predicate_safety_signals(k_number);
CREATE INDEX IF NOT EXISTS idx_signals_severity
    ON predicate.predicate_safety_signals(severity_score DESC);
CREATE INDEX IF NOT EXISTS idx_signals_type
    ON predicate.predicate_safety_signals(signal_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: predicate.fda_510k_embeddings (pgvector)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predicate.fda_510k_embeddings (
    k_number            TEXT PRIMARY KEY REFERENCES predicate.fda_510k_clearances(k_number),
    embedding           vector(1536),
    content_hash        TEXT,
    model_version       TEXT DEFAULT 'text-embedding-3-large',
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_vector
    ON predicate.fda_510k_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: predicate.predicate_lineage (Golden Bridge graph)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predicate.predicate_lineage (
    child_k_number      TEXT NOT NULL REFERENCES predicate.fda_510k_clearances(k_number),
    parent_k_number     TEXT NOT NULL REFERENCES predicate.fda_510k_clearances(k_number),
    relationship_type   TEXT NOT NULL CHECK (relationship_type IN (
                            'DirectPredicate', 'Grandparent', 'Sibling'
                        )),
    lineage_distance    INT NOT NULL DEFAULT 1,
    source              TEXT DEFAULT 'summary_parse',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (child_k_number, parent_k_number)
);

CREATE INDEX IF NOT EXISTS idx_lineage_parent
    ON predicate.predicate_lineage(parent_k_number);
CREATE INDEX IF NOT EXISTS idx_lineage_child
    ON predicate.predicate_lineage(child_k_number);

-- ─────────────────────────────────────────────────────────────────────────────
-- Materialized view: toxic predicates (for fast dashboard queries)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS predicate.toxic_predicates AS
SELECT
    c.k_number,
    c.device_name,
    c.product_code,
    c.decision_date,
    MAX(s.severity_score) AS max_severity,
    COUNT(s.id)           AS signal_count,
    ARRAY_AGG(DISTINCT s.signal_type) AS signal_types
FROM predicate.fda_510k_clearances c
JOIN predicate.predicate_safety_signals s ON s.k_number = c.k_number
GROUP BY c.k_number, c.device_name, c.product_code, c.decision_date
HAVING MAX(s.severity_score) > 0.3
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_toxic_predicates_k
    ON predicate.toxic_predicates(k_number);

COMMIT;
