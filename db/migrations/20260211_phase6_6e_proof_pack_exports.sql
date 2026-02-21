-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Persist proof-pack export metadata and audit events for reproducible submissions.
--
-- eCTD/CTD Context:
--   - Module(s): Module 1/2/5 submission evidence and export audit trail
--   - Integrity Risk Addressed: non-reproducible ZIP artifacts and missing export lineage
--
-- Determinism Contract:
--   - Export manifests/payload snapshots must remain hash-stable and replayable.
--   - Any schema-impacting export contract change requires governed hash/version updates.
--
-- Notes:
--   - Event log remains append-only with explicit actor/action attribution.
-- =============================================================================

-- Migration: Phase 6.6.E — proof_pack_exports table
-- Enterprise artifact: downloadable ZIP proof pack keyed by manifest_hash.
-- Stores metadata + artifact index; actual artifacts are assembled on-demand
-- from the defense_packets table (no duplicate blob storage).
-- Depends on: predicate.defense_packets (20260211_phase6_6d_defense_packets.sql)

-- ─────────────────────────────────────────────────────────────────────────────
-- Proof Pack Exports (enterprise-grade evidence binder metadata)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS predicate.proof_pack_exports (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id              UUID NOT NULL,
    subject_hash            TEXT NOT NULL,
    manifest_hash           TEXT NOT NULL,

    -- Proof provenance
    risk_vocab_hash         TEXT NOT NULL,
    risk_code_lock_hash     TEXT NOT NULL,

    -- Stored JSON blobs (not regenerated on download)
    manifest_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
    artifact_index_json     JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- ZIP metadata
    zip_hash                TEXT,                       -- SHA-256 of last assembled ZIP
    zip_size_bytes          BIGINT,

    -- Lifecycle
    status                  VARCHAR(30) NOT NULL DEFAULT 'CREATED'
                            CHECK (status IN ('CREATED', 'ASSEMBLED', 'FAILED')),
    downloaded_count        INT NOT NULL DEFAULT 0,
    last_downloaded_at      TIMESTAMP WITH TIME ZONE,
    last_downloaded_by      TEXT,

    -- Audit
    created_by              TEXT NOT NULL DEFAULT 'system',
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- FK to defense_packets (the source of truth)
    defense_packet_id       UUID REFERENCES predicate.defense_packets(id) ON DELETE SET NULL,

    UNIQUE (manifest_hash)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit event log for proof pack actions (append-only, immutable)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS predicate.proof_pack_audit_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_pack_id           UUID REFERENCES predicate.proof_pack_exports(id) ON DELETE SET NULL,
    program_id              UUID NOT NULL,
    user_id                 TEXT NOT NULL DEFAULT 'system',
    action                  TEXT NOT NULL,
    subject_hash            TEXT,
    manifest_hash           TEXT,
    risk_vocab_hash         TEXT,
    metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_proof_pack_exports_program
    ON predicate.proof_pack_exports(program_id);
CREATE INDEX IF NOT EXISTS idx_proof_pack_exports_manifest
    ON predicate.proof_pack_exports(manifest_hash);
CREATE INDEX IF NOT EXISTS idx_proof_pack_exports_created
    ON predicate.proof_pack_exports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proof_pack_audit_events_pack
    ON predicate.proof_pack_audit_events(proof_pack_id);
CREATE INDEX IF NOT EXISTS idx_proof_pack_audit_events_program
    ON predicate.proof_pack_audit_events(program_id);
CREATE INDEX IF NOT EXISTS idx_proof_pack_audit_events_action
    ON predicate.proof_pack_audit_events(action);

-- ─────────────────────────────────────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE predicate.proof_pack_exports IS
    'Phase 6.6.E — Enterprise proof pack metadata. Stores frozen manifest/payload JSON and artifact index. ZIP is assembled on-demand from these stored artifacts (never regenerated).';

COMMENT ON COLUMN predicate.proof_pack_exports.manifest_hash IS
    'SHA-256 of canonicalized manifest JSON. Unique key for retrieval. Same value as defense_packets.manifest_hash.';

COMMENT ON COLUMN predicate.proof_pack_exports.artifact_index_json IS
    'Array of {filename, sha256, size_bytes, mime_type} for every file included in the proof-pack ZIP.';

COMMENT ON TABLE predicate.proof_pack_audit_events IS
    'Phase 6.6.E4 — Append-only Part 11 audit events for proof pack lifecycle. Actions: PROOF_PACK_ACCESSED, PROOF_PACK_DOWNLOADED, PROOF_PACK_REPLAYED, PROOF_PACK_DRIFT_DETECTED.';
