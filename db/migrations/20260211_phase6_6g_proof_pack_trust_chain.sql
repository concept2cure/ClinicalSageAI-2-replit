-- Migration: Phase 6.6.G — Submission-Grade Proof Pack Trust Chain
-- Expands proof_pack_exports with full contract hashes, proof_pack_id keying,
-- drift severity, block_download, and idempotency constraint.
-- Depends on: 20260211_phase6_6e_proof_pack_exports.sql

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Add new contract hash columns + trust chain fields
-- ─────────────────────────────────────────────────────────────────────────────

-- schema_hash: SHA-256 of the canonical schema.json used at generation time
ALTER TABLE predicate.proof_pack_exports
    ADD COLUMN IF NOT EXISTS schema_hash TEXT;

-- generator_version: Git SHA or build version of the service at persist time
ALTER TABLE predicate.proof_pack_exports
    ADD COLUMN IF NOT EXISTS generator_version TEXT NOT NULL DEFAULT 'unknown';

-- zip_manifest_hash: SHA-256 of manifest.json excluding itself (content-addressed)
ALTER TABLE predicate.proof_pack_exports
    ADD COLUMN IF NOT EXISTS zip_manifest_hash TEXT;

-- block_download: server-authoritative download blocking flag
ALTER TABLE predicate.proof_pack_exports
    ADD COLUMN IF NOT EXISTS block_download BOOLEAN NOT NULL DEFAULT false;

-- drift_severity: persisted drift level at last replay
ALTER TABLE predicate.proof_pack_exports
    ADD COLUMN IF NOT EXISTS drift_severity VARCHAR(10)
    CHECK (drift_severity IS NULL OR drift_severity IN ('NONE', 'LOW', 'MED', 'HIGH'));

-- request_id for traceability
ALTER TABLE predicate.proof_pack_exports
    ADD COLUMN IF NOT EXISTS request_id TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Expand audit events with contract hashes snapshot + request_id
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE predicate.proof_pack_audit_events
    ADD COLUMN IF NOT EXISTS risk_codes_lock_hash TEXT;

ALTER TABLE predicate.proof_pack_audit_events
    ADD COLUMN IF NOT EXISTS schema_hash TEXT;

ALTER TABLE predicate.proof_pack_audit_events
    ADD COLUMN IF NOT EXISTS generator_version TEXT;

ALTER TABLE predicate.proof_pack_audit_events
    ADD COLUMN IF NOT EXISTS request_id TEXT;

ALTER TABLE predicate.proof_pack_audit_events
    ADD COLUMN IF NOT EXISTS contract_snapshot JSONB;

-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotency constraint: same inputs → same proof pack
-- Must DROP old unique on manifest_hash first (if exists), then add new.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old single-column unique constraint on manifest_hash
ALTER TABLE predicate.proof_pack_exports
    DROP CONSTRAINT IF EXISTS proof_pack_exports_manifest_hash_key;

-- Multi-column idempotency index (spec requirement)
CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_pack_idempotency
    ON predicate.proof_pack_exports(
        program_id, subject_hash, manifest_hash,
        risk_vocab_hash, risk_code_lock_hash,
        COALESCE(schema_hash, '')
    );

-- Index for download lookups by id + program
CREATE INDEX IF NOT EXISTS idx_proof_pack_exports_id_program
    ON predicate.proof_pack_exports(id, program_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN predicate.proof_pack_exports.schema_hash IS
    'Phase 6.6.G — SHA-256 of schema.json at persist time. Contract mismatch blocks download.';

COMMENT ON COLUMN predicate.proof_pack_exports.generator_version IS
    'Phase 6.6.G — Git SHA or build version at persist time. Prevents "same ID, new runtime" drift.';

COMMENT ON COLUMN predicate.proof_pack_exports.zip_manifest_hash IS
    'Phase 6.6.G — SHA-256 of manifest.json content (excluding itself). Content-addressed identity.';

COMMENT ON COLUMN predicate.proof_pack_exports.block_download IS
    'Phase 6.6.G — Server-authoritative download block flag. TRUE if HIGH drift detected.';

COMMENT ON COLUMN predicate.proof_pack_exports.drift_severity IS
    'Phase 6.6.G — Last computed drift severity: NONE, LOW, MED, HIGH.';

COMMIT;
