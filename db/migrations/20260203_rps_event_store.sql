-- ============================================================================
-- Phase 3+: eCTD 4.0 Event Store Skeleton
-- Migration: vault.rps_events + vault.uuid_lifecycle + vault.uuid_edges
-- Date: 2026-02-03
-- ============================================================================
--
-- eCTD MODULE CONTEXT:
--   Module 1 (Administrative): Submission lifecycle tracking via HL7 RPS
--   Module 5 (Clinical Study Reports): Event-sourced document provenance
--
-- REGULATORY AUDIT TRAIL:
--   - vault.rps_events: Append-only immutable event log (21 CFR Part 11)
--   - vault.uuid_lifecycle: Materialized current state for point-in-time queries
--   - vault.uuid_edges: Graph adjacency for submission hierarchy traversal
--
-- IND SUBMISSION ALIGNMENT:
--   Date-based migration naming (20YYMMDD_*) enables exact system state
--   reconstruction at any regulatory submission point in the IND timeline.
--
-- This is a SKELETON implementation - tables created but not yet used.
-- Provides foundation for HL7 RPS lifecycle management without blocking
-- the Phase 3 Shadow Reviewer MVP.
--
-- Design decisions:
-- 1. Using uuid_edges adjacency table instead of UUID[] for predictable perf
-- 2. Append-only rps_events for audit trail
-- 3. uuid_lifecycle for materialized current state
--
-- NOTE: This schema is parallel to existing vault.anchors/cross_references.
-- Migration to event-sourced model is deferred until Phase 4+.

BEGIN;

-- ============================================================================
-- TABLE: vault.rps_events (Append-Only Event Log)
-- ============================================================================
-- Stores HL7 RPS lifecycle events for regulatory submissions.
-- Each event represents an operation: create, amend, replace, delete

CREATE TABLE IF NOT EXISTS vault.rps_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Event classification
    event_type VARCHAR(100) NOT NULL,  -- 'SubmissionCreated', 'SectionAmended', etc.

    -- eCTD 4.0 / HL7 RPS identifiers
    submission_uuid UUID NOT NULL,      -- Top-level submission Set ID
    entry_uuid UUID,                    -- Document/section UUID (HL7 id root)
    operation_code VARCHAR(20),         -- 'create', 'revise', 'remove', 'nullify'

    -- Content addressing
    content_hash CHAR(64),              -- SHA256 of content blob
    previous_content_hash CHAR(64),     -- For amend/replace chains

    -- Product classification
    product_type VARCHAR(50),           -- 'SmallMolecule', 'Biologic', 'GeneTherapy', 'DeviceSaMD'
    regulatory_pathway VARCHAR(50),     -- 'IND', '510k', 'PMA', 'BLA', 'NDA'
    module_scope VARCHAR(50),           -- 'm1', 'm2', 'm3', 'm4', 'm5', 'DHF'

    -- RLS key (denormalized for performance)
    program_id UUID NOT NULL,

    -- Event payload (the actual HL7 RPS fragment + canonical content)
    payload JSONB NOT NULL DEFAULT '{}',

    -- Metadata (git SHA, model version, user, GxP signature)
    metadata JSONB DEFAULT '{}',

    -- Ordering (strict per-submission sequence)
    sequence_number BIGINT NOT NULL,

    -- Timestamps
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT rps_events_operation_check CHECK (
        operation_code IS NULL OR
        operation_code IN ('create', 'revise', 'remove', 'nullify')
    ),
    CONSTRAINT rps_events_sequence_positive CHECK (sequence_number > 0)
);

-- Indexes for event store queries
CREATE INDEX IF NOT EXISTS idx_rps_events_submission
    ON vault.rps_events(submission_uuid, sequence_number);
CREATE INDEX IF NOT EXISTS idx_rps_events_entry
    ON vault.rps_events(entry_uuid);
CREATE INDEX IF NOT EXISTS idx_rps_events_content_hash
    ON vault.rps_events(content_hash);
CREATE INDEX IF NOT EXISTS idx_rps_events_program_id
    ON vault.rps_events(program_id);
CREATE INDEX IF NOT EXISTS idx_rps_events_occurred
    ON vault.rps_events(occurred_at DESC);

COMMENT ON TABLE vault.rps_events IS
    'Append-only HL7 RPS lifecycle events. Phase 3+ skeleton - not yet active.';

-- ============================================================================
-- TABLE: vault.uuid_lifecycle (Materialized Current State)
-- ============================================================================
-- Tracks the current state of each UUID across lifecycle operations.
-- Updated by event processors (eventually via triggers or workers).

CREATE TABLE IF NOT EXISTS vault.uuid_lifecycle (
    entry_uuid UUID PRIMARY KEY,        -- HL7 RPS id (immutable identity)
    submission_uuid UUID NOT NULL,      -- Parent submission

    -- Current state
    current_content_hash CHAR(64),
    lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'active',

    -- Lifecycle chain
    root_uuid UUID,                     -- Original UUID if this is an amendment
    replaced_by_uuid UUID,              -- If superseded, what replaced it?

    -- Version tracking
    version_number INT NOT NULL DEFAULT 1,

    -- RLS key
    program_id UUID NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uuid_lifecycle_status_check CHECK (
        lifecycle_status IN ('active', 'superseded', 'deleted', 'pending')
    )
);

-- Indexes for lifecycle queries
CREATE INDEX IF NOT EXISTS idx_uuid_lifecycle_submission
    ON vault.uuid_lifecycle(submission_uuid);
CREATE INDEX IF NOT EXISTS idx_uuid_lifecycle_status
    ON vault.uuid_lifecycle(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_uuid_lifecycle_program_id
    ON vault.uuid_lifecycle(program_id);
CREATE INDEX IF NOT EXISTS idx_uuid_lifecycle_root
    ON vault.uuid_lifecycle(root_uuid) WHERE root_uuid IS NOT NULL;

COMMENT ON TABLE vault.uuid_lifecycle IS
    'Materialized current state of eCTD UUIDs. Phase 3+ skeleton.';

-- ============================================================================
-- TABLE: vault.uuid_edges (Adjacency Table for Cross-References)
-- ============================================================================
-- Stores directed edges for the document reference graph.
-- Using adjacency table instead of UUID[] arrays for predictable query perf.

CREATE TABLE IF NOT EXISTS vault.uuid_edges (
    edge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Edge direction
    source_uuid UUID NOT NULL,          -- Document containing the reference
    target_uuid UUID NOT NULL,          -- Document being referenced

    -- Edge metadata
    reference_type VARCHAR(50),         -- 'supportive', 'previous', 'related'
    edge_status VARCHAR(20) NOT NULL DEFAULT 'active',

    -- RLS key (inherited from source document)
    program_id UUID NOT NULL,

    -- Content identity (for deterministic validation)
    source_content_hash CHAR(64),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uuid_edges_no_self_loop CHECK (source_uuid != target_uuid),
    CONSTRAINT uuid_edges_status_check CHECK (
        edge_status IN ('active', 'broken', 'superseded')
    ),
    -- Prevent duplicate edges
    CONSTRAINT uuid_edges_unique UNIQUE (source_uuid, target_uuid, source_content_hash)
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_uuid_edges_source
    ON vault.uuid_edges(source_uuid);
CREATE INDEX IF NOT EXISTS idx_uuid_edges_target
    ON vault.uuid_edges(target_uuid);
CREATE INDEX IF NOT EXISTS idx_uuid_edges_program_id
    ON vault.uuid_edges(program_id);
CREATE INDEX IF NOT EXISTS idx_uuid_edges_status
    ON vault.uuid_edges(edge_status) WHERE edge_status = 'broken';

COMMENT ON TABLE vault.uuid_edges IS
    'Adjacency table for UUID cross-reference graph. Enables O(1) traversal.';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE vault.rps_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.uuid_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault.uuid_edges ENABLE ROW LEVEL SECURITY;

-- RPS Events policies
CREATE POLICY rps_events_select_policy ON vault.rps_events
    FOR SELECT USING (core.can_access_program(program_id));

CREATE POLICY rps_events_insert_policy ON vault.rps_events
    FOR INSERT WITH CHECK (core.can_write_program(program_id));

-- UUID Lifecycle policies
CREATE POLICY uuid_lifecycle_select_policy ON vault.uuid_lifecycle
    FOR SELECT USING (core.can_access_program(program_id));

CREATE POLICY uuid_lifecycle_insert_policy ON vault.uuid_lifecycle
    FOR INSERT WITH CHECK (core.can_write_program(program_id));

CREATE POLICY uuid_lifecycle_update_policy ON vault.uuid_lifecycle
    FOR UPDATE USING (core.can_write_program(program_id));

-- UUID Edges policies
CREATE POLICY uuid_edges_select_policy ON vault.uuid_edges
    FOR SELECT USING (core.can_access_program(program_id));

CREATE POLICY uuid_edges_insert_policy ON vault.uuid_edges
    FOR INSERT WITH CHECK (core.can_write_program(program_id));

CREATE POLICY uuid_edges_update_policy ON vault.uuid_edges
    FOR UPDATE USING (core.can_write_program(program_id));

-- ============================================================================
-- HELPER FUNCTIONS (Stubs for future use)
-- ============================================================================

-- Function to get inbound edges (who references this UUID)
CREATE OR REPLACE FUNCTION vault.get_inbound_refs(p_target_uuid UUID)
RETURNS TABLE(source_uuid UUID, reference_type VARCHAR, edge_status VARCHAR)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
    SELECT source_uuid, reference_type, edge_status
    FROM vault.uuid_edges
    WHERE target_uuid = p_target_uuid
      AND edge_status = 'active'
    ORDER BY source_uuid;
$$;

-- Function to get outbound edges (what this UUID references)
CREATE OR REPLACE FUNCTION vault.get_outbound_refs(p_source_uuid UUID)
RETURNS TABLE(target_uuid UUID, reference_type VARCHAR, edge_status VARCHAR)
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
    SELECT target_uuid, reference_type, edge_status
    FROM vault.uuid_edges
    WHERE source_uuid = p_source_uuid
      AND edge_status = 'active'
    ORDER BY target_uuid;
$$;

-- Function to detect broken references for a UUID
CREATE OR REPLACE FUNCTION vault.count_broken_refs(p_source_uuid UUID)
RETURNS INT
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
    SELECT COUNT(*)::INT
    FROM vault.uuid_edges
    WHERE source_uuid = p_source_uuid
      AND edge_status = 'broken';
$$;

COMMENT ON FUNCTION vault.get_inbound_refs IS 'Get all UUIDs that reference the target UUID.';
COMMENT ON FUNCTION vault.get_outbound_refs IS 'Get all UUIDs referenced by the source UUID.';
COMMENT ON FUNCTION vault.count_broken_refs IS 'Count broken outbound references from a UUID.';

COMMIT;
