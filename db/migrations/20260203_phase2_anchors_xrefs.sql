-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Anchor + cross-reference tables for Module 2/5 navigation traceability
--
-- eCTD/CTD Context:
--   - Module(s): Module 2.7 (Clinical Summary), Module 5 (Clinical Study Reports)
--   - Integrity Risk Addressed: broken cross-refs, orphaned anchors, navigation integrity
--
-- Determinism Contract:
--   - Schema changes here must not undermine deterministic evidence pointers/fingerprints.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
--   - vault.anchors: Deterministic bookmark/heading extraction for 21 CFR 11
--   - vault.cross_references: Validated internal/external document links
-- =============================================================================

BEGIN;

-- ============================================================================
-- TABLE: vault.anchors
-- Stores extracted anchors (bookmarks, headings, numbered paragraphs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS vault.anchors (
    anchor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Document reference (inherits RLS via FK)
    doc_id UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    program_id UUID NOT NULL,  -- Denormalized for RLS efficiency

    -- Content identity (for deterministic re-runs)
    content_hash CHAR(64) NOT NULL,

    -- Anchor identity
    anchor_key VARCHAR(255) NOT NULL,
    anchor_type VARCHAR(50) NOT NULL,
    anchor_ordinal INT NOT NULL DEFAULT 0,  -- Supports duplicate keys

    -- Evidence pointer (frozen v1.0 format)
    evidence_pointer JSONB NOT NULL,

    -- Human-readable text
    extracted_text TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT anchors_type_check CHECK (
        anchor_type IN ('bookmark', 'heading', 'numbered_paragraph')
    ),
    CONSTRAINT anchors_unique_key UNIQUE (content_hash, anchor_key, anchor_ordinal)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_anchors_doc_id ON vault.anchors(doc_id);
CREATE INDEX IF NOT EXISTS idx_anchors_content_key ON vault.anchors(content_hash, anchor_key);
CREATE INDEX IF NOT EXISTS idx_anchors_program_id ON vault.anchors(program_id);

-- RLS
ALTER TABLE vault.anchors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_anchors_select ON vault.anchors;
CREATE POLICY rls_anchors_select ON vault.anchors
    FOR SELECT USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_anchors_insert ON vault.anchors;
CREATE POLICY rls_anchors_insert ON vault.anchors
    FOR INSERT WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_anchors_update ON vault.anchors;
CREATE POLICY rls_anchors_update ON vault.anchors
    FOR UPDATE USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_anchors_delete ON vault.anchors;
CREATE POLICY rls_anchors_delete ON vault.anchors
    FOR DELETE USING (core.can_write_program(program_id));

-- ============================================================================
-- TABLE: vault.cross_references
-- Stores detected cross-references with validation status
-- ============================================================================

CREATE TABLE IF NOT EXISTS vault.cross_references (
    xref_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Document reference
    source_doc_id UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    program_id UUID NOT NULL,  -- Denormalized for RLS efficiency

    -- Content identity
    content_hash CHAR(64) NOT NULL,

    -- Reference relationship
    source_anchor_key VARCHAR(255),  -- NULL if from plain text (not from anchor)
    target_anchor_key VARCHAR(255) NOT NULL,

    -- Evidence pointer (frozen v1.0 format)
    evidence_pointer JSONB NOT NULL,

    -- Validation result
    validation_status VARCHAR(20) NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT xrefs_status_check CHECK (
        validation_status IN ('valid', 'broken', 'ambiguous', 'external')
    ),
    CONSTRAINT xrefs_confidence_check CHECK (
        confidence >= 0.0 AND confidence <= 1.0
    )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_xrefs_source_doc ON vault.cross_references(source_doc_id);
CREATE INDEX IF NOT EXISTS idx_xrefs_content_hash ON vault.cross_references(content_hash);
CREATE INDEX IF NOT EXISTS idx_xrefs_target_key ON vault.cross_references(target_anchor_key);
CREATE INDEX IF NOT EXISTS idx_xrefs_status ON vault.cross_references(validation_status);
CREATE INDEX IF NOT EXISTS idx_xrefs_program_id ON vault.cross_references(program_id);

-- Unique constraint for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_xrefs_idempotent
    ON vault.cross_references(content_hash, target_anchor_key, (evidence_pointer->>'paragraph_index'));

-- RLS
ALTER TABLE vault.cross_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_xrefs_select ON vault.cross_references;
CREATE POLICY rls_xrefs_select ON vault.cross_references
    FOR SELECT USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS rls_xrefs_insert ON vault.cross_references;
CREATE POLICY rls_xrefs_insert ON vault.cross_references
    FOR INSERT WITH CHECK (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_xrefs_update ON vault.cross_references;
CREATE POLICY rls_xrefs_update ON vault.cross_references
    FOR UPDATE USING (core.can_write_program(program_id));

DROP POLICY IF EXISTS rls_xrefs_delete ON vault.cross_references;
CREATE POLICY rls_xrefs_delete ON vault.cross_references
    FOR DELETE USING (core.can_write_program(program_id));

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE vault.anchors IS
'Phase 2: Stores extracted document anchors (headings, bookmarks, numbered paragraphs) with deterministic keys for cross-reference resolution.';

COMMENT ON TABLE vault.cross_references IS
'Phase 2: Stores detected cross-references with validation status (valid/broken/ambiguous/external) for Shadow FDA Reviewer.';

COMMENT ON COLUMN vault.anchors.anchor_ordinal IS
'0-based ordinal for handling duplicate anchor keys deterministically. Same anchor_key may appear multiple times; ordinal preserves encounter order.';

COMMENT ON COLUMN vault.cross_references.validation_status IS
'valid=exactly one anchor matches, broken=no matches, ambiguous=multiple matches, external=references outside document';

COMMIT;
