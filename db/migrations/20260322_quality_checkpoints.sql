-- =============================================================================
-- Quality Checkpoints — AnA Continuous Evaluation Loop
--
-- Stores quality evaluation checkpoints for trend tracking and regression
-- detection during document authoring sessions.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS precedent.quality_checkpoints (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id          TEXT NOT NULL,
    submission_type     TEXT NOT NULL,
    overall_score       INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
    grade               TEXT NOT NULL,
    dimension_scores    JSONB DEFAULT '{}',
    finding_count       INTEGER DEFAULT 0,
    critical_gap_count  INTEGER DEFAULT 0,
    word_count          INTEGER DEFAULT 0,
    project_id          TEXT,
    organization_id     INTEGER,
    created_by          TEXT DEFAULT 'system',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quality_cp_project
    ON precedent.quality_checkpoints(project_id, section_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quality_cp_org
    ON precedent.quality_checkpoints(organization_id);
CREATE INDEX IF NOT EXISTS idx_quality_cp_section
    ON precedent.quality_checkpoints(section_id, created_at DESC);

COMMIT;
