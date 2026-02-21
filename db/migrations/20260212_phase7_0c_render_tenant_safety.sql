-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Enforce tenant-safe render ownership and scoped idempotency guarantees.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1/5 render artifact access and tenant isolation
--   - Integrity Risk Addressed: cross-tenant collisions and unauthorized artifact linkage
--
-- Determinism Contract:
--   - program-scoped idempotency must align with runtime ownership semantics.
--   - Constraint/index changes must preserve deterministic job replay behavior.
--
-- Notes:
--   - Migration remains idempotent via IF EXISTS / IF NOT EXISTS clauses.
-- =============================================================================

-- Migration: Phase 7.0C — Tenant Safety for Render Jobs
-- Adds program_id column for ownership enforcement,
-- expands artifact_type CHECK for Phase 7.0E renderers,
-- adds idempotency_key + concurrency/rate columns for Phase 7.0D.
-- Depends on: 20260211_phase7_0a_render_jobs.sql

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add program_id for tenant isolation
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE predicate.render_jobs
    ADD COLUMN IF NOT EXISTS program_id TEXT;

-- Backfill program_id from proof_pack_exports for existing rows
UPDATE predicate.render_jobs rj
   SET program_id = pp.program_id::TEXT
  FROM predicate.proof_pack_exports pp
 WHERE rj.proof_pack_id = pp.id
   AND rj.program_id IS NULL;

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_render_jobs_program_id
    ON predicate.render_jobs (program_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add idempotency_key for duplicate prevention (Phase 7.0D)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE predicate.render_jobs
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

DROP INDEX IF EXISTS predicate.idx_render_jobs_idempotency;

CREATE UNIQUE INDEX IF NOT EXISTS idx_render_jobs_program_idempotency
        ON predicate.render_jobs (program_id, idempotency_key)
        WHERE program_id IS NOT NULL
            AND idempotency_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Expand artifact_type CHECK to include Phase 7.0E renderers
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE predicate.render_jobs
    DROP CONSTRAINT IF EXISTS render_jobs_artifact_type_check;

ALTER TABLE predicate.render_jobs
    ADD CONSTRAINT render_jobs_artifact_type_check
    CHECK (artifact_type IN (
        'defense_packet_pdf',
        'defense_packet_docx',
        'ectd_sequence_zip',
        'se_matrix_pdf',
        'proof_pack_summary_pdf',
        'audit_trail_pdf'
    ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Composite index for program-scoped ownership queries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_render_jobs_program_proof_pack
    ON predicate.render_jobs (program_id, proof_pack_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Index for TTL cleanup of old failed jobs (Phase 7.0D)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_render_jobs_cleanup
    ON predicate.render_jobs (status, completed_at)
    WHERE status = 'FAILED';

COMMIT;
