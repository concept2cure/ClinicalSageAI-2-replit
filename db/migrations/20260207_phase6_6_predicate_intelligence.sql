-- Phase 6.6 — Predicate Intelligence: Toxic Predicate Detection + Shadow 510(k) Reviewer
--
-- Tables:
--   predicate.candidates          — Predicate candidates with similarity + toxicity scores
--   predicate.se_matrix_rows      — SE comparison matrix rows with evidence-linked cells
--   predicate.fda_enforcement      — Cached FDA enforcement actions (recalls, safety comms)
--   predicate.defense_previews     — Shadow 510(k) reviewer results
--
-- Depends on: core.programs, pgvector extension

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS predicate;

-- ─────────────────────────────────────────────────────────────────────────────
-- Composite type: evidence_cell
-- A typed cell that links a display value to evidence sources + confidence
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE predicate.evidence_cell AS (
        value           TEXT,
        evidence_ids    TEXT[],
        confidence      FLOAT,
        cell_hash       TEXT
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. predicate.candidates
-- Stores predicate device matches with toxicity analysis
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predicate.candidates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id          UUID NOT NULL,
    k_number            TEXT NOT NULL,
    device_name         TEXT NOT NULL,
    manufacturer        TEXT,
    clearance_date      DATE,
    product_code        TEXT,
    regulation_number   TEXT,
    similarity_score    FLOAT NOT NULL DEFAULT 0.0,
    toxicity_score      FLOAT NOT NULL DEFAULT 0.0,
    has_class_i_recall  BOOLEAN NOT NULL DEFAULT FALSE,
    has_class_ii_recall BOOLEAN NOT NULL DEFAULT FALSE,
    has_safety_comm     BOOLEAN NOT NULL DEFAULT FALSE,
    mdr_event_count     INTEGER NOT NULL DEFAULT 0,
    golden_bridge_path  JSONB DEFAULT '[]'::jsonb,
    route_type          TEXT CHECK (route_type IN ('conservative', 'aggressive', 'balanced')),
    recommended         BOOLEAN NOT NULL DEFAULT FALSE,
    evidence_links      TEXT[] DEFAULT '{}',
    selection_rationale TEXT,
    status              TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'dismissed', 'selected', 'archived')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pred_candidates_program
    ON predicate.candidates (program_id);
CREATE INDEX IF NOT EXISTS idx_pred_candidates_k_number
    ON predicate.candidates (k_number);
CREATE INDEX IF NOT EXISTS idx_pred_candidates_toxicity
    ON predicate.candidates (program_id, toxicity_score);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. predicate.fda_enforcement
-- Cached FDA enforcement actions for toxicity scoring
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predicate.fda_enforcement (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    k_number            TEXT,
    recall_number       TEXT,
    product_code        TEXT,
    event_type          TEXT NOT NULL
        CHECK (event_type IN ('class_i_recall', 'class_ii_recall', 'class_iii_recall',
                              'safety_communication', 'warning_letter', '483_observation',
                              'mdr_report', 'field_correction')),
    event_date          DATE,
    classification      TEXT,
    reason              TEXT,
    source_url          TEXT,
    raw_data            JSONB DEFAULT '{}'::jsonb,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fda_enforcement_k
    ON predicate.fda_enforcement (k_number);
CREATE INDEX IF NOT EXISTS idx_fda_enforcement_product
    ON predicate.fda_enforcement (product_code);
CREATE INDEX IF NOT EXISTS idx_fda_enforcement_type
    ON predicate.fda_enforcement (event_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. predicate.se_matrix_rows
-- Substantial Equivalence comparison rows with evidence-linked cells
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predicate.se_matrix_rows (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id              UUID NOT NULL,
    candidate_id            UUID REFERENCES predicate.candidates(id) ON DELETE CASCADE,
    sort_order              INTEGER NOT NULL DEFAULT 0,
    characteristic          TEXT NOT NULL,
    category                TEXT NOT NULL DEFAULT 'general'
        CHECK (category IN ('intended_use', 'technology', 'material', 'performance',
                            'design', 'software', 'energy', 'biocompatibility', 'general')),
    subject_value           TEXT NOT NULL,
    subject_evidence_ids    TEXT[] DEFAULT '{}',
    subject_confidence      FLOAT DEFAULT 0.0,
    predicate_value         TEXT NOT NULL,
    predicate_evidence_ids  TEXT[] DEFAULT '{}',
    predicate_confidence    FLOAT DEFAULT 0.0,
    equivalence_status      TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (equivalence_status IN ('EQUIVALENT', 'DISCUSSION_REQUIRED',
                                       'NOT_EQUIVALENT', 'TOXIC', 'PENDING')),
    diff_explanation        TEXT,
    diff_severity           TEXT DEFAULT 'none'
        CHECK (diff_severity IN ('none', 'low', 'medium', 'high', 'critical')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_se_matrix_program
    ON predicate.se_matrix_rows (program_id);
CREATE INDEX IF NOT EXISTS idx_se_matrix_candidate
    ON predicate.se_matrix_rows (candidate_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. predicate.defense_previews
-- Shadow 510(k) reviewer results — predicted FDA questions + readiness
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predicate.defense_previews (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id              UUID NOT NULL,
    candidate_id            UUID REFERENCES predicate.candidates(id) ON DELETE CASCADE,
    readiness_score         FLOAT NOT NULL DEFAULT 0.0,
    anticipated_questions   JSONB NOT NULL DEFAULT '[]'::jsonb,
    internal_contradictions JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_gaps           JSONB NOT NULL DEFAULT '[]'::jsonb,
    toxic_warnings          JSONB NOT NULL DEFAULT '[]'::jsonb,
    generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_defense_preview_program
    ON predicate.defense_previews (program_id);
CREATE INDEX IF NOT EXISTS idx_defense_preview_candidate
    ON predicate.defense_previews (candidate_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Policies — program isolation via GUC context
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE predicate.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE predicate.se_matrix_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE predicate.defense_previews ENABLE ROW LEVEL SECURITY;

-- Candidates
CREATE POLICY candidates_program_isolation ON predicate.candidates
    USING (
        program_id::TEXT = current_setting('app.current_program_id', TRUE)
        OR current_setting('app.bypass_rls', TRUE) = 'true'
    );

-- SE Matrix Rows
CREATE POLICY se_matrix_program_isolation ON predicate.se_matrix_rows
    USING (
        program_id::TEXT = current_setting('app.current_program_id', TRUE)
        OR current_setting('app.bypass_rls', TRUE) = 'true'
    );

-- Defense Previews
CREATE POLICY defense_preview_program_isolation ON predicate.defense_previews
    USING (
        program_id::TEXT = current_setting('app.current_program_id', TRUE)
        OR current_setting('app.bypass_rls', TRUE) = 'true'
    );

-- fda_enforcement is global (no program_id) — no RLS needed

COMMIT;
