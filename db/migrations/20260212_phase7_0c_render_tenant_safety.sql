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

CREATE UNIQUE INDEX IF NOT EXISTS idx_render_jobs_idempotency
    ON predicate.render_jobs (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

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
