-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Introduce render-job tracking for deterministic artifact generation and verification.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1/2/5 rendered output lifecycle and auditability
--   - Integrity Risk Addressed: opaque render execution and unverifiable artifact lineage
--
-- Determinism Contract:
--   - inputs_hash and artifact_hash must remain authoritative for replay validation.
--   - Artifact type contract changes require explicit migration governance.
--
-- Notes:
--   - Table supports immutable lifecycle evidence via audit events.
-- =============================================================================

-- Migration: Phase 7.0A — Render Jobs Table
-- Tracks document rendering pipeline: PDF, DOCX, eCTD sequence generation
-- Depends on: predicate schema + proof_pack_exports table (Phase 6.6.E)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- predicate.render_jobs — One row per render request
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS predicate.render_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_pack_id   UUID NOT NULL REFERENCES predicate.proof_pack_exports(id),
    artifact_type   VARCHAR(50) NOT NULL
        CHECK (artifact_type IN ('defense_packet_pdf', 'defense_packet_docx', 'ectd_sequence_zip')),
    status          VARCHAR(20) NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
    inputs_hash     TEXT NOT NULL,
    artifact_hash   TEXT,
    artifact_size_bytes BIGINT,
    artifact_path   TEXT,
    error           TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      TEXT NOT NULL DEFAULT 'system',
    request_id      TEXT
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_render_jobs_proof_pack
    ON predicate.render_jobs (proof_pack_id);

CREATE INDEX IF NOT EXISTS idx_render_jobs_inputs_hash
    ON predicate.render_jobs (inputs_hash)
    WHERE status = 'COMPLETED';

CREATE INDEX IF NOT EXISTS idx_render_jobs_status
    ON predicate.render_jobs (status)
    WHERE status IN ('QUEUED', 'RUNNING');

-- Audit event type for renders
-- (reuses existing proof_pack_audit_events table)

COMMIT;
